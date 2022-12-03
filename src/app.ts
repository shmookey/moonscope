import * as GPU from './gpu/gpu.js'
import * as Sky from './gpu/sky.js'

const app = {}

async function main(): Promise<void> {
  const elems = {
    canvas: initCanvas()
  }
  const gpu = await GPU.initGPU(elems.canvas)
  const visState = await Sky.create(gpu)
  const skyEntity = await Sky.createSkyRenderer(visState.instanceCount, visState.texture, gpu)
  gpu.entities.push(skyEntity)
  Sky.render(visState, gpu)
  GPU.frame(gpu)

  document.addEventListener('keydown', ev => {
    //console.log(ev.code)
    switch(ev.code) {
      case 'KeyI':
        Sky.getPixels(visState, gpu)
        break
      case 'Space':
        Sky.frame(visState, skyEntity, gpu)
        GPU.frame(gpu)
        break

    }
  });

  (window as any).app = { Sky, GPU, gpu, state: visState }
  
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
