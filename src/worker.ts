import type { InitMessage, PageMessage, WorkerMessage, WorkerState } from './types'
import { initGPU } from './ratite/gpu.js'

let nextMessageId = 0
let state: WorkerState = null

async function init(opts: InitMessage): Promise<void> {
  const canvas = new OffscreenCanvas(...opts.presentationSize)
 // const gpu = await initGPU(canvas)

}

onmessage = (event: MessageEvent<PageMessage>) => {
  switch(event.data.type) {
    case 'init':
      init(event.data)
      break
    default:
      postMessage({ 
        id:            nextMessageId++, 
        correlationId: event.data.id, 
        type:          'error', 
        error:          new Error(`Unknown message type: ${event.data.type}`)
      })
  }
}
