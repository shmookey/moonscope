import type {ResourceBundleDescriptor, TextureResourceDescriptor, MeshResourceDescriptor, Atlas, 
  ResourceBundle, TextureResource, MeshResource, Vertex, XVertex} from "./types"
import { addSubTexture, copyImageBitmapToSubTexture } from "./atlas.js"
import {VERTEX_SIZE} from "./constants.js"


/** Load a resource bundle. */
export async function loadResourceBundle(path: string, atlas: Atlas, device: GPUDevice): Promise<ResourceBundle> {
  const descriptor = await fetchResourceBundleDescriptor(path)
  return loadResourceBundleFromDescriptor(descriptor, atlas, device)
}

/** Load a resource bundle given a ResourceBundleDescriptor. */
export async function loadResourceBundleFromDescriptor(descriptor: ResourceBundleDescriptor, atlas: Atlas, device: GPUDevice): Promise<ResourceBundle> {
  const {meshes, label, textures} = descriptor
  const totalVertices = meshes.reduce((total, mesh) => total + mesh.vertexCount, 0)
  const vertexBuffer = device.createBuffer({
    size:  VERTEX_SIZE * totalVertices,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  const textureResources = await Promise.all(textures.map(texture => loadTextureResource(texture, atlas, device)))
  const meshResources = []
  let vertexPointer = 0
  for(let mesh of meshes) {
    const meshResource = await loadMeshResource(mesh, atlas, vertexPointer, vertexBuffer, device)
    meshResources.push(meshResource)
    vertexPointer += meshResource.vertexCount * VERTEX_SIZE
  }
  return {label, vertexBuffer, atlas, meshes: meshResources, textures: textureResources}
}

/** Load a mesh resource. */
export async function loadMeshResource(
    descriptor: MeshResourceDescriptor, 
    atlas: Atlas,
    vertexPointer: number,
    vertexBuffer: GPUBuffer,
    device: GPUDevice): Promise<MeshResource> {
  const {id, label, vertexCount} = descriptor
  let vertices = descriptor.vertices
  if(!vertices) {
    const response = await fetch(descriptor.src)
    if (descriptor.srcType === 'json') {
      const json = await response.json()
      vertices = json.vertices
    } else if (descriptor.srcType === 'bin') {
      const buffer = await response.arrayBuffer()
      throw 'Loading binary mesh files is not implemented'
    } else {
      throw new Error(`Unknown mesh resource source type: ${descriptor.srcType}`)
    }
  }
  const vertexData = new Float32Array(vertices.map(vertex => remapUVs(vertex, atlas)).flat())
  device.queue.writeBuffer(vertexBuffer, vertexPointer, vertexData.buffer)
  return {id, label, vertexCount, vertexPointer, vertexBuffer}
}

/** Remap UV coordinates in an XVertex using an Atlas to produce a Vertex. */
function remapUVs(vertex: XVertex, atlas: Atlas): Vertex {
  const [vx,vy,vz,w,u,v,nx,ny,nz,textureId] = vertex
  const id = textureId in atlas.subTextures ? textureId : 0
  const {x, y, width, height, layer} = atlas.subTextures[id]
  const u2 = (x + u * width) / atlas.layerSize[0]
  const v2 = (y + v * height) / atlas.layerSize[1]
  const umin = x / atlas.layerSize[0]
  const vmin = y / atlas.layerSize[1]
  const umax = (x + width) / atlas.layerSize[0]
  const vmax = (y + height) / atlas.layerSize[1]

  //console.log([vx,vy,vz,w,u2,v2,layer,nx,ny,nz])
  return [vx,vy,vz,w,u,v,layer,nx,ny,nz,umin,vmin,umax,vmax]
}

/** Load a texture resource. */
export async function loadTextureResource(
    descriptor: TextureResourceDescriptor, 
    atlas: Atlas,
    device: GPUDevice): Promise<TextureResource> {
  const {id, label, size} = descriptor
  const subTexture = addSubTexture(atlas, size[0], size[1], label)
  if (descriptor.src) {
    const image = await loadImageBitmap(descriptor.src)
    copyImageBitmapToSubTexture(device, atlas, subTexture.id, image, [0, 0])
  }
  return {id, label, size, texture: subTexture}
}

/** Load an image from a URL into an ImageBitmap. */
export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url)
  const blob = await response.blob()
  const image = await createImageBitmap(blob)
  return image
}

/** Fetch a resource bundle descriptor from a URL and validate it. */
export async function fetchResourceBundleDescriptor(url: string): Promise<ResourceBundleDescriptor> {
  const response = await fetch(url)
  const bundle = await response.json()
  validateResourceBundleDescriptor(bundle)
  return bundle
}

/** Ensure a resource bundle descriptor is valid. */
export function validateResourceBundleDescriptor(bundle: ResourceBundleDescriptor) {
  const {meshes, textures} = bundle
  if (!meshes) {
    throw new Error('Resource bundle missing meshes')
  }
  if (!textures) {
    throw new Error('Resource bundle missing textures')
  }
  for (const mesh of meshes) {
    if (!('id' in mesh)) {
      throw new Error('Resource bundle mesh missing ID')
    }
    if (!('label' in mesh)) {
      throw new Error('Resource bundle mesh missing label')
    }
    if (!('vertexCount' in mesh)) {
      throw new Error('Resource bundle mesh missing vertex count')
    }
  }
  for (const texture of textures) {
    if (!('id' in texture)) {
      throw new Error('Resource bundle texture missing ID')
    }
    if (!('label' in texture)) {
      throw new Error('Resource bundle texture missing label')
    }
    if (!('size' in texture)) {
      throw new Error('Resource bundle texture missing size')
    }
  }
}


