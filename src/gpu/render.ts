//import {vec3} from "gl-matrix"
import type {GPUContext} from './gpu'
import type {Atlas, Camera, FirstPersonCamera, DrawCallDescriptor, Entity, InstanceAllocator, Mat4, Renderable, ResourceBundle, MeshStore, Model, Scene, Renderer, SceneGraph} from './types'
import * as PipelineMgr from './pipeline.js'
import {mat4} from 'gl-matrix'
import {createAtlas} from './atlas.js'
import {loadResourceBundle} from './resource.js'
import {addInstance, createInstanceAllocator, registerAllocation} from './instance.js'
import {INSTANCE_BLOCK_SIZE, INSTANCE_INDEX_SIZE, UNIFORM_BUFFER_FLOATS, VERTEX_SIZE} from './constants.js'
import {createMeshStore, getMeshByName} from './mesh.js'
import {getCameraViewMatrix} from './camera.js'



const UNIFORM_BUFFER_LENGTH = 2 * 4*4*4
const tempInstanceData = new Float32Array(INSTANCE_BLOCK_SIZE/4)


export async function createRenderer(
    presentationFormat: GPUTextureFormat,
    gpu: GPUContext,
    instanceStorageCapacity: number     = 5000,
    vertexStorageCapacity: number       = 10000,
    atlasSize: [number, number, number] = [4096, 4096, 1],
    atlasFormat: GPUTextureFormat       = 'rgba8unorm',
    atlasMipLevels: number              = 6,
    ): Promise<Renderer> {
  
  const outputSize: [number,number] = [gpu.presentationSize.width, gpu.presentationSize.height]
  const uniformData = new Float32Array(UNIFORM_BUFFER_FLOATS)
  const viewMatrix = mat4.create() as Mat4
  const atlas = createAtlas(gpu.device, atlasSize, atlasFormat, atlasMipLevels)
  const meshStore = createMeshStore(vertexStorageCapacity, VERTEX_SIZE, gpu.device)
  const bundle = await loadResourceBundle('/assets/bundle.json', atlas, meshStore, gpu.device)
  const instanceAllocator = createInstanceAllocator(gpu.device, instanceStorageCapacity)
  const mainBindGroupLayout = PipelineMgr.createMainBindGroupLayout(gpu.device)
  const mainSampler = PipelineMgr.createMainSampler(gpu.device)
  const mainUniformBuffer = PipelineMgr.createMainUniformBuffer(gpu.device)
  const mainBindGroup = PipelineMgr.createMainBindGroup(
    mainBindGroupLayout, 
    mainUniformBuffer, 
    instanceAllocator.storageBuffer,
    atlas,
    mainSampler,
    gpu.device)
  const pipelineLayout = PipelineMgr.createMainPipelineLayout(
    mainBindGroupLayout,
    gpu.device)
  const mainPipeline = await PipelineMgr.createMainPipeline(
    pipelineLayout,
    presentationFormat,
    gpu.device)
  const depthTexture = gpu.device.createTexture({
    size: outputSize,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const depthTextureView = depthTexture.createView()


  return {
    outputSize,
    uniformData,
    viewMatrix,
    mainBindGroup,
    mainBindGroupLayout,
    mainUniformBuffer,
    mainSampler,
    mainPipeline,
    pipelineLayout,
    atlas,
    bundle,
    instanceAllocator,
    meshStore,
    drawCalls: [],
    models: [],
    nextModelId: 0,
    nextDrawCallId: 0,
    device: gpu.device,
    depthTexture,
    depthTextureView,
  }
}

/** Register a model with the renderer.
 * 
 * Returns the model id.
 */
export function registerModel(
    name: string,
    meshName: string,
    maxInstances: number,
    state: Renderer): number {
  const id = state.nextModelId
  const allocationId = registerAllocation(maxInstances, state.instanceAllocator)
  const mesh = getMeshByName(meshName, state.meshStore)
  const drawCallId = state.nextDrawCallId
  const model = { 
    id, 
    name, 
    meshId: mesh.id, 
    allocationId,
    drawCallId,
  }
  const drawCall: DrawCallDescriptor = {
    id:              drawCallId,
    label:           `DrawCall#${drawCallId}=${name}`,
    vertexBuffer:    state.meshStore.vertexBuffer,
    vertexPointer:   mesh.vertexPointer,
    vertexCount:     mesh.vertexCount,
    instanceBuffer:  state.instanceAllocator.instanceBuffer,
    instancePointer: state.instanceAllocator.allocations[allocationId].instanceIndex * 4,
    instanceCount:   0,
    bindGroup:       state.mainBindGroup,
    pipeline:        state.mainPipeline,
  }

  state.nextModelId++
  state.nextDrawCallId++
  state.models.push(model)
  state.drawCalls.push(drawCall)
  return id
}

/** Create an instance of a model.
 * 
 * Returns the instance ID.
 */
export function createInstance(
    modelMatrix: Mat4,
    modelId: number,
    state: Renderer): number {
  const model = state.models[modelId]
  tempInstanceData.set(modelMatrix)
  const instanceId = addInstance(
    model.allocationId, 
    tempInstanceData, 
    state.device, 
    state.instanceAllocator
  )
  const drawCall = state.drawCalls[model.drawCallId]
  drawCall.instanceCount = state.instanceAllocator.allocations[model.allocationId].numInstances
  return instanceId
}

/** Render the scene from the view of a given camera. */
export function renderView(
    cam: Camera, 
    scene: Scene, 
    sceneGraph: SceneGraph,
    state: Renderer, 
    pass: GPURenderPassDescriptor, 
    gpu: GPUContext) {

  // Todo: only update if camera is dirty
  getCameraViewMatrix(state.viewMatrix, cam)
  state.uniformData.set(sceneGraph.views.default.viewMatrix, 0)
  state.uniformData.set(sceneGraph.views.default.projection, 16)
  gpu.device.queue.writeBuffer(state.mainUniformBuffer, 0, state.uniformData)
  cam.isDirty = false

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(pass)
  
  passEncoder.setPipeline(scene.skybox.pipeline)
  passEncoder.setVertexBuffer(0, scene.skybox.vertexBuffer)
  passEncoder.setBindGroup(0, scene.skybox.uniformBindGroup)
  passEncoder.draw(scene.skybox.vertexCount, 1, 0, 0)

  passEncoder.setPipeline(state.mainPipeline)
  passEncoder.setBindGroup(0, state.mainBindGroup)
  for(let drawCall of state.drawCalls) {
    // todo: optimise rebinding
    const {vertexBuffer, vertexPointer, instanceBuffer, instancePointer} = drawCall 
    const verticesLength = drawCall.vertexCount * VERTEX_SIZE
    const instancesLength = drawCall.instanceCount * INSTANCE_INDEX_SIZE
    passEncoder.setVertexBuffer(0, vertexBuffer, vertexPointer, verticesLength)
    passEncoder.setVertexBuffer(1, instanceBuffer, instancePointer, instancesLength)
    passEncoder.draw(drawCall.vertexCount, drawCall.instanceCount, 0, 0)
  }
  for(let call of sceneGraph.drawCalls) {
    if(call.instanceCount === 0)
      continue
    const {vertexBuffer, vertexPointer, instanceBuffer, instancePointer} = call 
    const verticesLength = call.vertexCount * VERTEX_SIZE
    const instancesLength = call.instanceCount * INSTANCE_INDEX_SIZE
    passEncoder.setVertexBuffer(0, vertexBuffer, vertexPointer, verticesLength)
    passEncoder.setVertexBuffer(1, instanceBuffer, instancePointer, instancesLength)
    passEncoder.draw(call.vertexCount, call.instanceCount, 0, 0)
  }

  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

// todo: don't pass in a scenegraph, make the scenegraph issue draw calls?
export function renderFrame(scene: Scene, sceneGraph: SceneGraph, state: Renderer, gpu: GPUContext) {
  (gpu.renderPassDescriptor as any).colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView()
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
}
