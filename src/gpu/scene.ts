import type {GPUContext} from "./gpu.js"
import type {Camera, FirstPersonCamera, Mat4, Scene} from "./types.js"
import * as Skybox from './skybox.js'
import {createCamera, createFirstPersonCamera, getCameraViewMatrix} from './camera.js'




export async function createScene(
  uniformBuffer: GPUBuffer,
  gpu: GPUContext): Promise<Scene> {

  const skybox = await Skybox.create(uniformBuffer, gpu)
  const defaultCamera = createCamera(gpu.aspect)
  const firstPersonCamera = createFirstPersonCamera()
  
  return {
    cameras: [defaultCamera],
    nodes: [],
    skybox,
    firstPersonCamera,
  }
}
