/** Shadow mapping manager.
 * 
 * A shadow map is a 2D texture that stores the depth of the scene from the
 * perspective of a light source. It is used to determine which parts of the
 * scene are in shadow and which are in light. The shadow map is used in the
 * fragment shader to determine the intensity of the light at each pixel when
 * a scene is rendered.
 * 
 * In Ratite, the module responsible for shadow mapping is called the shadow
 * mapper. The shadow mapper maintains a pool of shadow maps, each of which
 * can be configured to produce depth maps for a different light source. The
 * capacity and resolution of the shadow mapper is fixed at initialisation, all
 * shadow maps are the same size. Shadow maps are stored as layers in a 2D
 * array texture, with each layer corresponding to a different shadow map.
 * 
 * Nominally, shadow maps are generated per-frame in a pre-render depth pass of
 * the scene. In WebGPU terms, the depth pass comprises a separate render pass
 * for each light source. In principle, execution of a depth pass differs from
 * an ordinary render pass only in the render target configuration and shaders.
 * The shadow mapper provides a render pass descriptor, but does not take
 * responsibility for executing the render pass or issuing any GPU commands.
 * 
 * For rendering passes, the shadow mapper provides a bind group comprising the
 * following GPU resources:
 * 
 *   1. Shadow map array texture.
 *   2. Texture sampler.
 *   3. Metadata storage buffer.
 * 
 * In the default pipeline layout for Ratite, the shadow mapper bind group is
 * bound to the third bind group slot for regular forward rendering passes, and
 * necessarily omitted from the pipeline layout for shadow mapper depth passes.
 */

import type {ShadowMapperState, ShadowMap, LightSource, Mat4} from './types'
import { SHADOW_MAP_RECORD_SIZE } from './constants.js'
import { RatiteError } from './error.js'
import {mat4, glMatrix} from 'gl-matrix'
glMatrix.setMatrixArrayType(Array)


/** Initialise the shadow mapping manager. */
export function createShadowMapper(
    capacity:   number,
    resolution: [number, number],
    device:     GPUDevice): ShadowMapperState {

  const slots = new Array(capacity).fill(null)
  const nextShadowMapID = 0
  const usage = 0
  const format = 'depth24plus'
  const texture = device.createTexture({
    size:   [resolution[0], resolution[1], capacity],
    format: format,
    usage:  GPUTextureUsage.RENDER_ATTACHMENT 
          | GPUTextureUsage.TEXTURE_BINDING
          | GPUTextureUsage.COPY_SRC,
  })
  const textureArrayView = texture.createView()
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    compare: 'less',
  })
  const bufferSize = capacity * SHADOW_MAP_RECORD_SIZE
  const storageBuffer = device.createBuffer({
    size:   bufferSize,
    usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const storageBufferData = new ArrayBuffer(bufferSize)
  const storageBufferArray = new Float32Array(storageBufferData)
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'shadow-mapper-bind-group-layout',
    entries: [{
      binding: 0, 
      visibility: GPUShaderStage.FRAGMENT, 
      texture: { sampleType: 'depth', viewDimension: '2d-array' }
    },{
      binding: 1, 
      visibility: GPUShaderStage.FRAGMENT, 
      sampler: { type: 'comparison' }
    },{
      binding: 2, 
      visibility: GPUShaderStage.FRAGMENT, 
      buffer: { type: 'read-only-storage' }
    }],
  })
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {binding: 0, resource: textureArrayView },
      {binding: 1, resource: sampler },
      {binding: 2, resource: {buffer: storageBuffer} },
    ],
  })
  
  return {
    device,
    texture,
    slots,
    nextShadowMapID,
    usage,
    resolution,
    capacity,
    format,
    sampler,
    storageBuffer,
    storageBufferData,
    storageBufferArray,
    bindGroupLayout,
    bindGroup,
    textureArrayView
  }
}

/** Create a new shadow map for a light source. */
export function createShadowMap(
    lightSource:  LightSource,
    shadowMapper: ShadowMapperState,
  ): ShadowMap {
  if(shadowMapper.usage >= shadowMapper.capacity)
    throw new RatiteError('OutOfResources', 'Shadow map capacity exceeded.')

  const id = shadowMapper.nextShadowMapID++
  const slot = shadowMapper.slots.findIndex(s => s === null)
  if(slot === -1)
    throw new RatiteError('InternalError', 'No free shadow map slots found.')
  
  const view = shadowMapper.texture.createView({
    baseArrayLayer: slot,
    arrayLayerCount: 1,
  })

  const renderPass: GPURenderPassDescriptor = {
    colorAttachments: [],
    depthStencilAttachment: {
      view:              view,
      depthClearValue:   1.0,
      depthStoreOp:      'store',
      depthLoadOp:       'clear',
    },
  }

  const shadowMap: ShadowMap = {
    id:          id,
    slot:        slot,
    lightSource: lightSource,
    texture:     shadowMapper.texture,
    textureView: view,
    layer:       slot,
    renderPass:  renderPass,
    _matrix:     mat4.create() as Mat4,
  }
  shadowMapper.slots[slot] = shadowMap
  return shadowMap
}

/** Update the shadow map metadata on the GPU. */
export function updateShadowMap(shadowMap: ShadowMap, shadowMapper: ShadowMapperState): void {
  const light = shadowMap.lightSource
  const offset = shadowMap.slot * SHADOW_MAP_RECORD_SIZE
  const data = shadowMapper.storageBufferArray
  data.set(shadowMap._matrix, offset)
  shadowMapper.device.queue.writeBuffer(
    shadowMapper.storageBuffer,
    offset,
    shadowMapper.storageBufferData,
    offset,
    SHADOW_MAP_RECORD_SIZE
  )
}

/** Calculate the projection matrix for a light source. */
export function calculateLightProjection(light: LightSource, out: Mat4): Mat4 {
  switch(light.type) {
    case 'directional':
      mat4.orthoZO(out, -10, 10, -10, 10, 0, 100 )
      break
    case 'point':
      mat4.perspectiveZO(out, Math.PI / 2, 1, 0.1, 100)
      break
    case 'spot':
      mat4.perspectiveZO(out, Math.acos(light.cone[1]), 1, 1, 100)
      break
  }
  return out
}

/** Get a shadow map by its ID. */
export function getShadowMap(id: number, shadowMapper: ShadowMapperState): ShadowMap {
  const shadowMap = shadowMapper.slots.find(s => s?.id === id)
  if(!shadowMap)
    throw new RatiteError('NotFound', 'No shadow map with that ID.')
  return shadowMap
}

