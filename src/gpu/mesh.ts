/** mesh.ts - Mesh store implementation for WebGPU. */

import type { MeshResource, MeshResourceDescriptor, MeshStore, MeshVertex, XMesh } from "./types"
import {VERTEX_SIZE} from "./constants.js"
import {writeVertices} from "./vertex.js"

/** Initialise a mesh store. */
export function createMeshStore(
    vertexCapacity: number, 
    indexCapacity:  number,
    vertexSize:     number, 
    indexSize:      number,
    device:         GPUDevice): MeshStore {
  const vertexBuffer = device.createBuffer({
    label: 'meshstore-vertex',
    size: vertexCapacity * vertexSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  const indexBuffer = device.createBuffer({
    label: 'meshstore-index',
    size: indexCapacity * indexSize,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  })
  return {
    vertexBuffer,
    indexBuffer,
    vertexSize,
    indexSize,
    vertexCapacity,
    indexCapacity,
    vertexCount: 0,
    indexCount: 0,
    meshes: [],
    nextMeshId: 0,
    nextVertexOffset: 0,
    nextIndexOffset: 0,
    vacancies: [],
    nextIndex: 0,
  }
}

/** Add a mesh to the store. Returns the mesh ID. */
export function addMesh(
    name: string,
    vertexCount: number,
    vertexData: ArrayBuffer,
    indices: number[],
    store: MeshStore,
    device: GPUDevice): number {

  if(vertexData.byteLength !== vertexCount * store.vertexSize)
    throw new Error('Invalid mesh data size')
  if(store.vertexCount + vertexCount > store.vertexCapacity)
    throw new Error('Exceeded vertex capacity of mesh store')
  if(store.indexCount + indices.length > store.indexCapacity)
    throw new Error('Exceeded index capacity of mesh store')

  const meshId = store.nextMeshId
  const indexCount = indices.length
  const vertexOffset = store.nextVertexOffset
  const indexOffset = store.nextIndexOffset
  const vertexPointer = vertexOffset * store.vertexSize
  const indexPointer = indexOffset * store.indexSize
  const mesh: MeshResource = { 
    id: meshId, 
    name,
    vertexPointer, 
    vertexCount,
    indexCount,
    indexPointer,
    indexOffset,
  }
  store.meshes[meshId] = mesh
  store.nextMeshId++
  store.nextVertexOffset += vertexCount
  store.nextIndexOffset += indexCount
  store.vertexCount += vertexCount
  store.indexCount += indexCount
  //store.vertexCapacity -= vertexCount
  //store.indexCapacity -= indexCount
  device.queue.writeBuffer(store.vertexBuffer, vertexPointer, vertexData)
  const indexData = store.indexSize == 2 ? new Uint16Array(indices) : new Uint32Array(indices)
  for(let i = 0; i < indexData.length; i++)
    indexData[i] += vertexOffset
  device.queue.writeBuffer(store.indexBuffer, indexPointer, indexData)
  return meshId
}

/** Remove a mesh from the store. */
export function removeMesh(meshId: number, store: MeshStore): void {
  if(!(meshId in store.meshes)) {
    throw new Error('Invalid mesh ID')
  }
  const mesh = store.meshes[meshId]
  store.vacancies.push([mesh.vertexPointer, mesh.vertexCount])
  delete store.meshes[meshId]
}

/** Get a mesh from the store by ID. */
export function getMeshById(meshId: number, store: MeshStore): MeshResource {
  if(!(meshId in store.meshes)) {
    throw new Error('Invalid mesh ID')
  }
  return store.meshes[meshId]
}

/** Get a mesh from the store by name. */
export function getMeshByName(name: string, store: MeshStore): MeshResource {
  for(const mesh of store.meshes) {
    if(mesh.name === name) {
      return mesh
    }
  }
  throw new Error('Invalid mesh name')
}

/** Serialise vertex data for a single mesh. */
export function serialiseVertices(vertices: MeshVertex[]): ArrayBuffer {
  const vertexCount = vertices.length
  const byteLength = vertexCount * VERTEX_SIZE
  const buffer = new ArrayBuffer(byteLength)
  writeVertices(vertices, 0, buffer)
  return buffer
}

/** Serialise mesh data.
 * 
 * Creates an ArrayBuffer containing binary mesh data, and a list of
 * MeshResourceDescriptors suitable for loading them. Assumes that the data is
 * associated with the data resource named `mesh.bin` in the bundle.
 */
export function serialiseMeshes(meshes: XMesh[]): SerialiseMeshesResult {
  const vertexCount = meshes.reduce((acc, x) => acc + x.vertexCount, 0)
  const byteLength = vertexCount * VERTEX_SIZE
  const buffer = new ArrayBuffer(byteLength)
  const descriptors: MeshResourceDescriptor[] = []
  let offset = 0
  for(let i=0; i<meshes.length; i++) {
    const mesh = meshes[i]
    writeVertices(mesh.vertices, offset, buffer)
    const descriptor: MeshResourceDescriptor = {
      id:          mesh.id,
      name:        mesh.name,
      vertexCount: mesh.vertexCount,
      indexCount:  mesh.indices.length,
      src:         'mesh.bin',
      srcType:     'bin',
      srcOffset:   offset,
    }
    offset += mesh.vertexCount * VERTEX_SIZE
  }
  return {
    buffer: buffer,
    meshes: descriptors,
  }
}

export type SerialiseMeshesResult = {
  buffer: ArrayBuffer,
  meshes: MeshResourceDescriptor[],
}

/** Serialise a mesh to JSON.
 * 
 * Avoids the problem of `JSON.stringify` turning the TypedArray vertex
 * attributes into dicts with numeric keys, instead of serialising them
 * as regular JSON arrays.
 */
export function serialiseMeshToJSON(mesh: XMesh): string {
  return JSON.stringify({
    ...mesh,
    vertices: mesh.vertices.map(prepareVertexForJSON),
  })
}

/** Make a vertex JSON-serialisable.
 * 
 * Avoids the problem of `JSON.stringify` turning the TypedArray vertex
 * attributes into dicts with numeric keys, instead of serialising them
 * as regular JSON arrays.
 */
export function prepareVertexForJSON(vertex: MeshVertex): any {
  return {
    position: Array.from(vertex.position),
    uv: Array.from(vertex.uv),
    normal: Array.from(vertex.normal),
    tangent: Array.from(vertex.tangent),
    bitangent: Array.from(vertex.bitangent),
    textures: Array.from(vertex.textures),
  }
}
