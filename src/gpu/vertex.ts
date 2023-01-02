/** Vertex interface.
 * 
 * See doc/Vertex specification.txt for details.
 */

import type { MeshVertex, XMesh } from './types'
import {VERTEX_SIZE} from './constants.js'

export type Float32x3 = [number, number, number]
export type Float32x4 = [number, number, number, number]
export type Float32x2 = [number, number]
export type Snorm16x4 = [number, number, number, number]
export type Int16x4   = [number, number, number, number]
export type Uint16x4  = [number, number, number, number]
export type Uint32x4  = [number, number, number, number]


/** Vertex constructor. Spatial w coordinate implicitly 1. */
export function Vertex(
    position:  Float32x3,
    uv:        Float32x2,
    normal:    Snorm16x4,
    tangent:   Snorm16x4,
    bitangent: Snorm16x4,
    textures:  Uint32x4 = [0, 0, 0, 0]): MeshVertex {
  return {
    position:  [...position, 1],
    uv:        uv,
    normal:    normal,
    tangent:   tangent,
    bitangent: bitangent,
    textures:  textures,
  }
}

/** Read vertices from a buffer. */
export function readVertices(count: number, offset: number, buffer: ArrayBuffer): MeshVertex[] {
  const view = new DataView(buffer)
  const vertices: MeshVertex[] = []
  for(let i=0; i<count; i++) {
    const vertex: MeshVertex = {
      position:  readFloat32x4(offset,      view),
      uv:        readFloat32x2(offset + 16, view),
      normal:    readSnorm16x4(offset + 24, view),
      tangent:   readSnorm16x4(offset + 32, view),
      bitangent: readSnorm16x4(offset + 40, view),
      textures:  readUint32x4(offset + 48, view),
    }
    vertices.push(vertex)
    offset += VERTEX_SIZE
  }
  return vertices
}

/** Write vertices to a buffer. */
export function writeVertices(vertices: MeshVertex[], offset: number, buffer: ArrayBuffer): void {
  const view = new DataView(buffer)
  for(const vertex of vertices) {
    writeFloat32x4(vertex.position,  offset,      view)
    writeFloat32x2(vertex.uv,        offset + 16, view)
    writeSnorm16x4(vertex.normal,    offset + 24, view)
    writeSnorm16x4(vertex.tangent,   offset + 32, view)
    writeSnorm16x4(vertex.bitangent, offset + 40, view)
    writeUint32x4( vertex.textures,  offset + 48, view)
    offset += VERTEX_SIZE
  }
}

/** Read 4x 16-bit little-endian signed normalised numbers. */
function readSnorm16x4(offset: number, view: DataView): Snorm16x4 {
  return readInt16x4(offset, view).map(x => x / 32767) as Snorm16x4
}

/** Read 4x 32-bit little-endian floats. */
function readFloat32x4(offset: number, view: DataView): Float32x4 {
  const arr = new Array(4)
  for(let i=0; i<4; i++) {
    arr[i] = view.getFloat32(offset + i*4, true)
  }
  return arr as Float32x4
}

/** Read 2x 32-bit little-endian floats. */
function readFloat32x2(offset: number, view: DataView): Float32x2 {
  const arr = new Array(2)
  for(let i=0; i<2; i++) {
    arr[i] = view.getFloat32(offset + i*4, true)
  }
  return arr as Float32x2
}


/** Read 4x 16-bit little-endian signed integers. */
function readInt16x4(offset: number, view: DataView): Int16x4 {
  const arr = new Array(4)
  for(let i=0; i<4; i++) {
    arr[i] = view.getInt16(offset + i*2, true)
  }
  return arr as Int16x4
}

/** Read 4x 16-bit little-endian unsigned integers. */
function readUint16x4(offset: number, view: DataView): Uint16x4 {
  const arr = new Array(4)
  for(let i=0; i<4; i++) {
    arr[i] = view.getUint16(offset + i*2, true)
  }
  return arr as Uint16x4
}

/** Read 4x 32-bit little-endian unsigned integers. */
function readUint32x4(offset: number, view: DataView): Uint32x4 {
  const arr = new Array(4)
  for(let i=0; i<4; i++) {
    arr[i] = view.getUint32(offset + i*4, true)
  }
  return arr as Uint32x4
}


/** Write 4x 16-bit little-endian signed normalised numbers. */
function writeSnorm16x4(arr: Snorm16x4, offset: number, view: DataView): void {
  const arr2: Int16x4 = arr.map(x => Math.round(x * 32767)) as Int16x4
  writeInt16x4(arr2, offset, view)
}

/** Write 4x 32-bit little-endian floats. */
function writeFloat32x4(arr: Float32x4, offset: number, view: DataView): void {
  for(let i=0; i<arr.length; i++) {
    view.setFloat32(offset + i*4, arr[i], true)
  }
}

/** Write 2x 32-bit little-endian floats. */
function writeFloat32x2(arr: Float32x2, offset: number, view: DataView): void {
  for(let i=0; i<arr.length; i++) {
    view.setFloat32(offset + i*4, arr[i], true)
  }
}

/** Write an array of 16-bit little-endian signed integers. */
function writeInt16x4(arr: Int16x4, offset: number, view: DataView): void {
  for(let i=0; i<arr.length; i++) {
    view.setInt16(offset + i*2, arr[i], true)
  }
}

/** Write an array of 16-bit little-endian unsigned integers. */
function writeUint16Array(arr: Uint16x4, offset: number, view: DataView): void {
  for(let i=0; i<arr.length; i++) {
    view.setUint16(offset + i*2, arr[i], true)
  }
}

/** Write 4x 32-bit little-endian unsigned integers. */
function writeUint32x4(arr: Uint32x4, offset: number, view: DataView): void {
  for(let i=0; i<arr.length; i++) {
    view.setUint32(offset + i*4, arr[i], true)
  }
}