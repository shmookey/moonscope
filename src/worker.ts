import type { InitMessage, InputState, ErrorMessage, Message, WorkerState, FrameStats, QueryMessage, QueryResultMessage, QueryResult } from './types'
import type { Mat4, ErrorType, MatrixDescriptor, Quat, CameraNode, GPUContext, Renderable, SceneGraph } from './ratite/types'
import { initGPU } from './ratite/gpu.js'
import { createRenderer, renderFrame } from './ratite/render.js'
import { loadResourceBundle } from './ratite/resource.js'
import { createScene, getNodeByName, setDirty, setTransform } from './ratite/scene.js'
import { createTelescope, defaultTelescopeDescriptor } from './telescope.js'
import { applyFirstPersonCamera, moveFirstPersonCameraForward, moveFirstPersonCameraRight, moveFirstPersonCameraUpScale, rotateFirstPersonCamera } from './ratite/camera.js'
import {vec3, mat4, quat, glMatrix} from 'gl-matrix'
import { RatiteError } from './ratite/error.js'
import { createDepthMapExporter, exportDepthMapLayer } from './ratite/debug/depth.js'
import {celestialBodyModelMatrix, generateUniverse, Universe} from './universe.js'
import * as GPU from './ratite/gpu.js'
import * as Sky from './sky.js'
import { DirtyFlags } from './ratite/constants.js'
const {sin, cos, random, sqrt, min, max, PI} = Math
glMatrix.setMatrixArrayType(Array)

const MOUSE_SENSITIVITY = 0.001
const MOVEMENT_SPEED = 0.01
const RUN_FACTOR = 5



type SourceSpec = [
  number,  // X
  number,  // Y
  number,  // Brightness
  boolean, // Is "positive" summing source
] 
const sources: SourceSpec[] = []
for(let i=0; i<10; i++) {
  let x = (random()**2) * PI/1.5  // 3 - log(random()*1000)/Math.log(10)
  if(random() > 0.5) x = -x

  let y = (random()**2) * PI/2
  if(random() > 0.5) y = -y

  sources.push([
    x,                  // u
    y,                  // v
    10 + random()*10,        // a
    random() > 0.5,     // light/dark
  ])
}

function* layerGen(): Iterator<Sky.LayerData> {
  let count = 0
  while(true) {
    const angle = random()*2*PI - PI
    const maxFreq = min(500, sqrt(count ** 1.5))
    const freq = max(1.0, random() * maxFreq)
    yield sources.map(([X,Y,A,isPositive]) => {
      let B = isPositive ? 0 : PI
      let phase = freq * (X*cos(angle) + Y*sin(angle)) + B
      return [freq, A, angle, phase]
    })
    count++
  }
}


/** return true to force a repaint. */
function updateWorldState(dT: number, sceneGraph: SceneGraph): boolean {
  const amount = dT * 0.005
  const universe: Universe = state.universe
  //mat4.fromXRotation(tempMat4_1, -amount * universe.localBodies.earth.angularVelocity)
  //mat4.multiply(tempMat4_1, app.earthNode.transform, tempMat4_1)
  //setNodeTransform(app.earthNode, tempMat4_1, sceneGraph)

  //mat4.fromXRotation(tempMat4_1, -amount)
  //mat4.multiply(tempMat4_1, tempMat4_1, app.moonNode.transform)
  //setNodeTransform(app.moonNode, tempMat4_1, sceneGraph)

  //mat4.fromYRotation(tempMat4_1, amount*1)
  //mat4.multiply(tempMat4_1, app.sphereNode.transform, tempMat4_1)
  //setNodeTransform(app.sphereNode, tempMat4_1, sceneGraph)

  //mat4.fromYRotation(tempMat4_1, amount*1)
  //mat4.multiply(tempMat4_1, app.cameraNode.transform, tempMat4_1)
  //setNodeTransform(app.cameraNode, tempMat4_1, sceneGraph)

  return true
}

async function initSkyVis(gpu: GPUContext): Promise<SkyModelState> {
  const visSource = layerGen()
  const visState = await Sky.create(
    1024, // window.visualViewport?.width ?? 1,
    1024, //window.visualViewport?.height ?? 1,
    20 * 2**20,
    sources.length,
    visSource,
    gpu
  )
  const skyEntity = await Sky.createSkyRenderer(visState.texture, gpu)
  gpu.entities.push(skyEntity)
  return { visSource, visState, skyEntity }
}

type SkyModelState = {
  visSource: Iterator<Sky.LayerData, any, undefined>,
  visState: Sky.VisGenState,
  skyEntity: Renderable,
}

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
  depthMapExporter:    null,
  universe:            generateUniverse(100),
}

async function init(opts: InitMessage): Promise<void> {
  if(state.status != 'created')
    return report(new RatiteError('InvalidOperation', 'Worker already initialised.'))

  state.canvas = opts.canvas

  try {
    state.gpu = await initGPU(state.canvas)
  } catch(e) {
    if(e instanceof RatiteError) {
      return report(e)
    }
  }
  console.debug(state.gpu)

  state.renderer = await createRenderer(
    state.gpu,
    5000,  // instance storage capacity
    40000, // vertex storage capacity
  )
  const bundle = await loadResourceBundle('/assets/bundle.json', state.renderer)

  state.legacyScene = await createScene(state.renderer.mainUniformBuffer, state.gpu)
  state.sceneGraph = bundle.scenes[0] //setupSceneGraph(renderer)
  state.mainCamera = state.sceneGraph.activeCamera.node as CameraNode
  const telescopeNode = getNodeByName('telescope', state.sceneGraph)
  state.telescope = createTelescope(telescopeNode, defaultTelescopeDescriptor, state.sceneGraph)
  state.lastPhysicsFrame = performance.now()
  state.status = 'idle'
  state.statsUpdateInterval = opts.statsUpdateInterval
  await state.gpu.device.queue.onSubmittedWorkDone()
  postMessage({type: 'ready'})
  setInterval(updateStats, state.statsUpdateInterval)

  try {
    state.depthMapExporter = createDepthMapExporter(
      state.renderer.shadowMapper.textureArrayView,
      state.renderer.shaders,
      state.gpu.device
    )
  } catch(e) {
    if(e instanceof RatiteError) {
      return report(e)
    }
  }
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

onmessage = async (event: MessageEvent<Message>) => {
 
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
    case 'getState':
      postMessage({type: 'response', correlationId: event.data.id, data: state.sceneGraph.root})
      break
    case 'debugWorker':
      debugger
      break
    case 'getDepthImage':
      const image = await exportDepthMapLayer(0, 0.05, 1, state.depthMapExporter)
      const response = {type: 'response', correlationId: event.data.id, data: image}
      postMessage(response, {transfer: [image]})
      break
    case 'query':
      handleQuery(event.data)
      break
    default:
      report(new RatiteError('InternalError', `Bad event type: ${event.data.type}`))
  }
}

async function handleQuery(queryMessage: QueryMessage): Promise<void> {
  const query = queryMessage.query
  const response: QueryResultMessage = {
    type:          'queryResult',
    id:            nextMessageId++,
    correlationId: queryMessage.id, 
    result:        null,
  }
  let options: WindowPostMessageOptions = {}
  switch(query.queryType) {
  case 'getSceneGraph':
    response.result = {
      queryType:  query.queryType,
      sceneGraph: state.sceneGraph.root,
    }
    break
  case 'getViews':
    response.result = {
      queryType: query.queryType, 
      views:     Object.values(state.sceneGraph.views),
    }
    break
  case 'getLights':
    response.result = {
      queryType: query.queryType,
      lights:    state.sceneGraph.lightingState.lightSources
    }
    break
  case 'getShadowMaps':
    response.result = {
      queryType:  query.queryType, 
      shadowMaps: state.renderer.shadowMapper.slots.map(obj => ({
        id:          obj.id,
        slot:        obj.slot,
        lightSource: obj.lightSource,
        layer:       obj.layer,
        _matrix:     obj._matrix,
      }))
    }
    break
  case 'getShadowMapImage':
    const image = await exportDepthMapLayer(
      query.shadowMapId,
      query.depthMin,
      query.depthMax,
      state.depthMapExporter
    )
    response.result = {
      queryType: query.queryType,
      image:     image,
    }
    options.transfer = [image]
    break
  //default:
  //  report(new RatiteError('NotImplemented', `Unsupported query type: ${query.queryType}`))
  }
  postMessage(response, options)
}



/** Report an error to the controlling thread. */
function report(error: RatiteError, correlationId: number = null): void {
  const obj: ErrorMessage = { 
    id:        nextMessageId++, 
    type:      'error', 
    errorType: error.type,
    message:   error.message,
    error:     error,
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
  setDirty(DirtyFlags.MODEL_VIEW_MATRIX | DirtyFlags.FRUSTUM_TEST, state.mainCamera.root)
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