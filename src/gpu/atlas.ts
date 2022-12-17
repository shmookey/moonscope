/** atlas.ts -- Texture atlas for WebGPU. */

import type {Atlas, SubTexture} from "./types"

const MIN_LAYER_SIZE = 256; // Minimum size of each layer in atlas


/** Create a new texture atlas. */
export function createAtlas(device: GPUDevice, layerSize: [number, number], layerCount: number, format: GPUTextureFormat): Atlas {
  // Ensure layer size is square and a power of 2
  if(layerSize[0] & (layerSize[0] - 1) || layerSize[1] & (layerSize[1] - 1) || layerSize[0] !== layerSize[1]) {
    throw new Error('Layers must be square and of power-of-2 size.')
  }
  // Ensure texture size is within limits
  const limits = device.limits
  if(layerSize[0] > limits.maxTextureDimension2D || layerSize[1] > limits.maxTextureDimension2D ||
     layerSize[0] < MIN_LAYER_SIZE || layerSize[1] < MIN_LAYER_SIZE ||
     layerCount > limits.maxTextureArrayLayers) {
    throw new Error('Layer size exceeds device limits')
  }

  const texture = device.createTexture({
    size: [layerSize[0], layerSize[1], layerCount],
    format,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
  return { texture, layerSize, layerCount, format, subTextures: [] }
}

/** Add a sub-texture to an atlas. */
export function addSubTexture(atlas: Atlas, width: number, height: number, label: string): SubTexture {
  const destination = findSpaceInAtlas(atlas, width, height)
  if(!destination) {
    throw new Error('No space in atlas for sub-texture')
  }
  const id = atlas.subTextures.length
  const [ x, y, layer ] = destination
  atlas.subTextures.push({ id, label, x, y, width, height, layer })
  return atlas.subTextures[id]
}

/** Create a texture view for a sub-texture. */
export function createSubTextureView(atlas: Atlas, subTexture: SubTexture): GPUTextureView {
  return atlas.texture.createView({
    dimension: '2d',
    format: 'rgba8unorm',
    baseArrayLayer: subTexture.layer,
    arrayLayerCount: 1,
    baseMipLevel: 0,
    mipLevelCount: 1,
    origin: [subTexture.x, subTexture.y, 0],
    size: [subTexture.width, subTexture.height, 1],
  } as GPUTextureViewDescriptor)
}

/** Copy a WebGPU-compatible external image into a sub-texture.
 * 
 * The optional `origin` argument specifies the top-left corner of the region
 * to be copied, otherwise defaulting to [0, 0]. The size of the region is the
 * size of the sub-texture, no resizing is performed. The image must be at
 * least as large as the sub-texture.
 * 
 * Valid external image types are:
 *  - ImageBitmap
 *  - HTMLVideoElement
 *  - HTMLCanvasElement
 *  - OffscreenCanvas
 */
export function copyImageBitmapToSubTexture(
    device: GPUDevice, 
    atlas: Atlas, 
    subTextureID: number, 
    image: ImageBitmap,
    origin: [number, number] | null = [0,0]): void {

  const subTexture = atlas.subTextures[subTextureID]
  const imageBitmapCopyView: GPUImageCopyExternalImage = {
    source: image,
    origin: origin,
    flipY: true,
  }
  const textureCopyView: GPUImageCopyTexture = {
    texture: atlas.texture,
    mipLevel: 0,
    origin: [subTexture.x, subTexture.y, subTexture.layer],
  } as GPUImageCopyTexture
  const copySize: GPUExtent3D = {
    width: subTexture.width,
    height: subTexture.height,
  };
  device.queue.copyExternalImageToTexture(imageBitmapCopyView, textureCopyView, copySize)
}


/** Determine if two rectangles overlap. */
function intersects(x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2
}

/** Determine where a sub-texture with given dimensions could fit in the atlas,
 * or return null if no space is available. Space is packed left-to-right,
 * top-to-bottom, and layers are filled before moving to the next layer.
 */
export function findSpaceInAtlas(atlas: Atlas, width: number, height: number): [number, number, number] | null {
  const layerCount = atlas.layerCount
  for(let layer=0; layer<layerCount; layer++) {
    const space = findSpaceInLayer(atlas, width, height, layer)
    if(space) {
      return [space[0], space[1], layer]
    }
  } 
  return null
}

/** Determine where a sub-texture with given dimensions could fit in a
 * specified layer, or return null if no space is available. Space is packed
 * left-to-right, top-to-bottom.
 */
export function findSpaceInLayer(atlas: Atlas, width: number, height: number, layer: number): [number, number] | null {
  const layerSubTextures = atlas.subTextures.filter(st => st.layer === layer)
  if(layerSubTextures.length === 0) {
    return [0, 0]
  }
  const layerWidth = atlas.layerSize[0]
  const layerHeight = atlas.layerSize[1]
  if(width > layerWidth || height > layerHeight) {
    return null
  }
  for(let y=0; y<layerHeight; y += 256) {
    for(let x=0; x<layerWidth; x += 256) {
      const occupied = layerSubTextures.find(st => 
        (st.x === x && st.y === y) ||
        intersects(x, y, width, height, st.x, st.y, st.width, st.height)
      )
      if(!occupied) {
        return [x, y]
      }
    }
  }
  return null
}
