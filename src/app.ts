import * as GPU from './gpu/gpu.js'
import * as Sky from './sky.js'
import * as Skybox from './gpu/skybox.js'
import * as Render from './gpu/render.js'
import * as camera from './gpu/camera.js'
import { createInputController } from './input.js'
import {vec3, mat4, quat} from "../node_modules/gl-matrix/esm/index.js"
const { sin, cos, log, sqrt, min, max, random, PI } = Math

const app = {}

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


async function main(): Promise<void> {
  const elems = {
    canvas: initCanvas(),
    layerCount: document.querySelector('#layer-count') as HTMLSpanElement,
  }
  const gpu = await GPU.initGPU(elems.canvas)


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

  const inputState = createInputController(elems.canvas)
  const sceneState = await Render.createScene(gpu)
  const renderState = Render.createRenderer(sceneState, gpu)


  function frame(count: number) {
    if(count > 0) {
      Sky.applyLayers(count, visState, gpu)
      Sky.updateSkyUniforms(visState.layers, skyEntity, gpu)
      Sky.renderSkyToTexture(skyEntity, gpu)
      Skybox.writeTextures(skyEntity.outputTexture, sceneState.skybox, gpu)
      elems.layerCount.innerHTML = visState.layers.toString()
    }
    //GPU.frame(gpu)
    Render.renderFrame(sceneState, renderState, gpu)
  }

  document.addEventListener('keydown', ev => {
    //console.log(ev.code)
    switch(ev.code) {
      case 'KeyI':
        Sky.getPixels(visState, gpu)
        break
      case 'Space':
        frame(1)
        break
      case 'Enter':
        frame(10)
        break
      case 'ArrowLeft':
        camera.adjustAltAz(-0.05, 0, sceneState.cameras[0])
        frame(0)
        break
      case 'ArrowRight':
          camera.adjustAltAz(0.05, 0, sceneState.cameras[0])
          frame(0)
          break
      case 'Period':
        if(!inputState.captured)
          elems.canvas.requestPointerLock()
        break
      case 'Escape':
        if(inputState.captured) 
          document.exitPointerLock()
        break
      default:
        console.log(ev.code)
        break
    }
  })

  document.addEventListener('pointerlockchange', ev => {
    if(document.pointerLockElement == elems.canvas) {
      inputState.captured = true
    } else {
      inputState.captured = false
    }
  })

  elems.canvas.addEventListener('mousemove', ev => {
    if(inputState.captured) {
      camera.adjustAltAz(0.001 * ev.movementY, 0.001 * ev.movementX, sceneState.cameras[0])
      console.log(sceneState.cameras[0].orientation)
      frame(0)
    }
  })
  //camera.setAltitude(0.5, sceneState.cameras[0])
  ;(window as any).app = { Sky, GPU, gpu, scene: sceneState, state: visState, glm: { mat4, vec3, quat } }
  
  frame(1)
  //function frame() {
  //  GPU.frame(gpu)
  //  requestAnimationFrame(frame)
  //}
  //
  //requestAnimationFrame(frame)
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
