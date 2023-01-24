/** Worker controller.
 * 
 * This class is responsible for managing the worker thread. It is responsible for
 * starting and stopping the worker, and provides an event-based interface for
 * communicating with the worker.
 */

import type { InitMessage, InputState, ResponseMessage, WorkerController } from "./types"

/** Create a worker controller. */
export function createWorkerController(): WorkerController {
  const worker = new Worker(new URL('/build/src/worker.js', import.meta.url), {type: 'module'})
  const status = 'created'
  const listeners = {}
  const controller: WorkerController = {status, worker, listeners, nextId: 0}
  worker.onmessage = createMessageHandler(controller)
  addWorkerEventListener('ready',   () => { controller.status = 'idle' },    controller)
  addWorkerEventListener('started', () => { controller.status = 'running' }, controller)
  addWorkerEventListener('stopped', () => { controller.status = 'idle' },    controller)
  addWorkerEventListener('response', (ev: ResponseMessage) => {
    console.info(`Response to message ${ev.correlationId} received with data:`, ev.data)
  }, controller)
  return controller
}

/** Initialise the worker thread. */
export function initWorker(initMessage: InitMessage, controller: WorkerController): void {
  controller.worker.postMessage(initMessage, [initMessage.canvas])
}

/** Start the worker thread. */
export function startWorker(controller: WorkerController): void {
  controller.worker.postMessage({type: 'start', id: controller.nextId++})
}

/** Stop the worker thread. */
export function stopWorker(controller: WorkerController): void {
  controller.worker.postMessage({type: 'stop', id: controller.nextId++})
}

/** Message handler for worker thread. */
function createMessageHandler(controller: WorkerController): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    const message = event.data
    const listeners = controller.listeners[message.type]
    if(listeners)
      listeners.forEach((fn) => fn(message))
    else
      console.error(`Unhandled message type: ${message.type}`)
  }
}

/** Add an event listener. */
export function addWorkerEventListener(type: string, fn: (message: any) => void, controller: WorkerController): void {
  let listeners = controller.listeners[type]
  if(!listeners) {
    listeners = []
    controller.listeners[type] = listeners
  }
  listeners.push(fn)
}

/** Send input to the worker thread. */
export function sendInputToWorker(input: InputState, controller: WorkerController): void {
  controller.worker.postMessage({type: 'input', data: input})
}

/** Get state from the worker thread. */
export function getStateFromWorker(controller: WorkerController): void {
  controller.worker.postMessage({type: 'getState'})
}
