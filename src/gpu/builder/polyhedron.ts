/** Polyhedron builder functions. */

import type {MeshVertex, Vec2, Vec3, XMesh, XVertex} from "../types"
import type { Polyhedron, Triangle } from "./types"
import {setTextures, v3normalize, v3sub, v3add, v3mid} from "./mesh.js"
import {Float32x2, Float32x3, Snorm16x4, Vertex} from "../vertex.js"
import {latLonToUnitVec, unitVecToLatLon} from "../common.js"
const { atan2, sin, cos, tan, sqrt, PI } = Math

/** Create an icosahedron. */
export function icosahedron(): Polyhedron {
  const phi = (1 + sqrt(5)) * 0.5 // golden ratio
  const a = 1
  const b = 1 / phi
  const vertices: Vec3[] = ([
    [ 0,  b, -a],
    [ b,  a,  0],
    [-b,  a,  0],
    [ 0,  b,  a],
    [ 0, -b,  a],
    [-a,  0,  b],
    [ 0, -b, -a],
    [ a,  0, -b],
    [ a,  0,  b],
    [-a,  0, -b],
    [ b, -a,  0],
    [-b, -a , 0],
  ] as Vec3[]).map(v3normalize)
  //  project_to_unit_sphere(mesh);
  const faces = [
    [ 2,  1,  0],
    [ 1,  2,  3],
    [ 5,  4,  3],
    [ 4,  8,  3],
    [ 7,  6,  0],
    [ 6,  9,  0],
    [11, 10,  4],
    [10, 11,  6],
    [ 9,  5,  2],
    [ 5,  9, 11],
    [ 8,  7,  1],
    [ 7,  8, 10],
    [ 2,  5,  3],
    [ 8,  1,  3],
    [ 9,  2,  0],
    [ 1,  7,  0],
    [11,  9,  6],
    [ 7, 10,  6],
    [ 5, 11,  4],
    [10,  8,  4]
  ]
  return {vertices, faces}
}

/** Create a subdivided icosahedron.
 * 
 * `n` is the number of subdivisions.
 */
export function subdividedIcosahedron(n: number): Polyhedron {
  let p = icosahedron()
  for (let i = 0; i < n; i++) {
    p = projectToUnitSphere(
      subdivideTrianglePolyhedronByMidpoint(p))
  }
  return p
}

/** Create a mesh from a polyhedron. */
export function polyhedronMesh(
    p: Polyhedron, 
    textures: [number, number, number, number],
    useLatLon: boolean): XMesh {

  // todo: non-radial normals
  // this next line is kind of pointless because the only polyhedrons we deal
  // with so far are already projected to the unit sphere, i.e. the vertices
  // themselves are their own normal vectors.
  const normals = p.vertices.map(v => v3normalize(v))
  // this is also questionable: we're going to say the tangent is in the direction
  // of lines of latitude, and the bitangent is in the direction of lines of longitude
  const tangents = p.vertices.map(v => {
    const [lat,lon] = unitVecToLatLon(v)
    return latLonToUnitVec([lat, lon + PI/2])
  })
  const bitangents = p.vertices.map(v => {
    const [lat,lon] = unitVecToLatLon(v)
    return latLonToUnitVec([lat + PI/2, lon])
  })

  const uvMap = [[0, 0], [1, 0], [0, 1]]
  const vertices: MeshVertex[] = p.faces.flatMap(vertices => vertices.map((vId,i) => {
    const [x, y, z] = p.vertices[vId]
    const position:  Float32x3 = [x,y,z]
    const normal:    Snorm16x4 = Array.from(normals[vId])    as Snorm16x4
    const tangent:   Snorm16x4 = Array.from(tangents[vId])   as Snorm16x4
    const bitangent: Snorm16x4 = Array.from(bitangents[vId]) as Snorm16x4
    const uv:        Float32x2 = uvMap[i]                    as Float32x2
    let [u, v] = uvMap[i]

    if(useLatLon) {
      // todo: are these even right??
      // todo also: maybe just figure out proper sphere-mapped UVs instead of
      // this hacky lat/lon thing
      u = atan2(y, sqrt(x*x + z*z))  // latitude
      v = atan2(z, x)                // longitude
    }

    return Vertex(position, uv, normal, tangent, bitangent, textures)
  }))
  return {
    id: 0,
    name: 'polyhedron',
    vertexCount: vertices.length,
    vertices,
    indexCount: vertices.length,
    indices: new Array(vertices.length).fill(0).map((_,i) => i),
  }
}

/** Centroid of a triangle. */
function triangleCentroid(triangle: Triangle): Vec3 {
  const [a, b, c] = triangle
  return [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ]
}


/** Subdivide a triangle into 3 smaller triangles. */
function subdivideTriangle3(abc: Triangle): [Triangle, Triangle, Triangle] {
  const centroid = triangleCentroid(abc)
  return [
    [abc[0], abc[1], centroid],
    [abc[1], abc[2], centroid],
    [abc[2], abc[0], centroid],
  ]
}

/** Subdivide a triangle into 4 smaller triangles. */
function subdivideTriangle4(abc: Triangle): [Triangle, Triangle, Triangle, Triangle] {
  const [a, b, c] = abc
  const ab = v3mid(a, b)
  const bc = v3mid(b, c)
  const ca = v3mid(c, a)
  return [
    [a, ab, ca],
    [ab, b, bc],
    [bc, c, ca],
    [ab, bc, ca],
  ]
}

/** Subdivide the surface of a polyhedron with triangle faces by creating new
 * vertices at their centroids. */
export function subdivideTrianglePolyhedronByCentroid(p: Polyhedron): Polyhedron {
  const centroids = p.faces.map(face => 
    triangleCentroid(face.map(vId => p.vertices[vId]) as Triangle))
  const vertices = [...p.vertices, ...centroids]
  const faces = p.faces.flatMap((face, faceIdx) => {
    const [a, b, c] = face
    const centroid = p.vertices.length + faceIdx
    return [
      [a, b, centroid],
      [b, c, centroid],
      [c, a, centroid],
    ]
  })
  return {vertices, faces}
}

/** Subdivide the surface of a polyhedron with triangle faces by creating new
 * vertices at the midpoints of their edges. */
export function subdivideTrianglePolyhedronByMidpoint(p: Polyhedron): Polyhedron {
  const midpoints = p.faces.flatMap(face => {
    const [a, b, c] = face
    return [
      v3mid(p.vertices[a], p.vertices[b]),
      v3mid(p.vertices[b], p.vertices[c]),
      v3mid(p.vertices[c], p.vertices[a]),
    ]
  })
  const vertices = [...p.vertices, ...midpoints]
  const faces = p.faces.flatMap((face, faceIdx) => {
    const [a, b, c] = face
    const [ab, bc, ca] = [0, 1, 2].map(i => p.vertices.length + faceIdx * 3 + i)
    return [
      [a, ab, ca],
      [ab, b, bc],
      [bc, c, ca],
      [ab, bc, ca],
    ]
  })
  return {vertices, faces}
}

/** Project the vertices of a polyhedron to the unit sphere. */
export function projectToUnitSphere(p: Polyhedron): Polyhedron {
  return {
    ...p,
    vertices: p.vertices.map(v3normalize)
  }
}
