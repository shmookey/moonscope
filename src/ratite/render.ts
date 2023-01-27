import type {Camera, GPUContext, Mat4, Scene, Renderer, SceneGraph, 
  PipelineStore, ShaderStore} from './types'
import {createMainBindGroupLayout, createMainPipelineLayout, createMainSampler,
  createMainUniformBuffer, createPipeline} from './pipeline.js'
import {mat4} from 'gl-matrix'
import {createAtlas} from './atlas.js'
import {createInstanceAllocator} from './instance.js'
import {INDEX_SIZE, INSTANCE_INDEX_SIZE, UNIFORM_BUFFER_FLOATS, 
  VERTEX_SIZE} from './constants.js'
import {createMeshStore} from './mesh.js'
import {updateModelViews} from './scene.js'
import {updateLightingBuffer} from './lighting.js'
import { createMaterialState } from './material.js'


export async function createRenderer(
    presentationFormat: GPUTextureFormat,
    gpu: GPUContext,
    instanceStorageCapacity: number     = 5000,
    vertexStorageCapacity: number       = 20000,
    indexStorageCapacity: number        = 50000,
    atlasCapacity: number               = 1000,
    atlasSize: [number, number, number] = [8192, 8192, 3],
    atlasFormat: GPUTextureFormat       = 'rgba8unorm',
    atlasMipLevels: number              = 6,
    msaaCount: number                   = 1,
    materialsCapacity: number           = 100,
    ): Promise<Renderer> {
  
  const outputSize: [number,number] = [gpu.presentationSize.width, gpu.presentationSize.height]
  const uniformData = new Float32Array(UNIFORM_BUFFER_FLOATS)
  const viewMatrix = mat4.create() as Mat4
  const shaders: ShaderStore = {}
  const pipelines: PipelineStore = {}
  const atlas = createAtlas(
    atlasCapacity, 
    atlasSize, 
    atlasFormat, 
    atlasMipLevels, 
    gpu.device)
  const materials = createMaterialState(materialsCapacity, atlas, gpu.device)
  const meshStore = createMeshStore(
    vertexStorageCapacity, 
    indexStorageCapacity, 
    VERTEX_SIZE, 
    INDEX_SIZE, 
    gpu.device)
  const bindGroupLayout = createMainBindGroupLayout(gpu.device)
  const pipelineLayout = createMainPipelineLayout(
    bindGroupLayout,
    gpu.device)
  const instanceAllocator = createInstanceAllocator(gpu.device, instanceStorageCapacity)
  const mainSampler = createMainSampler(gpu.device)
  const mainUniformBuffer = createMainUniformBuffer(gpu.device)

  const depthTexture = gpu.device.createTexture({
    label: 'main-depth-texture',
    size: outputSize,
    format: 'depth24plus',
    sampleCount: msaaCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const depthTextureView = depthTexture.createView()

  return {
    outputSize,
    uniformData,
    viewMatrix,
    bindGroupLayout,
    mainUniformBuffer,
    mainSampler,
    pipelineLayout,
    atlas,
    instanceAllocator,
    meshStore,
    drawCalls: [],
    models: [],
    nextModelId: 0,
    nextDrawCallId: 0,
    device: gpu.device,
    depthTexture,
    depthTextureView,
    context: gpu,
    pipelines,
    shaders,
    msaaCount,
    materials,
  }
}

/** Render the scene from the view of a given camera. */
export function renderView(
    cam:        Camera, 
    scene:      Scene, 
    sceneGraph: SceneGraph,
    state:      Renderer, 
    pass:       GPURenderPassDescriptor, 
    gpu:        GPUContext) {

  // Todo: only update if camera is dirty
  //getCameraViewMatrix(state.viewMatrix, cam)
  state.uniformData.set(sceneGraph.views.default.viewMatrix, 0)
  state.uniformData.set(sceneGraph.views.default.projection, 16)
  gpu.device.queue.writeBuffer(state.mainUniformBuffer, 0, state.uniformData)
  
  //cam.isDirty = false

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(pass)
  
  //passEncoder.setPipeline(scene.skybox.pipeline)
  //passEncoder.setVertexBuffer(0, scene.skybox.vertexBuffer)
  //passEncoder.setBindGroup(0, scene.skybox.uniformBindGroup)
  //passEncoder.draw(scene.skybox.vertexCount, 1, 0, 0)

  for(let call of sceneGraph.drawCalls) {
    if(call.instanceCount === 0)
      continue
    const {vertexBuffer, vertexPointer, instanceBuffer, instancePointer} = call 
    const verticesLength = call.vertexCount * VERTEX_SIZE
    const instancesLength = call.instanceCount * INSTANCE_INDEX_SIZE
    passEncoder.setPipeline(call.pipeline)
    passEncoder.setBindGroup(0, call.bindGroup)
    passEncoder.setVertexBuffer(0, vertexBuffer)
    passEncoder.setVertexBuffer(1, instanceBuffer, instancePointer, instancesLength)
    passEncoder.setIndexBuffer(call.indexBuffer, 'uint32')
    passEncoder.drawIndexed(call.indexCount, call.instanceCount, call.indexOffset, 0, 0)
  }

  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

// todo: don't pass in a scenegraph, make the scenegraph issue draw calls?
export function renderFrame(scene: Scene, sceneGraph: SceneGraph, state: Renderer, gpu: GPUContext) {
  
//  setTimeout(() => {
  if(state.msaaCount > 1) {
    (gpu.renderPassDescriptor as any).colorAttachments[0].resolveTarget = gpu.context
    .getCurrentTexture()
    .createView()
  } else {
    (gpu.renderPassDescriptor as any).colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView()
  }
  updateModelViews(sceneGraph.views.default, sceneGraph)
  updateLightingBuffer(sceneGraph.lightingState)
  
  gpu.renderPassDescriptor.depthStencilAttachment = {
    view: state.depthTextureView,
    depthClearValue: 1.0,
    depthStoreOp: 'store',
    depthLoadOp: 'clear',
//    stencilClearValue: 0,
//    stencilStoreOp: 'store',
//    stencilLoadOp: 'clear',
  }

  
  renderView(scene.cameras[0], scene, sceneGraph, state, gpu.renderPassDescriptor, gpu)
  gpu.renderPassDescriptor.depthStencilAttachment = undefined
//}, 0)
}

export async function makePipeline(
    name:               string,
    vertexShaderPath:   string,
    fragmentShaderPath: string,
    renderer:           Renderer,
    enableDepthBuffer:  boolean = true): Promise<void> {

  if(renderer.pipelines[name])
    throw new Error(`Pipeline ${name} already exists.`)
  if(!(vertexShaderPath in renderer.shaders))
    throw new Error(`Vertex shader ${vertexShaderPath} not loaded.`)
  if(!(fragmentShaderPath in renderer.shaders))
    throw new Error(`Fragment shader ${fragmentShaderPath} not loaded.`)

  const pipeline = createPipeline(
    name, 
    renderer.shaders[vertexShaderPath], 
    renderer.shaders[fragmentShaderPath], 
    renderer.pipelineLayout, 
    renderer.context.presentationFormat, 
    renderer.device,
    enableDepthBuffer,
    renderer.msaaCount,
  )
  renderer.pipelines[name] = pipeline
}

