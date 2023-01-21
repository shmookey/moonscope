import type { InitMessage, InputState, ErrorMessage, Message, WorkerState, FrameStats } from './types'
import type { Mat4, MatrixDescriptor, Quat } from './ratite/types'
import { initGPU } from './ratite/gpu.js'
import { createRenderer, renderFrame } from './ratite/render.js'
import { loadResourceBundle } from './ratite/resource.js'
import { createScene, getNodeByName, setTransform } from './ratite/scene.js'
import { createTelescope, defaultTelescopeDescriptor } from './telescope.js'
import { applyFirstPersonCamera, moveFirstPersonCameraForward, moveFirstPersonCameraRight, moveFirstPersonCameraUpScale, rotateFirstPersonCamera } from './ratite/camera.js'
import {vec3, mat4, quat, glMatrix} from 'gl-matrix'
glMatrix.setMatrixArrayType(Array)

const MOUSE_SENSITIVITY = 0.001
const MOVEMENT_SPEED = 0.01
const RUN_FACTOR = 5

let nextMessageId = 0
let state: WorkerState = {
  status:              'created',
  canvas:              null,
  gpu:                 null,
  sceneGraph:          null,
  legacyScene:         null,
  renderer:            null,
  mainCamera:          null,
  telescope:           null,
  currentFrame:        0,
  frameTimes:          new Array(165).fill(0),
  frameTimesCount:     0,
  frameTimesIndex:     0,
  frameTimesSize:      50,
  lastFrameStart:      0,
  lastPhysicsFrame:    0,
  lastStatsUpdate:     0,
  statsUpdateInterval: 1000,
  fpsLimit:            60,
  gpuReady:            false, 
}

async function init(opts: InitMessage): Promise<void> {
  if(state.status != 'created')
    return report('Worker already initialised.')

  state.canvas = opts.canvas
  state.gpu = await initGPU(state.canvas)

  state.renderer = await createRenderer(
    state.gpu.presentationFormat, 
    state.gpu,
    5000,  // instance storage capacity
    40000, // vertex storage capacity
  )
  const bundle = await loadResourceBundle('/assets/bundle.json', state.renderer)

  state.legacyScene = await createScene(state.renderer.mainUniformBuffer, state.gpu)
  state.sceneGraph = bundle.scenes[0] //setupSceneGraph(renderer)
  state.mainCamera = state.sceneGraph.views.default.camera
  const telescopeNode = getNodeByName('telescope', state.sceneGraph)
  state.telescope = createTelescope(telescopeNode, defaultTelescopeDescriptor, state.sceneGraph)
  state.lastPhysicsFrame = performance.now()
  state.status = 'idle'
  state.statsUpdateInterval = opts.statsUpdateInterval
  await state.gpu.device.queue.onSubmittedWorkDone()
  postMessage({type: 'ready'})
  setInterval(updateStats, state.statsUpdateInterval)
}

async function frame() {
  const frameStart = performance.now()
  const frameTime = frameStart - state.lastFrameStart
  state.lastFrameStart = frameStart
  aTerribleWayOfUpdatingTheCamera_ReallyBad()
  renderFrame(state.legacyScene, state.sceneGraph, state.renderer, state.gpu)
  state.gpuReady = false
  pushFrameTime(frameTime)
  state.currentFrame++

  if(state.status == 'running') {
    const targetFrameTime = 1000 / state.fpsLimit
    const currentFrameTime = performance.now() - frameStart
    const delay = Math.max(0, targetFrameTime - currentFrameTime)
    await state.gpu.device.queue.onSubmittedWorkDone()
    frame()
  }
}

function processInput(input: InputState): void {
  let now = performance.now()
  let dt = now - state.lastPhysicsFrame

  const [dx, dy] = input.mouseMovement
  if(dx != 0 || dy != 0) {
    rotateFirstPersonCamera(MOUSE_SENSITIVITY * dy, MOUSE_SENSITIVITY * dx, state.legacyScene.firstPersonCamera)
    applyFirstPersonCamera(state.legacyScene.firstPersonCamera, state.legacyScene.cameras[0])
    input.mouseMovement[0] = 0
    input.mouseMovement[1] = 0
  }
  const movementSpeed = MOVEMENT_SPEED * (input.keyDown['LeftShift'] ? RUN_FACTOR : 1)

  if(input.keyDown['KeyW'] ) {
    moveFirstPersonCameraForward(-movementSpeed * dt, state.legacyScene.firstPersonCamera)
  } else if(input.keyDown['KeyS'] ) {
    moveFirstPersonCameraForward(movementSpeed * dt, state.legacyScene.firstPersonCamera)
  }
  if(input.keyDown['KeyA'] ) {
    moveFirstPersonCameraRight(-movementSpeed * dt, state.legacyScene.firstPersonCamera)
  } else if(input.keyDown['KeyD']) {
    moveFirstPersonCameraRight(movementSpeed * dt, state.legacyScene.firstPersonCamera)
  }
  if(input.keyDown['KeyQ'] ) {
    moveFirstPersonCameraUpScale(-movementSpeed * dt * 0.1, state.legacyScene.firstPersonCamera)
  } else if(input.keyDown['KeyE']) {
    moveFirstPersonCameraUpScale(movementSpeed * dt * 0.1, state.legacyScene.firstPersonCamera)
  }

  state.lastPhysicsFrame = now
}

onmessage = (event: MessageEvent<Message>) => {
 
  switch(event.data.type) {
    case 'init':
      init(event.data)
      break
    case 'stop':
      if(state.status != 'running')
        return
      state.status = 'idle'
      postMessage({type: 'stopped'})
      break
    case 'start':
      if(state.status != 'idle')
        return
      state.status = 'running'
      postMessage({type: 'started'})
      frame()
      break
    case 'input':
      processInput(event.data.data)
      break
    default:
      report(`Bad event type: ${event.data.type}`)
  }
}

/** Report an error to the controlling thread. */
function report(message: string, correlationId: number = null): void {
  const obj: ErrorMessage = { 
    id:      nextMessageId++, 
    type:    'error', 
    message: message,
  }
  if(correlationId !== null)
    obj.correlationId = correlationId
  postMessage(obj)
}

function pushFrameTime(t: number): void {
  state.frameTimes[state.frameTimesIndex] = t
  state.frameTimesIndex++
  if(state.frameTimesIndex >= state.frameTimesSize)
    state.frameTimesIndex = 0
  if(state.frameTimesCount < state.frameTimesSize)
    state.frameTimesCount++
}

function updateStats(): void {
  //if(state.status != 'running')
  //  return
  const stats = getFrameStats()
  postMessage({
    type: 'info',
    frameStats: stats,
  })
}

/** Get the average, min and max FPS over the last `frameTimesCount` frames. */
function getFrameStats(): FrameStats {
  // First calculate the avg, min and max frame times
  let total = 0          // Total time for all recorded frames 
  let min   = Infinity   // Minimum frame time
  let max   = 0          // Maximum frame time
  for(let i = 0; i < state.frameTimesSize; i++) {
    const idx = i
    const t = state.frameTimes[idx]
    total += t
    if(t < min)
      min = t
    if(t > max)
      max = t
  }
  // Now convert to FPS
  const minFPS = 1000 / max
  const maxFPS = 1000 / min
  const avgFPS = 1000 / (total / state.frameTimesSize)
  return {
    average: avgFPS,
    min:     minFPS,
    max:     maxFPS,
  }
}

/** Get the last frame time. */
function getLastFrameTime(): number {
  if(state.frameTimesCount == 0)
    return 0
  if(state.frameTimesIndex == 0)
    return state.frameTimes[state.frameTimesSize - 1]
  return state.frameTimes[state.frameTimesIndex - 1]
}

const tempMat4_1 = mat4.create() as Mat4
const tempMat4_2 = mat4.create() as Mat4
const tempQ_1 = quat.create() as Quat
const tempMatrixTransform: MatrixDescriptor = {
  type: 'matrix',
  matrix: tempMat4_1,
}
function aTerribleWayOfUpdatingTheCamera_ReallyBad() {
  applyFirstPersonCamera(state.legacyScene.firstPersonCamera, state.legacyScene.cameras[0])
  quat.invert(tempQ_1, state.legacyScene.cameras[0].orientation)
  mat4.fromQuat(tempMat4_1, tempQ_1)
  mat4.fromTranslation(tempMat4_2, state.legacyScene.cameras[0].position)
  mat4.multiply(tempMat4_1, tempMat4_2, tempMat4_1)
  tempMatrixTransform.matrix = tempMat4_1
  setTransform(tempMatrixTransform, state.mainCamera)
}

//const adapter = await navigator.gpu.requestAdapter({
//  powerPreference: 'high-performance',
//})
//
//if(adapter == null)
//  report('Failed to initialise WebGPU: requestAdapter returned null.')
//
//const device = await adapter.requestDevice({
//  //requiredFeatures: ['shader-f16'],
//})
//if(device == null)
//  report('Failed to initialise WebGPU: requestDevice returned null.')
//
//const canvasContext = canvas.getContext('webgpu') as GPUCanvasContext
//canvasContext.configure({
//  device:    device,
//  format:    opts.presentationFormat,
//  alphaMode: 'opaque',
//})
//const msaaTexture: GPUTexture = device.createTexture({
//  size:        opts.presentationSize,
//  format:      opts.presentationFormat,
//  usage:       GPUTextureUsage.RENDER_ATTACHMENT,
//  sampleCount: 1,
//})
//const msaaView: GPUTextureView = msaaTexture.createView()
//const renderPassDescriptor: GPURenderPassDescriptor = {
//  colorAttachments: [{
//    view:       msaaView,
//    clearValue: {r: 0, g: 0, b: 0, a: 1},
//    loadOp:     'clear',
//    storeOp:    'store',
//  }],
//} as GPURenderPassDescriptor
//