import * as GPU from './gpu/gpu.js'
import * as Sky from './gpu/sky.js'
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
    layerCount: document.querySelector('#layer-count'),
  }
  const gpu = await GPU.initGPU(elems.canvas)
  const visSource = layerGen()
  const visState = await Sky.create(
    1280,
    1280,
    20 * 2**20,
    sources.length,
    visSource,
    gpu
  )
  const skyEntity = await Sky.createSkyRenderer(visState.texture, gpu)
  gpu.entities.push(skyEntity)

  function frame(count: number) {
    Sky.applyLayers(count, visState, gpu)
    Sky.updateSkyUniforms(visState.layers, skyEntity, gpu)
    GPU.frame(gpu)
    elems.layerCount.innerHTML = visState.layers.toString()
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
    }
  });

  (window as any).app = { Sky, GPU, gpu, state: visState }
  
  frame(1)
  //function frame() {
  //  GPU.frame(gpu)
  //  requestAnimationFrame(frame)
  //}
  //
  //requestAnimationFrame(frame)
}



function initCanvas(): HTMLCanvasElement {
  const elem = document.createElement('canvas')
  elem.height = window.visualViewport?.height as number
  elem.width = window.visualViewport?.width as number
  document.body.append(elem)
  return elem
}

window.addEventListener('load', main)
