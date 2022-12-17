//import {vec3} from "gl-matrix"
import type {GPUContext} from './gpu'
import type {Camera} from './camera'
import type {Atlas, DrawCallDescriptor, Entity, InstanceAllocator, Mat4, Renderable, ResourceBundle} from './types'
import type {SkyboxState} from './skybox.js'
import * as camera from './camera.js'
import * as Skybox from './skybox.js'
import * as SceneMgr from './scene.js'
import {loadShader} from './gpu.js'
import {mat4} from '../../node_modules/gl-matrix/esm/index.js'
import {createAtlas} from './atlas.js'
import {loadResourceBundle} from './resource.js'
import {createInstanceAllocator} from './instance.js'
import {INSTANCE_INDEX_SIZE, UNIFORM_BUFFER_FLOATS, VERTEX_SIZE} from './constants.js'


export type Scene = {
  skybox: SkyboxState,
  entities: Entity[],
  cameras: Camera[],
}

export type RendererState = {
  viewMatrix: Mat4,
  uniformData: Float32Array,
  mainBindGroup: GPUBindGroup,
  mainBindGroupLayout: GPUBindGroupLayout,
  mainUniformBuffer: GPUBuffer,
  mainSampler: GPUSampler,
  mainPipeline: GPURenderPipeline,
  atlas: Atlas,
  bundle: ResourceBundle,
  instanceAllocator: InstanceAllocator,
  drawCalls: DrawCallDescriptor[],
}

const UNIFORM_BUFFER_LENGTH = 2 * 4*4*4

export async function createScene(
    uniformBuffer: GPUBuffer,
    gpu: GPUContext): Promise<Scene> {

  const skybox = await Skybox.create(uniformBuffer, gpu)
  const defaultCamera = camera.create(gpu.aspect)

  return {
    cameras: [defaultCamera],
    entities: [],
    skybox
  }
}

export async function createRenderer(
    presentationFormat: GPUTextureFormat,
    gpu: GPUContext): Promise<RendererState> {

  const uniformData = new Float32Array(UNIFORM_BUFFER_FLOATS)
  const viewMatrix = mat4.create()
  const atlas = createAtlas(gpu.device, [4096, 4096], 1, 'rgba8unorm')
  const bundle = await loadResourceBundle('/assets/bundle.json', atlas, gpu.device)
  const instanceAllocator = createInstanceAllocator(gpu.device, 1000)
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
  const mainPipeline = await SceneMgr.createMainPipeline(
    mainBindGroupLayout,
    presentationFormat,
    gpu.device)
  const drawCalls: DrawCallDescriptor[] = []

  return {
    uniformData,
    viewMatrix,
    mainBindGroup,
    mainBindGroupLayout,
    mainUniformBuffer,
    mainSampler,
    mainPipeline,
    atlas,
    bundle,
    instanceAllocator,
    drawCalls,
  }
}

/** Render the scene from the view of a given camera. */
export function renderView(
    cam: Camera, 
    scene: Scene, 
    state: RendererState, 
    pass: GPURenderPassDescriptor, 
    gpu: GPUContext) {

  // Todo: only update if camera is dirty
  camera.viewMatrix(state.viewMatrix, cam)
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
