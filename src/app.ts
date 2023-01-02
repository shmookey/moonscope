import * as GPU from './gpu/gpu.js'
import * as Sky from './sky.js'
import * as Skybox from './gpu/skybox.js'
import * as Render from './gpu/render.js'
import { createInputState } from './input.js'
import { getLayerAsImageBitmap } from './gpu/atlas.js'
import {vec3, mat4, quat} from 'gl-matrix'
import type {Mat4, Renderer, SceneGraph, ViewDescriptor, Quat} from './gpu/types.js'
import {applyFirstPersonCamera, getCameraViewMatrix, moveFirstPersonCameraForward, moveFirstPersonCameraRight, moveFirstPersonCameraUp, moveFirstPersonCameraUpScale, rotateFirstPersonCamera} from './gpu/camera.js'
import {celestialBodyModelMatrix, generateUniverse, Universe} from './universe.js'
import {getMeshByName} from './gpu/mesh.js'
import {attachNode, createCameraNode, createModelNode, createScene, createSceneGraph, createSceneView, createTransformNode, registerSceneGraphModel, setNodeTransform} from './gpu/scene.js'
import {loadResourceBundle} from './gpu/resource.js'
const { sin, cos, log, sqrt, min, max, random, PI } = Math

const MOUSE_SENSITIVITY = 0.001
const CAMERA_HEIGHT = 2

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

function setupSceneGraph(renderer: Renderer): SceneGraph {
  const universe = generateUniverse(0)
  app.universe = universe

  const sceneGraph = createSceneGraph(renderer)
  const viewDescriptor: ViewDescriptor = {
    type:   'perspective',
    fovy:   PI / 2,
    aspect: renderer.outputSize[0] / renderer.outputSize[1],
    near:   0.001,
    far:    Infinity,
  }
  createSceneView('default', viewDescriptor, sceneGraph)
  //registerSceneGraphModel('sun',             'sun',             'entity',             1,    sceneGraph)
  //registerSceneGraphModel('earth',           'earth',           'entity',             1,    sceneGraph)
  //registerSceneGraphModel('moon',            'moon',            'entity',             1,    sceneGraph)
  //registerSceneGraphModel('star',            'star',            'entity',          1000,    sceneGraph)
  registerSceneGraphModel('ground-textured',   'ground',          'entity-pbr-wrapped', 1,    sceneGraph)
  //registerSceneGraphModel('ground-grid',     'ground',          'autogrid',           1,    sceneGraph)
  //registerSceneGraphModel('sphere',          'earth',           'autogrid-sphere',    1,    sceneGraph)

  // Sun
  //const sunNode = createModelNode('sun', sceneGraph)
  //mat4.fromTranslation(tempMat4_1, universe.localBodies.sun.position)
  //setNodeTransform(sunNode, tempMat4_1, sceneGraph)
  //attachNode(sunNode, sceneGraph.root, sceneGraph)

  // Earth
  //const earthNode = createTransformNode(sceneGraph)
  //const earthRadius = universe.localBodies.earth.radius
  //mat4.fromTranslation(tempMat4_1, universe.localBodies.earth.position)
  //setNodeTransform(earthNode, tempMat4_1, sceneGraph)
  //attachNode(earthNode, sunNode, sceneGraph)
  //app.earthNode = earthNode

  // Moon
  //const moonNode = createModelNode('moon', sceneGraph)
  //mat4.fromTranslation(tempMat4_1, universe.localBodies.moon.position)
  //setNodeTransform(moonNode, tempMat4_1, sceneGraph)
  ////attachNode(moonNode, earthNode, sceneGraph)
  //app.moonNode = moonNode

  // Ground
  //const groundGridNode = createModelNode('ground-grid', sceneGraph)
  const groundTextureNode = createModelNode('ground-textured', sceneGraph)
  //mat4.fromTranslation(tempMat4_1, [0, 0.1, 0]) //-earthRadius])
  //mat4.rotateX(tempMat4_1,  tempMat4_1, -PI/2)
  //mat4.scale(tempMat4_1, tempMat4_1, [1000, 1, 1000])
  //setNodeTransform(groundNode, tempMat4_1, sceneGraph)
  //setNodeTransform(groundGridNode, tempMat4_1, sceneGraph)
  attachNode(groundTextureNode, sceneGraph.root, sceneGraph)
  //attachNode(groundGridNode, sceneGraph.root, sceneGraph)

  // FPS camera
  const cameraNode = createCameraNode('default', sceneGraph)
  app.cameraNode = cameraNode
  attachNode(cameraNode, sceneGraph.root, sceneGraph)
  
  // Test sphere
  //const sphereNode = createModelNode('sphere', sceneGraph)
  //mat4.fromTranslation(tempMat4_1, [0, 1, 0])
  //mat4.scale(tempMat4_1, tempMat4_1, [0.01, 0.01, 0.01])
  //setNodeTransform(sphereNode, tempMat4_1, sceneGraph)
  //attachNode(sphereNode, sceneGraph.root, sceneGraph)
  //app.sphereNode = sphereNode

  // Stars (cosmos)
  //const cosmosNode = createTransformNode(sceneGraph)
  //for(let body of universe.celestialBodies) {
  //  const bodyNode = createModelNode('star', sceneGraph)
  //  celestialBodyModelMatrix(body, tempMat4_1)
  //  setNodeTransform(bodyNode, tempMat4_1, sceneGraph)
  //  body.node = bodyNode
  //  attachNode(bodyNode, cosmosNode, sceneGraph)
  //}
  //attachNode(cosmosNode, sceneGraph.root, sceneGraph) 
  
   
  return sceneGraph
}

/** return true to force a repaint. */
function updateWorldState(dT: number, sceneGraph: SceneGraph): boolean {
  const amount = dT * 0.005
  const universe: Universe = app.universe
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
    40000, // vertex storage capacity
  )
  const bundle = await loadResourceBundle('/assets/bundle.json', renderer)
 
  app.renderer = renderer

  const sceneState = await createScene(renderer.mainUniformBuffer, gpu)
  const sceneGraph = bundle.scenes[0] //setupSceneGraph(renderer)
  const mainCamera = sceneGraph.views.default.camera
  sceneState.firstPersonCamera.position[1] = CAMERA_HEIGHT
  app.sceneGraph = sceneGraph
  

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

  const movementSpeed = 0.01
  let lastTime = 0

  document.addEventListener('pointerlockchange', ev => {
    if(document.pointerLockElement == elems.canvas) {
      inputState.mouseCaptured = true
      lastTime = performance.now()
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
  
  
  function renderFrame(currentTime: number): void {
    if(inputState.mouseCaptured) {
      const dt = currentTime - lastTime
      lastTime = currentTime
      let cameraMoved = true
      let requireRepaint = true

      //updateUniverse(app.universe, currentTime)
      requireRepaint = updateWorldState(dt, sceneGraph)

      // Handle mouse movement
      const [dx, dy] = inputState.mouseMovement
      if(dx != 0 || dy != 0) {
        rotateFirstPersonCamera(MOUSE_SENSITIVITY * dy, MOUSE_SENSITIVITY * dx, sceneState.firstPersonCamera)
        applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
        inputState.mouseMovement[0] = 0
        inputState.mouseMovement[1] = 0
        cameraMoved = true
      }

      // Handle keyboard movement
      if( inputState.keyDown['ArrowUp']) {
        moveFirstPersonCameraForward(-movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      } else if( inputState.keyDown['ArrowDown']) {
        moveFirstPersonCameraForward(movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      }
      if( inputState.keyDown['ArrowLeft']) {
        moveFirstPersonCameraRight(-movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      } else if( inputState.keyDown['ArrowRight']) {
        moveFirstPersonCameraRight(movementSpeed*0.04 * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      }
      if(inputState.keyDown['KeyW'] ) {
        moveFirstPersonCameraForward(-movementSpeed * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      } else if(inputState.keyDown['KeyS'] ) {
        moveFirstPersonCameraForward(movementSpeed * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      }
      if(inputState.keyDown['KeyA'] ) {
        moveFirstPersonCameraRight(-movementSpeed * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      } else if(inputState.keyDown['KeyD']) {
        moveFirstPersonCameraRight(movementSpeed * dt, sceneState.firstPersonCamera)
        cameraMoved = true
      }
      if(inputState.keyDown['KeyQ'] ) {
        moveFirstPersonCameraUpScale(-movementSpeed * dt * 0.1, sceneState.firstPersonCamera)
        cameraMoved = true
      } else if(inputState.keyDown['KeyE']) {
        moveFirstPersonCameraUpScale(movementSpeed * dt * 0.1, sceneState.firstPersonCamera)
        cameraMoved = true
      }
      if(cameraMoved || requireRepaint) {
        // TODO: fix this crap up
        aTerribleWayOfUpdatingTheCamera_ReallyBad()
        Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
      }
      requestAnimationFrame(renderFrame)
    }
    
  }

  function aTerribleWayOfUpdatingTheCamera_ReallyBad() {
    applyFirstPersonCamera(sceneState.firstPersonCamera, sceneState.cameras[0])
    quat.invert(tempQ_1, sceneState.cameras[0].orientation)
    mat4.fromQuat(tempMat4_1, tempQ_1)
    mat4.fromTranslation(tempMat4_2, sceneState.cameras[0].position)
    mat4.multiply(tempMat4_1, tempMat4_2, tempMat4_1)
    setNodeTransform(mainCamera, tempMat4_1, sceneGraph)
  }
  aTerribleWayOfUpdatingTheCamera_ReallyBad()
  Render.renderFrame(sceneState, sceneGraph, renderer, gpu)
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
