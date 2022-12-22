import * as GPU from './gpu/gpu.js'
import * as Sky from './sky.js'
import * as Skybox from './gpu/skybox.js'
import * as Render from './gpu/render.js'
import { createInputState } from './input.js'
import { loadResourceBundle } from './gpu/resource.js'
import { createAtlas, getLayerAsImageBitmap } from './gpu/atlas.js'
import { createInstanceAllocator, registerAllocation, addInstance, updateInstanceData } from './gpu/instance.js'
import {createInstance, registerModel} from './gpu/render.js'
import {vec3, mat4, quat} from 'gl-matrix'
import {INSTANCE_BLOCK_FLOATS} from './gpu/constants.js'
import type {DrawCallDescriptor, InstanceAllocator, Mat4, ResourceBundle, Vec3, Vec4, Renderer, SceneGraph, ViewDescriptor, Quat} from './gpu/types.js'
import {applyFirstPersonCamera, getCameraViewMatrix, moveFirstPersonCameraForward, moveFirstPersonCameraRight, rotateFirstPersonCamera} from './gpu/camera.js'
import {celestialBodyModelMatrix, generateUniverse, localBodyModelMatrix, Universe, updateUniverse} from './universe.js'
import {getMeshByName} from './gpu/mesh.js'
import {attachNode, createCameraNode, createModelNode, createScene, createSceneGraph, createSceneView, registerSceneGraphModel, setNodeTransform} from './gpu/scene.js'
const { sin, cos, log, sqrt, min, max, random, PI } = Math

const app: any = {};
(window as any).app = app
const tempMat4_1 = mat4.create() as Mat4
const tempMat4_2 = mat4.create() as Mat4
const tempQ_1 = quat.create() as Quat

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

function setInstanceModelMatrix(
    modelMatrix: Mat4, 
    instanceId: number, 
    instanceAllocator: InstanceAllocator, 
    device: GPUDevice) {
  updateInstanceData(modelMatrix, instanceId, instanceAllocator, device, 0)
}

function setInstanceTextureBounds(
    textureBounds: Vec4, 
    instanceId: number, 
    instanceAllocator: InstanceAllocator, 
    device: GPUDevice) {
  updateInstanceData(textureBounds, instanceId, instanceAllocator, device, 4*4*4)
}

function setInstanceFields(
    modelMatrix: Mat4,
    textureBounds: Vec4, 
    instanceId: number, 
    instanceAllocator: InstanceAllocator, 
    device: GPUDevice) {
  const buf = new Float32Array(4*4 + 4)
  buf.set(modelMatrix)
  buf.set(textureBounds, 4*4)
  updateInstanceData(buf, instanceId, instanceAllocator, device, 4*4*4)
}

function setupScene(renderer: Renderer): void {
  // Add ground plane
  const groundModelId = registerModel('ground', 'ground', 1, renderer)
  mat4.fromTranslation(tempMat4_1, vec3.fromValues(0,-2,0))
  const groundInstanceId = createInstance(tempMat4_1, groundModelId, renderer)

  // Add cube
  const cubeModelId = registerModel('test-object', 'moon', 1, renderer)
  mat4.fromTranslation(tempMat4_1, vec3.fromValues(-1,1.5,-3))
  const cubeInstanceId = createInstance(tempMat4_1, cubeModelId, renderer)
}

function setupSceneGraph(renderer: Renderer): SceneGraph {
  const sceneGraph = createSceneGraph(renderer)
  const viewDescriptor: ViewDescriptor = {
    type:   'perspective',
    fovy:   PI / 2,
    aspect: renderer.outputSize[0] / renderer.outputSize[1],
    near:   0.1,
    far:    Infinity,
  }
  createSceneView('default', viewDescriptor, sceneGraph)
  const cameraNode = createCameraNode('default', sceneGraph)
  app.cameraNode = cameraNode
  attachNode(cameraNode, sceneGraph.root, sceneGraph)
  registerSceneGraphModel('sphere', 'icosphere-2', 100, sceneGraph)
  const sphereNode = createModelNode('sphere', sceneGraph)
  mat4.fromTranslation(tempMat4_1, vec3.fromValues(0,0,-4))
  setNodeTransform(sphereNode, tempMat4_1, sceneGraph)
  attachNode(sphereNode, sceneGraph.root, sceneGraph)
  return sceneGraph
}


function setupUniverse(renderer: Renderer): void {
  const universe = generateUniverse(1000)
  app.universe = universe

  // Set up draw call for celestial bodies
  const starModelId = registerModel('celestial-body', 'icosahedron', 1000, renderer)
  for(let body of universe.celestialBodies) {
    celestialBodyModelMatrix(body, tempMat4_1)
    body.instanceId = createInstance(tempMat4_1, starModelId, renderer)
  }

  // Set up draw call for local bodies
  const planetModelId = registerModel('local-body', 'icosphere-2', 100, renderer)
  const planetModel = renderer.models[planetModelId]
  universe.localBodiesAllocId = planetModel.allocationId
  for(let body of universe.localBodies) {
    localBodyModelMatrix(body, tempMat4_1)
    body.instanceId = createInstance(tempMat4_1, planetModelId, renderer)
  }

}

function updateLocalBodyInstanceData(universe: Universe, instanceAllocator: InstanceAllocator, device: GPUDevice) {
  const allocationId = universe.localBodiesAllocId
  const allocationOffset = instanceAllocator.allocations[allocationId].instanceIndex
  const instanceData = new Float32Array(INSTANCE_BLOCK_FLOATS)
  const modelMatrix = mat4.create()
  for(let body of universe.localBodies) {
    localBodyModelMatrix(body, modelMatrix)
    instanceData.set(modelMatrix)
    updateInstanceData(
      instanceData, 
      body.instanceId,
      instanceAllocator,
      device)
  }
}

async function main(): Promise<void> {
  const elems = {
    canvas: initCanvas(),
    layerCount: document.querySelector('#layer-count') as HTMLSpanElement,
  }
  const gpu = await GPU.initGPU(elems.canvas)
  
  //const testShader = await GPU.loadShader('/shader/entity.frag.wgsl', gpu)
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

  const inputState = createInputState()
  
  const renderer = await Render.createRenderer(
    gpu.presentationFormat, 
    gpu,
    5000,  // instance storage capacity
    20000, // vertex storage capacity
  )
  app.renderer = renderer
  const sceneState = await createScene(renderer.mainUniformBuffer, gpu)
  const sceneGraph = setupSceneGraph(renderer)
  app.sceneGraph = sceneGraph
  
  setupUniverse(renderer)
  setupScene(renderer)

  function addVisibilities(count: number) {
    if(count > 0) {
      Sky.applyLayers(count, visState, gpu)
      Sky.updateSkyUniforms(visState.layers, skyEntity, gpu)
      Sky.renderSkyToTexture(skyEntity, gpu)
      Skybox.writeTextures(skyEntity.outputTexture, sceneState.skybox, gpu)
      elems.layerCount.innerHTML = visState.layers.toString()
    }
    //GPU.frame(gpu)
    Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
  }

  document.addEventListener('keydown', async ev => {
    //console.log(ev.code)
    switch(ev.code) {
      case 'KeyI':
        Sky.getPixels(visState, gpu)
        break
      case 'Space':
        addVisibilities(1)
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
        break
      case 'Backspace':
        getAtlasAsImage()
        break
      default:
        //console.log(ev.code)
        break
    }
  })

  async function getAtlasAsImage() {
    const imageBitmap = await getLayerAsImageBitmap(0, 3, renderer.atlas, gpu.device)
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
    container.style.top  = '0px' // `calc(50% - ${(imageBitmap.height + 10)/2}px)`
    container.style.left = '0px' //`calc(50% - ${(imageBitmap.width + 10)/2}px)`
    container.style.backgroundColor = '#000'
    container.append(canvas)
    document.body.append(container)
  }

  document.addEventListener('pointerlockchange', ev => {
    if(document.pointerLockElement == elems.canvas) {
      inputState.mouseCaptured = true
      requestAnimationFrame(renderFrame)
    } else {
      inputState.mouseCaptured = false
    }
  })

  
  app.Sky = Sky
  app.GPU = GPU
  app.gpu = gpu
  app.scene = sceneState
  app.visState = visState
  app.glm = { mat4, vec3, quat }
  
  addVisibilities(0)
  const movementSpeed = 0.004
  let lastTime = 0
  function renderFrame(currentTime: number): void {
    if(inputState.mouseCaptured) {
      const dt = currentTime - lastTime
      lastTime = currentTime
      let cameraMoved = true

      updateUniverse(app.universe, currentTime)
      updateLocalBodyInstanceData(app.universe, renderer.instanceAllocator, gpu.device)

      // Handle mouse movement
      const [dx, dy] = inputState.mouseMovement
      if(dx != 0 || dy != 0) {
        rotateFirstPersonCamera(0.001 * dy, 0.001 * dx, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        inputState.mouseMovement[0] = 0
        inputState.mouseMovement[1] = 0
        cameraMoved = true
      }

      // Handle keyboard movement
      if(inputState.keyDown['KeyW'] || inputState.keyDown['ArrowUp']) {
        moveFirstPersonCameraForward(-movementSpeed * dt, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        cameraMoved = true
      } else if(inputState.keyDown['KeyS'] || inputState.keyDown['ArrowDown']) {
        moveFirstPersonCameraForward(movementSpeed * dt, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        cameraMoved = true
      }
      if(inputState.keyDown['KeyA'] || inputState.keyDown['ArrowLeft']) {
        moveFirstPersonCameraRight(-movementSpeed * dt, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        cameraMoved = true
      } else if(inputState.keyDown['KeyD'] || inputState.keyDown['ArrowRight']) {
        moveFirstPersonCameraRight(movementSpeed * dt, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        cameraMoved = true
      }
      if(cameraMoved) {
        // TODO: fix this crap up
        quat.invert(tempQ_1, sceneState.cameras[0].orientation)
        mat4.fromQuat(tempMat4_1, tempQ_1)
        mat4.fromTranslation(tempMat4_2, sceneState.cameras[0].position)
        mat4.multiply(tempMat4_1, tempMat4_2, tempMat4_1)
        setNodeTransform(app.cameraNode, tempMat4_1, sceneGraph)
        Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
      }
      requestAnimationFrame(renderFrame)
    }
    
  }
  //function frame() {
  //  GPU.frame(gpu)
  //  requestAnimationFrame(frame)
  //}
  //
  requestAnimationFrame(renderFrame)
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


type Colour = [number, number, number]

function* colourGen(): Generator<Colour> {
  let [r,g,b] = [0,0,0]
  yield [r,g,b]
}
