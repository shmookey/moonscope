/** Types used in the moonscope app. */


//
//    Page message types


export type PageMessageType = 'init' | 'start' | 'stop'
export type PageMessage = InitMessage

/** Base type for message-based communication from the page to a worker. 
 * 
 * Messages may be in response to a page message, or may be unsolicited.
 * Response messages will have the optional property `correlationId` set to the
 * ID of the message they are responding to.
 */
export interface PageMessageBase {
  type:           PageMessageType, // Message type.
  id:             number,          // Serial message ID.
  correlationId?: number,          // Optional ID of the message this is a response to.
}

/** Message sent from the page to a worker to initialize it. */
export interface InitMessage extends PageMessageBase {
  type: 'init',                       // Message type.
  presentationSize: [number, number], // Size of the presentation canvas.
}


//
//    Worker message types
//


export type WorkerMessageType = 'info' | 'error'
export type WorkerMessage = InfoMessage

/** Base type for message-based communication from a worker to the page. 
 *
 * Messages may be in response to a page message, or may be unsolicited.
 * Response messages will have the optional property `correlationId` set to the
 * ID of the message they are responding to.
 */
export interface WorkerMessageBase {
  type:           WorkerMessageType, // Message type.
  id:             number,            // Serial message ID.
  correlationId?: number,            // Optional ID of the message this is a response to.
}

/** Message sent from a worker to the page to provide status and performance information. */
export interface InfoMessage extends WorkerMessageBase {
  type: 'info',            // Message type.
}

/** Message sent from a worker to the page to report an error. */
export interface ErrorMessage extends WorkerMessageBase {
  type: 'error',           // Message type.
  error: Error,            // Error object.
}


//
//    Workeer state
//


export type WorkerState = {
  canvas:           OffscreenCanvas,
  presentationSize: [number, number],
  gpu:              GPU,
}