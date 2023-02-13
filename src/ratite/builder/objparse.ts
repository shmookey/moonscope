/** Parser/importer for the OBJ format for 3D meshes. */

import type { XMesh, MeshVertex, Vec4 } from '../types'
import { getBoundingVolume } from './mesh'

/** State data for OBJ file parser. */
type ObjParseState = {
  vertexPositions: ObjVertexPosition[],
  vertexNormals:   ObjVertexNormal[],
  vertexTexCoords: ObjVertexTexCoord[],
  groups:          ObjGroup[],
  currentGroup:    ObjGroup | null,
}

type VertexKey = string // for vertex assembly cache
type VertexCacheEntry = {
  index:  number,
  vertex: MeshVertex,
  faces:  Triangle[],
}
type VertexCache = { [k: VertexKey]: VertexCacheEntry }

type ObjVertexPosition = [number, number, number]
type ObjVertexNormal   = [number, number, number]
type ObjVertexTexCoord = [number, number]
type ObjVertexTriplet  = [number, number, number] // position, normaml, uv
type ObjFace = ObjVertexTriplet[]
type ObjTriangleFace = [ObjVertexTriplet, ObjVertexTriplet, ObjVertexTriplet]
type Triangle = [MeshVertex, MeshVertex, MeshVertex]
type ObjGroup = {
  name: string,
  faces: ObjFace[],
}

export function objToXMesh(objSrc: string): XMesh[] {
  const parseResult = parseObjFile(objSrc)
  return parseResult.groups.map(g => objGroupToXMesh(g, parseResult))
}

/** Parse an OBJ file.
 * 
 * In the current implementation, only the vertex positions, vertex normals,
 * vertex texture coordinates, and faces are parsed. The rest of the OBJ file
 * is ignored.
 */
export function parseObjFile(objSrc: string): ObjParseState {
  const state: ObjParseState = {
    vertexPositions: [],
    vertexNormals:   [],
    vertexTexCoords: [],
    groups:          [],
    currentGroup:    null,
  }
  const lines = objSrc.split(/\r/).map(x => x.trim())
  for (const line of lines) {
    parseLine(line, state)
  }
  return state
}

/** Create a mesh from an OBJ group. */
export function objGroupToXMesh(group: ObjGroup, state: ObjParseState): XMesh {
  const vertexCache: VertexCache = {}
  const vertices: MeshVertex[] = []
  const indices: number[] = []
  let nextIndex = 0
  for(const face of group.faces) {
    const triangles = triangulateFace(face)
    for(const triangle of triangles) {
      const triangleVertices: Triangle = [null, null, null]
      for(let i=0; i<3; i++) {
        const triplet = triangle[i]
        const key = `${triplet[0]}/${triplet[1]}/${triplet[2]}`
        if(!(key in vertexCache)) {
          const index = nextIndex
          const positionIndex = triplet[0]
          const uvIndex = triplet[1]
          const normalIndex = triplet[2]

          if(!Number.isSafeInteger(positionIndex))
            throw new Error(`Invalid position index: ${positionIndex}`)
          if(positionIndex > state.vertexPositions.length)
            throw `Position vertex ID out of bounds: ${positionIndex} (max ${state.vertexPositions.length})`
          const position = state.vertexPositions[positionIndex-1]
          if(!position)
            throw `Invalid position vertex: ${positionIndex} - ${position}`

          let normal: [number, number, number] = [0, 0, 0]
          if(Number.isSafeInteger(normalIndex)) {
            if(normalIndex > state.vertexNormals.length)
              throw `Invalid normal vertex: ${normalIndex}`
            normal = state.vertexNormals[normalIndex-1]
            if(!normal) {
              console.log(normalIndex, state.vertexNormals.length)
            }
          }

          let uv: [number, number] = [0, 0]
          if(Number.isSafeInteger(uvIndex)) {
            if(uvIndex > state.vertexTexCoords.length)
              throw `Invalid texture coordinate vertex: ${uvIndex}`
            uv = state.vertexTexCoords[uvIndex-1]
          }
          
          const vertex: MeshVertex = {
            position:  [...position, 1],
            normal:    [...normal, 1],
            uv:        [...uv],
            tangent:   [0, 0, 0, 1],
            bitangent: [0, 0, 0, 1],
            textures:  [0, 0, 0, 0],
          }
          nextIndex++
          vertexCache[key] = {index, vertex, faces: []}
          vertices.push(vertex)
        }
        const {index, vertex, faces} = vertexCache[key]
        indices.push(index)
        triangleVertices[i] = vertex
        faces.push(triangleVertices)
      }
    }
  }

  // Compute tangents and bitangents.
  for(const key in vertexCache) {
    const {vertex, faces} = vertexCache[key]
    const [tangent, bitangent] = computeTangentAndBitangent(vertex, faces)
    vertex.tangent = tangent
    vertex.bitangent = bitangent
  }

  const bounds = getBoundingVolume(vertices)

  return {
    id:             0,
    name:           group.name,
    vertexCount:    vertices.length,
    indexCount:     indices.length,
    vertices:       vertices,
    indices:        indices,
    material:       'default',
    boundingVolume: bounds,
  }
}

function computeTangentAndBitangent(vertex: MeshVertex, faces: Triangle[]): [Vec4, Vec4] {
  const tangent: Vec4 = [0, 0, 0, 0]
  const bitangent: Vec4 = [0, 0, 0, 0]
  for(const face of faces) {
    const [v0, v1, v2] = face
    const [p0, p1, p2] = [v0.position, v1.position, v2.position]
    const [uv0, uv1, uv2] = [v0.uv, v1.uv, v2.uv]
    const [x1, y1, z1] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    const [x2, y2, z2] = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
    const [s1, t1] = [uv1[0] - uv0[0], uv1[1] - uv0[1]]
    const [s2, t2] = [uv2[0] - uv0[0], uv2[1] - uv0[1]]
    const r = 1.0 / (s1 * t2 - s2 * t1)
    const sdir: [number, number, number] = [
      (t2 * x1 - t1 * x2) * r,
      (t2 * y1 - t1 * y2) * r,
      (t2 * z1 - t1 * z2) * r,
    ]
    const tdir: [number, number, number] = [
      (s1 * x2 - s2 * x1) * r,
      (s1 * y2 - s2 * y1) * r,
      (s1 * z2 - s2 * z1) * r,
    ]
    for(let i=0; i<3; i++) {
      tangent[i] += sdir[i]
      bitangent[i] += tdir[i]
    }
  }
  for(let i=0; i<3; i++) {
    tangent[i] /= faces.length
    bitangent[i] /= faces.length
  }
  return [tangent, bitangent]
}


/** Convert an OBJ file to a list of XMesh objects, creating one XMesh per group. */
//export function objToXMeshes(objFile: string): XMesh[] {
//  const state = parseObjFile(objFile)
//
//  // First triangulate any faces that are not already triangles.
//  for (const group of state.groups) {
//    const newFaces: ObjFace[] = []
//    for (const face of group.faces) {
//      if (face.length == 3) {
//        newFaces.push(face)
//      } else {
//        newFaces.push(...triangulateFace(face))
//      }
//    }
//    group.faces = newFaces
//  }
//
//  const meshes: XMesh[] = []
//  for (const group of state.groups) {
//    const mesh: XMesh = {
//      vertices: [],
//      indices: [],
//    }
//  }
//}

/** Triangulate an OBJ face and produce a list of MeshVertex objects. */
function objFaceToMeshVertices(face: ObjFace, state: ObjParseState): MeshVertex[] {
  const vertices: MeshVertex[] = []
  for (const triplet of face) {
    const vertex: MeshVertex = {
      position:  [...state.vertexPositions[triplet[0] - 1], 1],
      normal:    [...state.vertexNormals[triplet[1] - 1], 1],
      uv:        state.vertexTexCoords[triplet[2] - 1],
      tangent:   [0, 0, 0, 1],
      bitangent: [0, 0, 0, 1],
      textures:  [0, 0, 0, 0],
    }
    vertices.push(vertex)
  }
  return vertices
}

/** Parse a line in an OBJ file. */
function parseLine(line: string, state: ObjParseState): void {
  const parts = line.split(/\s+/)
  const command = parts[0]
  const args = parts.slice(1)
  if(line.length == 0)
    return
  switch (command) {
    case 'v':
      state.vertexPositions.push(parseVertexPosition(args))
      break
    case 'vn':
      state.vertexNormals.push(parseVertexNormal(args))
      break
    case 'vt':
      state.vertexTexCoords.push(parseVertexTexCoord(args))
      break
    case 'f':
      state.currentGroup.faces.push(parseFace(args))
      break
    case 'g':
      state.currentGroup = {
        name: args[0],
        faces: [],
      }
      state.groups.push(state.currentGroup)
      break
    case '#':
      break
    case 's':
      break
    case 'mtllib':
      break
    default:
      console.warn(`Unknown OBJ command: ${command}`)
      break
  }
}

/** Parse a vertex position line in an OBJ file. */
function parseVertexPosition(args: string[]): ObjVertexPosition {
  return [parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])]
}

/** Parse a vertex normal line in an OBJ file. */
function parseVertexNormal(args: string[]): ObjVertexNormal {
  return [parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])]
}

/** Parse a vertex texture coordinate line in an OBJ file. */
function parseVertexTexCoord(args: string[]): ObjVertexTexCoord {
  return [parseFloat(args[0]), parseFloat(args[1])]
}

/** Parse a face line in an OBJ file. */
function parseFace(args: string[]): ObjFace {
  return args.map(parseVertexTriplet)
}

/** Parse a vertex triplet. */
function parseVertexTriplet(arg: string): ObjVertexTriplet {
  const parts = arg.split('/')
  return [
    parseInt(parts[0], 10),
    parseInt(parts[1], 10),
    parseInt(parts[2], 10),
  ]
}

/** Convert a polygon face to an array of individual triangle faces. */
function triangulateFace(face: ObjFace): ObjTriangleFace[] {
  const triangles: ObjTriangleFace[] = []
  for (let i = 1; i < face.length - 1; i++) {
    triangles.push([face[0], face[i], face[i + 1]])
  }
  return triangles
}
