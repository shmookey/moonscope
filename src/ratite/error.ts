/** Ratite error types. */

import { ErrorType } from "./types"

export class RatiteError extends Error {
  type: ErrorType
  message: string
  constructor(type: ErrorType, message?: string) {
    super(message)
    this.type    = type
    this.message = message
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RatiteError)
    }
  }
}

export function formatErrorType(type: ErrorType): string {
  switch(type) {
    case 'InternalError':    return 'Internal Error'
    case 'InvalidArgument':  return 'Invalid Argument'
    case 'InvalidOperation': return 'Invalid Operation'
    case 'NotImplemented':   return 'Not Implemented'
    case 'NotSupported':     return 'Not Supported'
    case 'OutOfMemory':      return 'Out of Memory'
    case 'OutOfResources':   return 'Out of Resources'
    case 'UnknownError':     return 'Unknown Error'
    case 'WebGPUInitFailed': return 'Failed to initialise WebGPU'
    case 'NotFound':         return 'Resource Not Found'
    default:                 return 'Unknown Error'
  }
}

/** Explains an error with a friendly message. */
export function explainError(type: ErrorType): string {
  let explanation = 'An error occurred in the Ratite renderer.'
  switch(type) {
    case 'WebGPUInitFailed':
      explanation = 'WebGPU appears to be unavailable. Please ensure that your browser supports WebGPU and that it is enabled.'
      break
    case 'InternalError':
      explanation = 'An internal error occurred in the Ratite renderer. This is a bug in Ratite. Please report it.'
      break
    case 'NotFound':
      explanation = 'The application requested a resource that does not exist.'
  }
  return explanation
}
