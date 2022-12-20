/** mesh.ts - Mesh store implementation for WebGPU. */

import type { MeshResource, MeshStore } from "./types"

/** Initialise a mesh store. */
export function createMeshStore(capacity: number, vertexSize: number, device: GPUDevice): MeshStore {
  const vertexBuffer = device.createBuffer({
    size: capacity * vertexSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  return {
    vertexBuffer,
    vertexSize,
    capacity,
    vertexCount: 0,
    meshes: [],
    nextMeshId: 0,
    nextVertexOffset: 0,
    vacancies: [],
  }
}

/** Add a mesh to the store. Returns the mesh ID. */
export function addMesh(
    name: string,
    vertexCount: number,
    data: Float32Array,  
    store: MeshStore,
    device: GPUDevice): number {

  if(data.byteLength !== vertexCount * store.vertexSize) {
    throw new Error('Invalid mesh data size')
  }
  if(store.vertexCount + vertexCount > store.capacity) {
    throw new Error('Mesh store is full')
  }
  const meshId = store.nextMeshId
  const vertexOffset = store.nextVertexOffset
  const vertexPointer = vertexOffset * store.vertexSize
  const mesh = { 
    id: meshId, 
    name,
    vertexPointer, 
    vertexCount,
    vertexBuffer: store.vertexBuffer, // todo: remove
  }
  store.meshes[meshId] = mesh
  store.nextMeshId++
  store.nextVertexOffset += vertexCount
  store.vertexCount += vertexCount
  store.capacity -= vertexCount
  device.queue.writeBuffer(store.vertexBuffer, vertexPointer, data)
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
