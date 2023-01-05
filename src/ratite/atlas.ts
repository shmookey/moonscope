/** atlas.ts -- Texture atlas for WebGPU.
 * 
 * This module implements a texture atlas.
 * 
 * Textures are stored in an atlas region that is double the width and height
 * of the original texture. This allows for the combination of wrapped textures
 * and mip-mapping.
 * 
 * 
 */

import type {Atlas, Region, SubTexture} from "./types"
const { max } = Math

const MIN_LAYER_SIZE = 256; // Minimum size of each layer in atlas
const METADATA_RECORD_SIZE = 24; // Size of each metadata record in bytes (4 floats region + 1 uint layer + 4 byte pad)

/** Create a new texture atlas. */
export function createAtlas(
    capacity: number,
    size: [number, number, number], // width, height, layers 
    format: GPUTextureFormat,
    mipLevels: number,
    device: GPUDevice): Atlas {

  const layerSize: [number, number] = [size[0], size[1]]
  const layerCount = size[2]

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
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    mipLevelCount: mipLevels,
  })

  const metadataBuffer = device.createBuffer({
    size: capacity * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  return {
    capacity,
    texture, 
    layerSize, 
    layerCount, 
    format, 
    mipLevels,
    subTextures: [],
    metadataBuffer,
  }
}

/** Add a sub-texture to an atlas. */
export function addSubTexture(atlas: Atlas, width: number, height: number, label: string, wrappable: boolean, device: GPUDevice): SubTexture {
  const containingWidth = wrappable ? width*2 : width
  const containingHeight = wrappable ? height*2 : height

  const destination = findSpaceInAtlas(atlas, containingWidth, containingHeight)
  if(!destination) {
    throw new Error('No space in atlas for sub-texture')
  }
  const id = atlas.subTextures.length
  const [ x, y, layer ] = destination
  const region: Region = [x, y, containingWidth, containingHeight]
  const innerX = wrappable ? x + width/2 : x
  const innerY = wrappable ? y + height/2 : y
  const record = {
    id, 
    label, 
    x: innerX, 
    y: innerY, 
    width, 
    height, 
    layer, 
    region,
    wrappable
  }
  atlas.subTextures.push(record)
  const metadata = new Float32Array([
    record.x / atlas.layerSize[0], 
    record.y / atlas.layerSize[1], 
    record.width / atlas.layerSize[0], 
    record.height / atlas.layerSize[1], 
    0, 0
  ]);
  const ptr = id * METADATA_RECORD_SIZE;
  (new DataView(metadata.buffer)).setInt32(4*4, record.layer, true)
  device.queue.writeBuffer(atlas.metadataBuffer, ptr, metadata)
  console.info(`Added sub-texture ${id} to atlas. Wrote metadata to buffer at ${ptr}: ${metadata}`)
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

/** Copy an HTMLImageElement into a sub-texture. */
export async function copyImageToSubTexture(
    element: HTMLImageElement,
    subTextureID: number,
    atlas: Atlas,
    device: GPUDevice): Promise<void> {
  
  if(!(subTextureID in atlas.subTextures)) {
    throw new Error('Invalid sub-texture ID')
  }
  const subTexture = atlas.subTextures[subTextureID]
  await element.decode()
  for(let mipLevel=0; mipLevel<atlas.mipLevels; mipLevel++) {
    const width = max(1, subTexture.width >> mipLevel)
    const height = max(1, subTexture.height >> mipLevel)
    element.width = width
    element.height = height
    await element.decode()
    const x = subTexture.x >> mipLevel
    const y = subTexture.y >> mipLevel
    const image = await createImageBitmap(element, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    })
    const imageCopy: GPUImageCopyExternalImage = {
      source: image,
      origin: [0,0],
      flipY: true,
    }
    // main image
    device.queue.copyExternalImageToTexture({
      source: image,
      origin: [0, 0],
      flipY: true,
    }, {
      texture: atlas.texture,
      mipLevel,
      origin: [subTexture.x >> mipLevel, subTexture.y >> mipLevel, subTexture.layer],
    }, {
      width: max(1, subTexture.width >> mipLevel),
      height: max(1, subTexture.height >> mipLevel),
    })
    if(subTexture.wrappable) {
      // left border
      device.queue.copyExternalImageToTexture({
        source: image,
        origin: [width/2, 0],
        flipY: true,
      }, {
        texture: atlas.texture,
        mipLevel,
        origin: [
          subTexture.region[0] >> mipLevel, 
          y, 
          subTexture.layer
        ],
      }, {
        width: max(1, width/2),
        height: max(1, height),
      })
      // right border
      device.queue.copyExternalImageToTexture({
        source: image,
        origin: [0, 0],
        flipY: true,
      }, {
        texture: atlas.texture,
        mipLevel,
        origin: [
          x + width, 
          y, 
          subTexture.layer
        ],
      }, {
        width: max(1, width/2),
        height: max(1, height),
      })
      // top border
      device.queue.copyExternalImageToTexture({
        source: image,
        origin: [0, height/2],
        flipY: true,
      }, {
        texture: atlas.texture,
        mipLevel,
        origin: [
          x,
          subTexture.region[1] >> mipLevel, 
          subTexture.layer
        ],
      }, {
        width: max(1, width),
        height: max(1, height/2),
      })
      // bottom border
      device.queue.copyExternalImageToTexture({
        source: image,
        origin: [0, 0],
        flipY: true,
      }, {
        texture: atlas.texture,
        mipLevel,
        origin: [
          x,
          y + height,  
          subTexture.layer
        ],
      }, {
        width: max(1, width),
        height: max(1, height/2),
      })
    }
  }
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
  for(let y=0; y<layerHeight; y = max(y << 1, 256)) {
    for(let x=0; x<layerWidth; x = max(x << 1, 256)) {
      const occupied = layerSubTextures.find(st => 
        (st.region[0] === x && st.region[1] === y) ||
        intersects(x, y, width, height, ...st.region)
      )
      if(!occupied) {
        return [x, y]
      }
    }
  }
  return null
}

/** Create an ImageBitmap from an atlas layer. */
export async function getLayerAsImageBitmap(
    layer: number, 
    mipLevel: number,
    atlas: Atlas, 
    device: GPUDevice): Promise<ImageBitmap> {
  const width = atlas.layerSize[0] >> mipLevel
  const height = atlas.layerSize[1] >> mipLevel
  const exportBuffer = device.createBuffer({
    size: width * height * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const commandEncoder = device.createCommandEncoder()
  commandEncoder.copyTextureToBuffer({
    texture: atlas.texture,
    origin: [0, 0, layer],
    mipLevel,
  }, {
    buffer: exportBuffer, 
    bytesPerRow: width*4
  }, {
    width, 
    height,
    depthOrArrayLayers: 1,
  })
  device.queue.submit([commandEncoder.finish()])
  await exportBuffer.mapAsync(GPUMapMode.READ)
  const arrayBuffer = exportBuffer.getMappedRange()
  const imageData = new ImageData(new Uint8ClampedArray(arrayBuffer), width, height)
  const imageBitmap = await createImageBitmap(imageData)
  exportBuffer.unmap()
  return imageBitmap
}
