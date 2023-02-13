import * as GPU from './ratite/gpu.js'
import * as Sky from './sky.js'
import * as Skybox from './ratite/skybox.js'
import * as Render from './ratite/render.js'
import { createInputState } from './input.js'
import { getLayerAsImageBitmap } from './ratite/atlas.js'
import {vec3, mat4, quat, glMatrix} from 'gl-matrix'
import type {Mat4, Renderer, SceneGraph, Quat, ModelNode, MatrixDescriptor, GPUContext, Renderable, ResourceBundleDescriptor, ErrorType} from './ratite/types.js'
import {applyFirstPersonCamera, getCameraViewMatrix, moveFirstPersonCameraForward, moveFirstPersonCameraRight, moveFirstPersonCameraUp, moveFirstPersonCameraUpScale, rotateFirstPersonCamera} from './ratite/camera.js'
import {celestialBodyModelMatrix, generateUniverse, Universe} from './universe.js'
import {getMeshByName} from './ratite/mesh.js'
import {attachNode, createCameraNode, createModelNode, createScene, createSceneGraph, createSceneView, createTransformNode, getNodeByName, registerSceneGraphModel, setTransform} from './ratite/scene.js'
import {loadResourceBundleFromDescriptor} from './ratite/resource.js'
import {Antenna, setAntennaAltitude, setAntennaAzimuth} from './antenna.js'
import Bundle from '../assets/bundle.json'
import { createTelescope, defaultTelescopeDescriptor } from './telescope.js'
import type { ErrorMessage, InfoMessage, InitMessage, Message, ReadyMessage, ResponseMessage } from './types.js'
import { addWorkerEventListener, createWorkerController, debugWorker, getDepthImage, getStateFromWorker, initWorker, sendInputToWorker, startWorker, stopWorker } from './controller.js'
import { RatiteError, explainError, formatErrorType } from './ratite/error.js'
const { sin, cos, log, sqrt, min, max, random, PI } = Math
glMatrix.setMatrixArrayType(Array)

const MOUSE_SENSITIVITY = 0.001
const CAMERA_HEIGHT = 2

const app: any = {};
(window as any).app = app
const tempMat4_1 = mat4.create() as Mat4
const tempMat4_2 = mat4.create() as Mat4
const tempQ_1 = quat.create() as Quat
const tempMatrixTransform: MatrixDescriptor = {
  type: 'matrix',
  matrix: tempMat4_1,
}


async function main(): Promise<void> {
  const elems = {
    canvas:            initCanvas(),
    layerCount:        document.querySelector('#layer-count') as HTMLSpanElement,
    fpsAvg:            document.querySelector('#fps-avg').childNodes[0] as Text,
    fpsMin:            document.querySelector('#fps-min').childNodes[0] as Text,
    fpsMax:            document.querySelector('#fps-max').childNodes[0] as Text,
    errorModal:        document.querySelector('#error-modal') as HTMLDivElement,
    errorModalTitle:   document.querySelector('#error-modal-title') as HTMLDivElement,
    errorModalMessage: document.querySelector('#error-modal-message') as HTMLDivElement,
    errorModalDetails: document.querySelector('#error-modal-details-text') as HTMLDivElement,
  }
  //const gpu = await GPU.initGPU(elems.canvas)
  //const renderer = await Render.createRenderer(
  //  gpu.presentationFormat, 
  //  gpu,
  //  5000,  // instance storage capacity
  //  40000, // vertex storage capacity
  //)
  //const bundle = await loadResourceBundleFromDescriptor(Bundle as unknown as ResourceBundleDescriptor, renderer)

  //let skyModel: SkyModelState = null;
  //(async () => {
  //  skyModel = await initSkyVis(gpu)
  //})()
  const inputState = createInputState()
 
  //app.renderer = renderer

  //const sceneState = await createScene(renderer.mainUniformBuffer, gpu)
  //const sceneGraph = bundle.scenes[0] //setupSceneGraph(renderer)
  //const mainCamera = sceneGraph.views.default.camera
  //const telescopeNode = getNodeByName('telescope', sceneGraph)
  //const telescope = createTelescope(telescopeNode, defaultTelescopeDescriptor, sceneGraph)

  const worker = app.worker = createWorkerController()
  addWorkerEventListener('info', (ev: InfoMessage) => {
    elems.fpsAvg.data = ev.frameStats.average.toFixed(1)
    elems.fpsMin.data = ev.frameStats.min.toFixed(1)
    elems.fpsMax.data = ev.frameStats.max.toFixed(1)
  }, worker)
  addWorkerEventListener('ready', (ev: ReadyMessage) => {
    console.log('worker ready')
    startWorker(worker)
  }, worker)
  addWorkerEventListener('error', (ev: ErrorMessage) => {
    fatalError(ev.errorType, ev.error)
  }, worker)

  const presentationSize = {width: elems.canvas.width, height: elems.canvas.height}
  const offscreen = elems.canvas.transferControlToOffscreen()
  const initMessage: InitMessage = {
    type:                'init',
    id:                  0,
    presentationSize:    presentationSize,
    statsUpdateInterval: 250,
    canvas:              offscreen,
  }
  initWorker(initMessage, worker)
  //const antennaNode = getNodeByName('antenna', sceneGraph)
  //const antennaObject: AntennaObject = {
  //  mount: antennaNode.children[0] as ModelNode,
  //  boom:  antennaNode.children[1] as ModelNode,
  //  dish:  antennaNode.children[1].children[0] as ModelNode,
  //  altitude: 35 * PI/180,
  //  azimuth: 0,
  //}
  //app.antenna = antennaObject

  //sceneState.firstPersonCamera.position[1] = CAMERA_HEIGHT
  //app.sceneGraph = sceneGraph
  
  const layerCountTextNode: Text = elems.layerCount.childNodes[0] as Text
  function addVisibilities(count: number) {
//    if(count > 0) {
//      Sky.applyLayers(count, skyModel.visState, gpu)
//      Sky.updateSkyUniforms(skyModel.visState.layers, skyModel.skyEntity, gpu)
//      Sky.renderSkyToTexture(skyModel.skyEntity, gpu)
//      Skybox.writeSkyboxTextures(skyModel.skyEntity.outputTexture, sceneState.skybox, gpu)
//      layerCountTextNode.data = skyModel.visState.layers.toString()
//    }
//    //GPU.frame(gpu)
//    Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
  }

  document.addEventListener('keydown', async ev => {
    //console.log(ev.code)
    switch(ev.code) {
      case 'KeyI':
        //Sky.getPixels(skyModel.visState, gpu)
        break
      case 'Space':
        //addVisibilities(1)
        startWorker(worker)
        break
      case 'Enter':
        addVisibilities(10)
        break
      case 'Period':
        if(!inputState.mouseCaptured)
          elems.canvas.requestPointerLock()
        
        break
      case 'Escape':
        if(inputState.mouseCaptured) 
          document.exitPointerLock()
        stopWorker(worker)
        break
      case 'Backspace':
        //getAtlasAsImage()
        const image = await getDepthImage(0, worker)
        displayImageBitmap(image)
        break
      case 'KeyZ':
        getStateFromWorker(worker)
        break
      case 'Delete':
        debugWorker(worker)
        break

      default:
        //console.log(ev.code)
        break
    }
  })

  /** Display an imagebitmap in a new window */
  function displayImageBitmap(imageBitmap: ImageBitmap) {
    const canvas = document.createElement('canvas')
    canvas.width = imageBitmap.width
    canvas.height = imageBitmap.height
    canvas.style.width  = `${imageBitmap.width}px`
    canvas.style.height = `${imageBitmap.height}px`
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imageBitmap, 0, 0)
    const container = document.createElement('div')
    container.style.width  = `${imageBitmap.width}px`
    container.style.height = `${imageBitmap.height}px`
    container.style.position = 'absolute'
    container.style.top  = '0px' // `calc(50% - ${imageBitmap.height/2}px)`
    container.style.left = '0px' // `calc(50% - ${imageBitmap.width/2}px)`
    container.appendChild(canvas)
    document.body.appendChild(container)
  }

//  async function getAtlasAsImage() {
//    const imageBitmap = await getLayerAsImageBitmap(0, 3, renderer.atlas, gpu.device)
//    const canvas = document.createElement('canvas')
//    canvas.width = imageBitmap.width
//    canvas.height = imageBitmap.height
//    canvas.style.width  = `${imageBitmap.width}px`
//    canvas.style.height = `${imageBitmap.height}px`
//    const ctx = canvas.getContext('2d')
//    ctx.drawImage(imageBitmap, 0, 0)
//    const container = document.createElement('div')
//    container.style.width  = `${imageBitmap.width}px`
//    container.style.height = `${imageBitmap.height}px`
//    container.style.position = 'absolute'
//    container.style.top  = '0px' // `calc(50% - ${(imageBitmap.height + 10)/2}px)`
//    container.style.left = '0px' //`calc(50% - ${(imageBitmap.width + 10)/2}px)`
//    container.style.backgroundColor = '#000'
//    container.append(canvas)
//    document.body.append(container)
//  }

  const movementSpeed = 0.01
  let lastTime = 0

  document.addEventListener('pointerlockchange', ev => {
    if(document.pointerLockElement == elems.canvas) {
      inputState.mouseCaptured = true
      lastTime = performance.now()
      //requestAnimationFrame(renderFrame)
      startWorker(worker)
    } else {
      inputState.mouseCaptured = false
      stopWorker(worker)
    }
  })

  
  app.Sky = Sky
  app.GPU = GPU
  //app.gpu = gpu
  //app.scene = sceneState
  //app.visState = skyModel
  app.glm = { mat4, vec3, quat }
  
    
  function updateInput() {
    sendInputToWorker(inputState, worker)
    inputState.mouseMovement[0] = 0
    inputState.mouseMovement[1] = 0
    requestAnimationFrame(updateInput)
  }
  requestAnimationFrame(updateInput)
  
  function fatalError(errorType: ErrorType, error: Error): void {
    elems.errorModalTitle.innerText = formatErrorType(errorType)
    elems.errorModalMessage.innerText = explainError(errorType)
    elems.errorModalDetails.innerText = error.message
    elems.errorModal.classList.remove('hidden')
  }


  //fatalError('Failed to start', 'Moonscope failed to start. Please try again later.')

  //let frame: number = 0
  //function renderFrame(currentTime: number): void {
  //  if(inputState.mouseCaptured) {
  //    const dt = currentTime - lastTime
  //    lastTime = currentTime
  //    let cameraMoved = true
  //    let requireRepaint = true
//
  //    //updateUniverse(app.universe, currentTime)
  //    requireRepaint = updateWorldState(dt, sceneGraph)
//
  //    // Handle mouse movement
  //    const [dx, dy] = inputState.mouseMovement
  //    if(dx != 0 || dy != 0) {
  //      rotateFirstPersonCamera(MOUSE_SENSITIVITY * dy, MOUSE_SENSITIVITY * dx, sceneState.firstPersonCamera)
  //      applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
  //      inputState.mouseMovement[0] = 0
  //      inputState.mouseMovement[1] = 0
  //      cameraMoved = true
  //    }
//
  //    // Handle keyboard movement
  //    if( inputState.keyDown['ArrowUp']) {
  //      //moveFirstPersonCameraForward(-movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
  //      //cameraMoved = true
  //      //setAntennaAltitude(antennaObject.altitude + 0.001 * dt, antennaObject)
  //      //requireRepaint = true
  //    } else if( inputState.keyDown['ArrowDown']) {
  //      //moveFirstPersonCameraForward(movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
  //      //cameraMoved = true
  //      //setAntennaAltitude(antennaObject.altitude - 0.001 * dt, antennaObject)
  //      //requireRepaint = true
  //    }
  //    if( inputState.keyDown['ArrowLeft']) {
  //      //setAntennaAzimuth(antennaObject.azimuth - 0.001 * dt, antennaObject)
  //      //requireRepaint = true
  //      //moveFirstPersonCameraRight(-movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
  //      //cameraMoved = true
  //    } else if( inputState.keyDown['ArrowRight']) {
  //      //setAntennaAzimuth(antennaObject.azimuth + 0.001 * dt, antennaObject)
  //      //requireRepaint = true
  //      //moveFirstPersonCameraRight(movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
  //      //cameraMoved = true
  //    }
  //    if(inputState.keyDown['KeyW'] ) {
  //      moveFirstPersonCameraForward(-movementSpeed * dt, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    } else if(inputState.keyDown['KeyS'] ) {
  //      moveFirstPersonCameraForward(movementSpeed * dt, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    }
  //    if(inputState.keyDown['KeyA'] ) {
  //      moveFirstPersonCameraRight(-movementSpeed * dt, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    } else if(inputState.keyDown['KeyD']) {
  //      moveFirstPersonCameraRight(movementSpeed * dt, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    }
  //    if(inputState.keyDown['KeyQ'] ) {
  //      moveFirstPersonCameraUpScale(-movementSpeed * dt * 0.1, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    } else if(inputState.keyDown['KeyE']) {
  //      moveFirstPersonCameraUpScale(movementSpeed * dt * 0.1, sceneState.firstPersonCamera)
  //      cameraMoved = true
  //    }
  //    if(cameraMoved || requireRepaint) {
  //      // TODO: fix this crap up
  //      aTerribleWayOfUpdatingTheCamera_ReallyBad()
  //      Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
  //    }
  //    requestAnimationFrame(renderFrame)
  //    frame++
  //  }
  //  
  //}
//
  //function aTerribleWayOfUpdatingTheCamera_ReallyBad() {
  //  applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
  //  quat.invert(tempQ_1, sceneState.cameras[0].orientation)
  //  mat4.fromQuat(tempMat4_1, tempQ_1)
  //  mat4.fromTranslation(tempMat4_2, sceneState.cameras[0].position)
  //  mat4.multiply(tempMat4_1, tempMat4_2, tempMat4_1)
  //  tempMatrixTransform.matrix = tempMat4_1
  //  setTransform(tempMatrixTransform, mainCamera)
  //}
  //aTerribleWayOfUpdatingTheCamera_ReallyBad()
  //Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
  //performance.mark('rendered first frame')
  //requestAnimationFrame(renderFrame)
}




function setupInput(): void {
  
}


function initCanvas(): HTMLCanvasElement {
  const elem = document.createElement('canvas')
  elem.height = window.visualViewport?.height as number
  elem.width = window.visualViewport?.width as number
  document.body.append(elem)
  return elem
}

window.addEventListener('load', main)
