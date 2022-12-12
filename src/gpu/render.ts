//import {vec3} from "gl-matrix"
import type {GPUContext} from './gpu'
import type {Camera} from './camera'
import type {Mat4, Renderable} from './types'
import type {SkyboxState} from './skybox.js'
import * as camera from './camera.js'
import * as Skybox from './skybox.js'
import {loadShader} from './gpu.js'
import {mat4} from "../../node_modules/gl-matrix/esm/index.js"

export type Entity = {
  
}

export type Scene = {
  skybox: SkyboxState,
  entities: Entity[],
  cameras: Camera[],
  uniformData: Float32Array,
  uniformBuffer: GPUBuffer,
}

export type RendererState = {
  scene: Scene,
  lastCamera: Camera,
  viewMatrix: Mat4,
}

const UNIFORM_BUFFER_LENGTH = 2 * 4*4*4

export async function createScene(gpu: GPUContext): Promise<Scene> {
  const uniformData = new Float32Array(4*4*2)
  const uniformBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: UNIFORM_BUFFER_LENGTH,
  })
  const skybox = await Skybox.create(uniformBuffer, gpu)
  const defaultCamera = camera.create(gpu.aspect)
  //gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
  return {
    cameras: [defaultCamera],
    entities: [],
    uniformData,
    uniformBuffer,
    skybox
  }
}

export function createRenderer(scene: Scene, gpu: GPUContext): RendererState {
  const defaultCamera = scene.cameras[0]
  return {
    scene,
    lastCamera: defaultCamera,
    viewMatrix: mat4.create(),
  }
}

/** Render the scene from the view of a given camera. */
export function renderView(cam: Camera, scene: Scene, state: RendererState, pass: GPURenderPassDescriptor, gpu: GPUContext) {
  // If the camera has changed, update uniforms
  if(cam.isDirty || cam != state.lastCamera) {
    camera.viewMatrix(state.viewMatrix, cam)
    scene.uniformData.set(state.viewMatrix, 0)
    scene.uniformData.set(cam.projection, 16)
    gpu.device.queue.writeBuffer(scene.uniformBuffer, 0, scene.uniformData)
    cam.isDirty = false
  }

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(pass)
  
  passEncoder.setPipeline(scene.skybox.pipeline)
  passEncoder.setVertexBuffer(0, scene.skybox.vertexBuffer)
  passEncoder.setBindGroup(0, scene.skybox.uniformBindGroup)
  passEncoder.draw(scene.skybox.vertexCount, 1, 0, 0)

  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

export function renderFrame(scene: Scene, state: RendererState, gpu: GPUContext) {
  (gpu.renderPassDescriptor as any).colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView()
  
  renderView(scene.cameras[0], scene, state, gpu.renderPassDescriptor, gpu)
}
