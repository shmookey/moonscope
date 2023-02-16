/** Lighting manager.
 * 
 * The `LightSource` type directly represents the shader-side structure of the
 * same name - that is, it does not model the different types of light sources
 * with different object structures. The `LightSourceDescriptor` type provides
 * a more convenient model, which can be converted to a `LightSource` with
 * `applyLightSourceDescriptor`.
 * 
 * Light positions and directions are stored in world space (typically on the
 * scene graph) on the CPU side, and transformed to view space before being
 * uploaded to the GPU in the lighting uniform buffer. Since this transform
 * is dependent on the view matrix for the frame being rendered, none of the
 * functions here do any GPU work except for `updateLightingBuffer`, which
 * writes the entire buffer at once.
 * 
 * Light sources may also be shadow casters. To avoid tight coupling between
 * this lighting system and any particular shadow system, no shadow-related
 * functionality or associations are provided here. 
 */

import type  {LightingState, LightSource, LightSourceDescriptor, Mat4, Vec4} from './types'
import {LIGHT_BUFFER_OFFSET_COUNT, LIGHT_BUFFER_OFFSET_RECORDS, 
  LIGHT_RECORD_OFFSET_POSITION, LIGHT_RECORD_SIZE, LIGHT_SOURCE_TYPE, 
  LIGHT_RECORD_OFFSET_TYPE,
  LIGHT_RECORD_OFFSET_DIRECTION,
  LIGHT_RECORD_OFFSET_ATTENUATION,
  LIGHT_RECORD_OFFSET_AMBIENT,
  LIGHT_RECORD_OFFSET_DIFFUSE,
  LIGHT_RECORD_OFFSET_SPECULAR,
  LIGHT_RECORD_OFFSET_CONE} from './constants.js'
import { RatiteError } from './error.js'
import { vec4 } from 'gl-matrix'


// Initial pointing direction for directional lights
const initialDirectionVector: Vec4 = [0, 0, -1, 0]

/** Initialise the lighting state. */
export function createLightingState(bufferCapacity: number, device: GPUDevice): LightingState {
  const byteLength = bufferCapacity * LIGHT_RECORD_SIZE + LIGHT_BUFFER_OFFSET_RECORDS // 4 bytes for light source count
  const buffer = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const bufferData = new ArrayBuffer(byteLength)
  return {
    device,
    buffer,
    bufferCapacity,
    bufferData,
    bufferUsage:  0,
    bufferView:   new DataView(bufferData),
    slots:        new Array(bufferCapacity).fill(null),
    lightSources: [],
    nextSourceID: 0,
  }
}

/** Create a light source.
 * 
 * The newly created light source must be activated before it will be used.
 */
export function createLightSource(state: LightingState, descriptor?: LightSourceDescriptor): LightSource {
  const source: LightSource = {
    id: state.nextSourceID++,
    slot: null,
    type:        'point',
    position:    [0,  0,  0,  1],
    direction:   [0,  0, -1,  0],
    attenuation: [1,  0,  0,  0],
    ambient:     [0,  0,  0,  1],
    diffuse:     [1,  1,  1,  1],
    specular:    [1,  1,  1,  1],
    cone:        [0,  0],
  }
  state.lightSources[source.id] = source
  if(descriptor)
    applyLightSourceDescriptor(descriptor, source)
  return source
}

/** Apply a light source descriptor to a light source. */
export function applyLightSourceDescriptor(descriptor: LightSourceDescriptor, source: LightSource): void {
  source.type = descriptor.type ?? source.type
  descriptor.type = source.type // todo: fix hack 
  source.attenuation = descriptor.attenuation ?? source.attenuation
  source.ambient = descriptor.ambient ?? source.ambient
  source.diffuse = descriptor.diffuse ?? source.diffuse
  source.specular = descriptor.specular ?? source.specular
  switch(descriptor.type) {
    case 'point':
      source.position = descriptor.position ?? source.position
      break
    case 'directional':
      source.direction = descriptor.direction ?? source.direction
      break
    case 'spot':
      source.position = descriptor.position ?? source.position
      source.direction = descriptor.direction ?? source.direction
      source.cone = descriptor.cone ?? source.cone
      break
  }
}

/** Set the direction of a light source with a transform matrix.
 * 
 * To reposition lights with a positional component, the translation component
 * of the matrix is copied to the light source's position.
 * 
 * To reorient lights with a directional component, the matrix is multiplied
 * by a unit vector pointing down the negative Z axis.
 */
export function applyLightSourceTransformMatrix(matrix: Mat4, id: number, state: LightingState): void {
  const lightSource = getLightSource(id, state)
  if(lightSource.type === 'directional' || lightSource.type === 'spot')
    vec4.transformMat4(lightSource.direction, initialDirectionVector, matrix)
  if(lightSource.type === 'point' || lightSource.type === 'spot') {
    lightSource.position[0] = matrix[12]
    lightSource.position[1] = matrix[13]
    lightSource.position[2] = matrix[14]
  }
}


/** Activate a light source. */
export function activateLightSource(id: number, state: LightingState): void {
  const lightSource = state.lightSources[id]

  if(!lightSource)
    throw new Error(`Invalid light source ID: ${id}`)

  if (lightSource.slot !== null)
    return // already active

  if (state.bufferUsage >= state.bufferCapacity)
      throw new Error('Lighting buffer is full')

  lightSource.slot = state.bufferUsage++
  state.slots[lightSource.slot] = lightSource
}

/** Deactivate a light source. */
export function deactivateLightSource(id: number, state: LightingState): void {
  const lightSource = state.lightSources[id]

  if(!lightSource)
    throw new Error(`Invalid light source ID: ${id}`)

  if (lightSource.slot === null)
    return // already inactive

  const slot = lightSource.slot
  lightSource.slot = null
  state.slots[slot] = null

  // Pull any subsequent light sources down to fill the gap
  for(let i = slot + 1; i < state.bufferUsage; i++) {
    state.slots[i - 1] = state.slots[i]
    state.slots[i - 1].slot = i - 1
  }
  
  state.bufferUsage--
}

/** Get a light source by ID. */
export function getLightSource(id: number, state: LightingState): LightSource {
  const lightSource = state.lightSources[id]
  if(!lightSource)
    throw new RatiteError('NotFound', `Invalid light source ID: ${id}`)
  return lightSource
}

/** Write lighting state to the GPU. */
export function updateLightingBuffer(state: LightingState): void {
  state.bufferView.setUint32(LIGHT_BUFFER_OFFSET_COUNT, state.bufferUsage, true)
  const array = new Float32Array(state.bufferData, LIGHT_BUFFER_OFFSET_RECORDS)
  for(let slot=0; slot < state.bufferUsage; slot++) {
    const source = state.slots[slot]
    const offset = slot * LIGHT_RECORD_SIZE
    array.set(source.position,    (offset + LIGHT_RECORD_OFFSET_POSITION   ) / 4)
    array.set(source.direction,   (offset + LIGHT_RECORD_OFFSET_DIRECTION  ) / 4)
    array.set(source.attenuation, (offset + LIGHT_RECORD_OFFSET_ATTENUATION) / 4)
    array.set(source.ambient,     (offset + LIGHT_RECORD_OFFSET_AMBIENT    ) / 4)
    array.set(source.diffuse,     (offset + LIGHT_RECORD_OFFSET_DIFFUSE    ) / 4)
    array.set(source.specular,    (offset + LIGHT_RECORD_OFFSET_SPECULAR   ) / 4)
    array.set(source.cone,        (offset + LIGHT_RECORD_OFFSET_CONE       ) / 4)
    state.bufferView.setUint32(offset + LIGHT_RECORD_OFFSET_TYPE + LIGHT_BUFFER_OFFSET_RECORDS, LIGHT_SOURCE_TYPE[source.type], true)
  }
  state.device.queue.writeBuffer(state.buffer, 0, state.bufferData)
}



