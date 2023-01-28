/** Shadow mapping manager. */

import type {ShadowMapState, ShadowMap, LightSource} from './types'

/** Initialise the shadow mapping manager. */
export function createShadowMapper(
    capacity:   number,
    resolution: [number, number],
    device:     GPUDevice): ShadowMapState {

  const shadowMaps = new Array(capacity).fill(null)
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

  return {
    device,
    texture,
    shadowMaps,
    nextShadowMapID,
    usage,
    resolution,
    capacity,
    format,
  }
}

