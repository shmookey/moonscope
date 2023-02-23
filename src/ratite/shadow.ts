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

import type {ShadowMapperState, ShadowMap, LightSource, Mat4, BoundingVolume, Vec3, Vec4} from './types'
import { SHADOW_MAP_RECORD_SIZE } from './constants.js'
import { RatiteError } from './error.js'
import {mat4, glMatrix, vec4, vec3} from 'gl-matrix'
import { getBoundingVolumeCorners, getTransformedBoundingVolume, isNullBoundingVolume } from './common.js'
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

const _regionCentre    = [0,0,0] as Vec3
const _sourceDirection = [0,0,0] as Vec3
const _sourcePosition  = [0,0,0] as Vec3
const _lookCentre      = [0,0,0] as Vec3
const _viewMatrix      = mat4.create() as Mat4
const _up              = [0,1,0] as Vec3



/** Calculate the matrices for a directional light given a region to cover. */
export function calculateDirectionalLightMatrices(
  region: BoundingVolume,
  direction:  Vec4,
  viewOutput: Mat4,
  projectionOutput: Mat4): void {

    // Bail out if the region is the null region.
    if(isNullBoundingVolume(region)) {
      mat4.identity(viewOutput)
      mat4.identity(projectionOutput)
      return
    }

    // Find the centre point of the region.
    _regionCentre[0] = (region.min[0] + region.max[0]) / 2
    _regionCentre[1] = (region.min[1] + region.max[1]) / 2
    _regionCentre[2] = (region.min[2] + region.max[2]) / 2

    // Get the point for the view matrix to look at
    _lookCentre[0] = _regionCentre[0] + direction[0]
    _lookCentre[1] = _regionCentre[1] + direction[1]
    _lookCentre[2] = _regionCentre[2] + direction[2]

    // Calculate an initial view matrix for the light source.
    mat4.lookAt(viewOutput, _regionCentre, _lookCentre, _up)

    // Find the dimensions of the orthographic projection.
    const projBounds = getTransformedBoundingVolume(region, viewOutput)
    const projWidth  = projBounds.max[0] - projBounds.min[0]
    const projHeight = projBounds.max[1] - projBounds.min[1]
    const projDepth  = projBounds.max[2] - projBounds.min[2]

    // Move the light source back to cover the region.
    _sourcePosition[0] = _regionCentre[0] - direction[0] * projDepth
    _sourcePosition[1] = _regionCentre[1] - direction[1] * projDepth
    _sourcePosition[2] = _regionCentre[2] - direction[2] * projDepth

    //mat4.lookAt(viewOutput, _sourcePosition, _regionCentre, _up)

    // Calculate the projection matrix for the light source.
    //mat4.orthoZO(projectionOutput, -projWidth/2, projWidth/2, -projHeight/2, projHeight/2, 0, projDepth)
    mat4.orthoZO(projectionOutput, -10, 10, -10, 10, -10, 10 )

}

