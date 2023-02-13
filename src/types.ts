/** Types used in the moonscope app. */

import type { DepthMapExporter } from "./ratite/debug/depth.js";
import { RatiteError } from "./ratite/error.js";
import type { CameraNode, ErrorType, GPUContext, Renderer, Scene, SceneGraph } from "./ratite/types"
import type { Telescope } from "./telescope"

//
//    Page message types


export type MessageType = 
  // Page to worker:
    'init' | 'start' | 'stop' | 'input' | 'getState' | 'debugWorker' |
    'getDepthImage' |
  // Worker to page:
    'ready' | 'info' | 'error' | 'started' | 'stopped' | 'response' 
export type Message = 
    InitMessage | StartMessage | StopMessage | InputMessage | GetStateMessage |
    InfoMessage | ErrorMessage | ReadyMessage | StartedMessage | StoppedMessage | ResponseMessage |
    DebugWorkerMessage | GetDepthImageMessage
  


/** Base type for message-based communication between workers and the main thread.
 * 
 * Messages may be in response to a page message, or may be unsolicited.
 * Response messages will have the optional property `correlationId` set to the
 * ID of the message they are responding to.
 */
export interface MessageBase {
  type:           MessageType,     // Message type.
  id:             number,          // Serial message ID.
  correlationId?: number,          // Optional ID of the message this is a response to.
}

/** Message sent from the page to a worker to initialize it. */
export interface InitMessage extends MessageBase {
  type:                'init',           // Message type.
  canvas:              OffscreenCanvas,  // Canvas to render to.
  presentationSize:    { width: number; height: number }, // Size of the presentation canvas.
  statsUpdateInterval: number,           // Interval between frame statistics messages.
}

/** Message to start an idle worker. */
export interface StartMessage extends MessageBase {
  type: 'start',            // Message type.
}

/** Message to start a running worker. */
export interface StopMessage extends MessageBase {
  type: 'stop',            // Message type.
}

/** Send user input to worker. */
export interface InputMessage extends MessageBase {
  type: 'input',            // Message type.
  data: InputState,
}

/** Get state from worker. */
export interface GetStateMessage extends MessageBase {
  type: 'getState',            // Message type.
}

/** Debug worker. */
export interface DebugWorkerMessage extends MessageBase {
  type: 'debugWorker',            // Message type.
}

/** Get depth pass result image. */
export interface GetDepthImageMessage extends MessageBase {
  type: 'getDepthImage',            // Message type.
  layer: number,                    // Layer to get.
}


/** Message sent from a worker to the page to provide status and performance information. */
export interface InfoMessage extends MessageBase {
  type:       'info',       // Message type.
  frameStats: FrameStats,   // Frame statistics.
}

/** Response with data message. */
export interface ResponseMessage extends MessageBase {
  type:       'response',   // Message type.
  data:       any,          // Response data.
}

/** Message sent from a worker to the page to report an error.
 * 
 * Since derived classes of `Error` don't serialize well, we pull out the
 * interesting bits and send them separately alongside the original error object,
 * which is serialized.
 */
export interface ErrorMessage extends MessageBase {
  type:      'error',      // Message type.
  errorType: ErrorType,    // Error type.
  message:   string,       // Error message.
  error:     Error,        // Error object.
}

/** Worker ready notification. */
export interface ReadyMessage extends MessageBase {
  type: 'ready',          // Message type.
}

/** Message to announce that a worker has started. */
export interface StartedMessage extends MessageBase {
  type: 'started',          // Message type.
}

/** Message to announce that a worker has stopped. */
export interface StoppedMessage extends MessageBase {
  type: 'stopped',         // Message type.
}


//
//    Worker state
//

export type WorkerStatus = 'created' | 'running' | 'idle'

export type WorkerState = {
  canvas:           OffscreenCanvas,
  gpu:              GPUContext,
  sceneGraph:       SceneGraph,
  legacyScene:      Scene,            // one day we will finally be rid of this 
  renderer:         Renderer,
  mainCamera:       CameraNode,
  telescope:        Telescope,
  status:           WorkerStatus,
  fpsLimit:         number,           // Maximum FPS
  gpuReady:         boolean,          // GPU is ready
  depthMapExporter: DepthMapExporter,
  universe:         any,              // Universe object

  // Move these out into a frame statistics module:
  currentFrame:        number,   // Current frame number
  frameTimes:          number[], // Last N frame times
  frameTimesIndex:     number,   // Array index for next entry in `frameTimes`
  frameTimesCount:     number,   // Number of frame times currently recorded in `frameTimes`
  frameTimesSize:      number,   // Number of frame times in frame time buffer
  lastFrameStart:      number,   // Time of last frame start
  lastPhysicsFrame:    number,   // Time of last physics update
  lastStatsUpdate:     number,   // Time of last frame statistics update message
  statsUpdateInterval: number,   // Interval (in ms) between frame statistics update messages
}

export type FrameStats = {
  average: number,  // Average FPS during collection period
  min:     number,  // Minimum FPS during collection period
  max:     number,  // Maximum FPS during collection period
}


//
//    Worker controller
//

export type WorkerController = {
  status:    WorkerStatus,
  worker:    Worker,
  listeners: {[type: string]: ((message: Message) => void)[]},
  nextId:    number, // Next message ID
  callbacks: {[id: number]: (message: Message) => void},
}


//
//    Input state
//

export type InputState = {
  mouseCaptured:  boolean,                  // Is the mouse captured?
  mouseDownLeft:  boolean,                  // Is the left mouse button down?
  mouseDownRight: boolean,                  // Is the right mouse button down?
  keyDown:        {[key: string]: boolean}, // Is a key down?
  mouseMovement:  [number, number],         // Mouse movement since last update.
}