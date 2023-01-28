/** Shadow mapping manager. */

import type {ShadowMapState, ShadowMap, LightSource} from './types'

/** Initialise the shadow mapping manager. */
export function createShadowMapper(
    capacity:   number,
    resolution: [number, number],
    format:     GPUTextureFormat,
    device:     GPUDevice): ShadowMapState {

  const shadowMaps = new Array(capacity).fill(null)
  const nextShadowMapID = 0
  const usage = 0
  const texture = device.createTexture({
    size:   [resolution[0], resolution[1], capacity],
    format: format,
    usage:  GPUTextureUsage.RENDER_ATTACHMENT 
          | GPUTextureUsage.TEXTURE_BINDING
          | GPUTextureUsage.COPY_SRC,
  })

  return {
    device,
    texture,
    shadowMaps,
    nextShadowMapID,
    usage,
    resolution,
    format,
    capacity,
  }
}

