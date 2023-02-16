import type {GPUContext, Mat4, Scene, Renderer, SceneGraph, 
  PipelineStore, ShaderStore, View} from './types'
import {createPipelineLayouts, createMainSampler,
  createMainUniformBuffer, createForwardRenderPipeline} from './pipeline.js'
import {mat4, glMatrix} from 'gl-matrix'
import {createAtlas} from './atlas.js'
import {createInstanceAllocator} from './instance.js'
import {INDEX_SIZE, INSTANCE_INDEX_SIZE, UNIFORM_BUFFER_FLOATS, 
  VERTEX_SIZE} from './constants.js'
import {createMeshStore} from './mesh.js'
import {prepareForwardRender, prepareShadowRender, setSceneView} from './scene.js'
import {updateLightingBuffer} from './lighting.js'
import { createMaterialState } from './material.js'
import { createMetaMaterialState } from './metamaterial.js'
import { createShadowMapper } from './shadow.js'
glMatrix.setMatrixArrayType(Array)


export async function createRenderer(
    gpu: GPUContext,
    instanceStorageCapacity: number     = 5000,
    vertexStorageCapacity: number       = 20000,
    indexStorageCapacity: number        = 50000,
    atlasCapacity: number               = 1000,
    atlasSize: [number, number, number] = [8192, 8192, 1],
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
  const shadowMapper = createShadowMapper(16, [1024, 1024], gpu.device)
  const pipelineLayouts = createPipelineLayouts(shadowMapper.bindGroupLayout, gpu.device)
  const atlas = createAtlas(
    atlasCapacity, 
    atlasSize, 
    atlasFormat, 
    atlasMipLevels, 
    gpu.device)
  const metaMaterials = createMetaMaterialState(
    shaders,
    pipelineLayouts,
    gpu.presentationFormat,
    msaaCount,
    'depth24plus',
    gpu.device)
  const materials = createMaterialState(
    materialsCapacity, 
    metaMaterials,
    atlas, 
    gpu.device)
  const meshStore = createMeshStore(
    vertexStorageCapacity, 
    indexStorageCapacity, 
    VERTEX_SIZE, 
    INDEX_SIZE, 
    gpu.device)
  
  const instanceAllocator = createInstanceAllocator(gpu.device, instanceStorageCapacity)
  const mainSampler = createMainSampler(gpu.device)
  const mainUniformBuffer = createMainUniformBuffer(gpu.device)

  const depthTexture = gpu.device.createTexture({
    label:       'main-depth-texture',
    size:        outputSize,
    format:      'depth24plus',
    sampleCount: msaaCount,
    usage:       GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const depthTextureView = depthTexture.createView()

  return {
    outputSize,
    uniformData,
    viewMatrix,
    mainUniformBuffer,
    mainSampler,
    pipelineLayouts,
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
    metaMaterials,
    shadowMapper,
  }
}

/** Render the scene from the given view. */
export function renderView(
    sceneGraph: SceneGraph,
    state:      Renderer, 
    pass:       GPURenderPassDescriptor, 
    gpu:        GPUContext) {

  // Todo: only update if camera is dirty
  //getCameraViewMatrix(state.viewMatrix, cam)
  //state.uniformData.set(sceneGraph.views.default.viewMatrix, 0)
  //state.uniformData.set(sceneGraph.views.default.projection, 16)
  //gpu.device.queue.writeBuffer(state.mainUniformBuffer, 0, state.uniformData)
  
  //cam.isDirty = false

  

  renderDepthPass(sceneGraph)

  const commandEncoder = gpu.device.createCommandEncoder()
  prepareForwardRender(sceneGraph)
  //updateLightingBuffer(sceneGraph.lightingState)
  
  gpu.renderPassDescriptor.depthStencilAttachment = {
    view: state.depthTextureView,
    depthClearValue: 1.0,
    depthStoreOp: 'store',
    depthLoadOp: 'clear',
//    stencilClearValue: 0,
//    stencilStoreOp: 'store',
//    stencilLoadOp: 'clear',
  }
  const passEncoder = commandEncoder.beginRenderPass(pass)
  
  //passEncoder.setPipeline(scene.skybox.pipeline)
  //passEncoder.setVertexBuffer(0, scene.skybox.vertexBuffer)
  //passEncoder.setBindGroup(0, scene.skybox.uniformBindGroup)
  //passEncoder.draw(scene.skybox.vertexCount, 1, 0, 0)
  
  for(let call of sceneGraph.forwardDrawCalls) {
    if(call.instanceCount === 0)
      continue
    const {vertexBuffer, instanceBuffer, instancePointer} = call 
    const instancesLength = call.instanceCount * INSTANCE_INDEX_SIZE
    passEncoder.setPipeline(call.metaMaterial.pipelines.forward)
    for(let i = 0; i < call.bindGroups.length; i++) {
      if(call.bindGroups[i])
        passEncoder.setBindGroup(i, call.bindGroups[i])
    }
    passEncoder.setVertexBuffer(0, vertexBuffer)
    passEncoder.setVertexBuffer(1, instanceBuffer, instancePointer, instancesLength)
    passEncoder.setIndexBuffer(call.indexBuffer, 'uint32')
    passEncoder.drawIndexed(call.indexCount, call.instanceCount, call.indexOffset, 0, 0)
  }

  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

export function renderDepthPass(
    scene:          SceneGraph): void {
  
  const device = scene.renderer.device
  const cameraView = scene.activeView
  for(let shadowMap of scene.renderer.shadowMapper.slots) {
    if(!shadowMap)
      continue
    const commandEncoder = device.createCommandEncoder()
    setSceneView(scene.views['shadow-caster-1'], scene)
    prepareShadowRender(cameraView, scene)
    const passEncoder = commandEncoder.beginRenderPass(shadowMap.renderPass)
    for(let call of scene.forwardDrawCalls) {
      if(call.instanceCount === 0)
        continue
      const {vertexBuffer, instanceBuffer, instancePointer} = call 
      const instancesLength = call.instanceCount * INSTANCE_INDEX_SIZE
      passEncoder.setPipeline(call.metaMaterial.pipelines.shadow)
      for(let i = 0; i < call.bindGroups.length-1; i++) {
        if(call.bindGroups[i])
          passEncoder.setBindGroup(i, call.bindGroups[i])
      }
      passEncoder.setVertexBuffer(0, vertexBuffer)
      passEncoder.setVertexBuffer(1, instanceBuffer, instancePointer, instancesLength)
      passEncoder.setIndexBuffer(call.indexBuffer, 'uint32')
      passEncoder.drawIndexed(call.indexCount, call.instanceCount, call.indexOffset, 0, 0)
    }
    passEncoder.end()
    device.queue.submit([commandEncoder.finish()])
  }
  setSceneView(cameraView, scene)
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
  

  
  renderView(sceneGraph, state, gpu.renderPassDescriptor, gpu)
  gpu.renderPassDescriptor.depthStencilAttachment = undefined
//}, 0)
}

export async function makeForwardRenderPipeline(
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

  const pipeline = createForwardRenderPipeline(
    name, 
    renderer.shaders[vertexShaderPath], 
    renderer.shaders[fragmentShaderPath], 
    renderer.pipelineLayouts, 
    renderer.context.presentationFormat, 
    renderer.device,
    enableDepthBuffer,
    renderer.msaaCount,
  )
  renderer.pipelines[name] = pipeline
}

