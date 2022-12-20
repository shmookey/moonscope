//import {vec3} from "gl-matrix"
import type {GPUContext} from './gpu'
import type {Atlas, Camera, FirstPersonCamera, DrawCallDescriptor, Entity, InstanceAllocator, Mat4, Renderable, ResourceBundle, MeshStore, Model} from './types'
import type {SkyboxState} from './skybox.js'
import * as Skybox from './skybox.js'
import * as SceneMgr from './scene.js'
import {loadShader} from './gpu.js'
import {mat4} from '../../node_modules/gl-matrix/esm/index.js'
import {createAtlas} from './atlas.js'
import {createCamera, createFirstPersonCamera, getCameraViewMatrix} from './camera.js'
import {loadResourceBundle} from './resource.js'
import {addInstance, createInstanceAllocator, registerAllocation} from './instance.js'
import {INSTANCE_BLOCK_SIZE, INSTANCE_INDEX_SIZE, UNIFORM_BUFFER_FLOATS, VERTEX_SIZE} from './constants.js'
import {createMeshStore, getMeshByName} from './mesh.js'


export type Scene = {
  skybox: SkyboxState,
  entities: Entity[],
  cameras: Camera[],
  firstPersonCamera: FirstPersonCamera,
}

export type RendererState = {
  viewMatrix: Mat4,
  uniformData: Float32Array,
  mainBindGroup: GPUBindGroup,
  mainBindGroupLayout: GPUBindGroupLayout,
  mainUniformBuffer: GPUBuffer,
  mainSampler: GPUSampler,
  mainPipeline: GPURenderPipeline,
  pipelineLayout: GPUPipelineLayout,
  atlas: Atlas,
  bundle: ResourceBundle,
  instanceAllocator: InstanceAllocator,
  meshStore: MeshStore,
  drawCalls: DrawCallDescriptor[],
  models: Model[],
  nextModelId: number,
  nextDrawCallId: number,
}

const UNIFORM_BUFFER_LENGTH = 2 * 4*4*4
const tempInstanceData = new Float32Array(INSTANCE_BLOCK_SIZE/4)

export async function createScene(
    uniformBuffer: GPUBuffer,
    gpu: GPUContext): Promise<Scene> {

  const skybox = await Skybox.create(uniformBuffer, gpu)
  const defaultCamera = createCamera(gpu.aspect)
  const firstPersonCamera = createFirstPersonCamera()

  return {
    cameras: [defaultCamera],
    entities: [],
    skybox,
    firstPersonCamera,
  }
}

export async function createRenderer(
    presentationFormat: GPUTextureFormat,
    gpu: GPUContext): Promise<RendererState> {

  const uniformData = new Float32Array(UNIFORM_BUFFER_FLOATS)
  const viewMatrix = mat4.create()
  const atlas = createAtlas(gpu.device, [4096, 4096], 1, 'rgba8unorm', 6)
  const meshStore = createMeshStore(10000, VERTEX_SIZE, gpu.device)
  const bundle = await loadResourceBundle('/assets/bundle.json', atlas, meshStore, gpu.device)
  const instanceAllocator = createInstanceAllocator(gpu.device, 5000)
  const mainBindGroupLayout = SceneMgr.createMainBindGroupLayout(gpu.device)
  const mainSampler = SceneMgr.createMainSampler(gpu.device)
  const mainUniformBuffer = SceneMgr.createMainUniformBuffer(gpu.device)
  const mainBindGroup = SceneMgr.createMainBindGroup(
    mainBindGroupLayout, 
    mainUniformBuffer, 
    instanceAllocator.storageBuffer,
    atlas,
    mainSampler,
    gpu.device)
  const pipelineLayout = SceneMgr.createMainPipelineLayout(
    mainBindGroupLayout,
    gpu.device)
  const mainPipeline = await SceneMgr.createMainPipeline(
    pipelineLayout,
    presentationFormat,
    gpu.device)

  return {
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
    state: RendererState): number {
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
    state: RendererState,
    device: GPUDevice): number {
  const model = state.models[modelId]
  tempInstanceData.set(modelMatrix)
  const instanceId = addInstance(
    model.allocationId, 
    tempInstanceData, 
    device, 
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
    state: RendererState, 
    pass: GPURenderPassDescriptor, 
    gpu: GPUContext) {

  // Todo: only update if camera is dirty
  getCameraViewMatrix(state.viewMatrix, cam)
  state.uniformData.set(state.viewMatrix, 0)
  state.uniformData.set(cam.projection, 16)
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

  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

export function renderFrame(scene: Scene, state: RendererState, gpu: GPUContext) {
  (gpu.renderPassDescriptor as any).colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView()
  
  renderView(scene.cameras[0], scene, state, gpu.renderPassDescriptor, gpu)
}
