/** Worker controller.
 * 
 * This class is responsible for managing the worker thread. It is responsible for
 * starting and stopping the worker, and provides an event-based interface for
 * communicating with the worker.
 */

import type { InitMessage, InputState, Query, QueryMessage, QueryResult, QueryResultMessage, QueryType, ResponseMessage, WorkerController } from "./types"

/** Create a worker controller. */
export function createWorkerController(): WorkerController {
  const worker = new Worker(new URL('/build/src/worker.js', import.meta.url), {type: 'module'})
  const status = 'created'
  const listeners = {}
  const controller: WorkerController = {
    status, 
    worker, 
    listeners, 
    nextId:    0, 
    callbacks: {},
    queries:   {},
  }
  worker.onmessage = createMessageHandler(controller)
  addWorkerEventListener('ready',   () => { controller.status = 'idle' },    controller)
  addWorkerEventListener('started', () => { controller.status = 'running' }, controller)
  addWorkerEventListener('stopped', () => { controller.status = 'idle' },    controller)
  addWorkerEventListener('response', (ev: ResponseMessage) => {
    console.info(`Response to message ${ev.correlationId} received with data:`, ev.data)
    const callback = controller.callbacks[ev.correlationId]
    if(callback)
      callback(ev.data)
    else
      console.warn(`No callback for message ${ev.correlationId}`)
  }, controller)
  addWorkerEventListener('queryResult', (ev: QueryResultMessage) => {
    console.info(`Query result received for #${ev.correlationId} with result:`, ev.result)
    const callback = controller.queries[ev.correlationId]
    if(callback)
      callback(ev.result)
    else
      console.warn(`No callback for message ${ev.correlationId}`)
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

/** Start debugging the worker. */
export function debugWorker(controller: WorkerController): void {
  controller.worker.postMessage({type: 'debugWorker'})
}

/** Get depth image from worker. */
export async function getDepthImage(layer: number, controller: WorkerController): Promise<ImageBitmap> {
  const callId = controller.nextId++
  controller.worker.postMessage({type: 'getDepthImage', layer, id: callId})
  let resolver = null
  const promise = new Promise<ImageBitmap>((resolve) => {
    resolver = resolve
  })
  controller.callbacks[callId] = resolver
  return promise
}

/** Make an arbitrary request to the worker. */
export function sendWorkerRequest(data: any, controller: WorkerController): Promise<any> {
  const callId = controller.nextId++
  controller.worker.postMessage({...data, id: callId})
  let resolver = null
  const promise = new Promise<any>((resolve) => {
    resolver = resolve
  })
  controller.callbacks[callId] = resolver
  return promise
}

/** Query the worker. */
export function queryWorker<T extends QueryResult>(query: Query, controller: WorkerController): Promise<T> {
  const callId = controller.nextId++
  const msg: QueryMessage = {
    type:  'query', 
    query: query, 
    id:    callId
  }
  controller.worker.postMessage(msg)
  let resolver = null
  const promise = new Promise<T>((resolve) => {
    resolver = resolve
  })
  controller.queries[callId] = resolver
  return promise
}

