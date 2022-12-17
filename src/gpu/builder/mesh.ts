import type {Mesh, XMesh, Vec2, Vec3, XVertex, Quat} from "../types"
import {vec3, mat4, quat} from "../../../node_modules/gl-matrix/esm/index.js"


//
// Primitive builders
//

/** Create a triangle mesh from three points.
 * `a`, `b`, and `c` are mapped to `(0,0)`, `(1,0)`, and `(0,1)` in UV space.
 * `t` is the texture ID.
 * Size: 1 triangle, 3 vertices.
 */
export function triangleFromPoints(a: Vec3, b: Vec3, c: Vec3, t: number, id: number = 0, label: string = null): XMesh {
  const n = triangleNormal(a, b, c)
  return {id, label, vertexCount: 3, vertices: [
    [a[0], a[1], a[2], 1, 0, 0, n[0], n[1], n[2], t],
    [b[0], b[1], b[2], 1, 1, 0, n[0], n[1], n[2], t],
    [c[0], c[1], c[2], 1, 0, 1, n[0], n[1], n[2], t],
  ]}
}

/** Create a rectangle mesh from two points on the XY plane.
 * `a` and `b` are mapped to `(0,0)` and `(1,1)` in UV space.
 * `t` is the texture ID.
 * Size: 2 triangles, 6 vertices.
 */
export function rectangleFromPoints(a: Vec2, b: Vec2, t: number, id: number = 0, label: string = null): XMesh {
  const x0 = a[0], y0 = a[1]
  const x1 = b[0], y1 = b[1]
  return {id, label, vertexCount: 6, vertices: [
    [x0, y0, 0, 1, 0, 0, 0, 0, 1, t],
    [x1, y0, 0, 1, 1, 0, 0, 0, 1, t],
    [x0, y1, 0, 1, 0, 1, 0, 0, 1, t],
    [x0, y1, 0, 1, 0, 1, 0, 0, 1, t],
    [x1, y0, 0, 1, 1, 0, 0, 0, 1, t],
    [x1, y1, 0, 1, 1, 1, 0, 0, 1, t],
  ]}
}

/** Create a unit cube mesh.
 * All sides are mapped to the UV space `(0,0)` to `(1,1)`.
 * `t` is the first texture ID. The other 5 sides are mapped to `t+1` through `t+6`.
 * Normals point outwards.
 * Size: 12 triangles, 36 vertices.
 * Face order: +X, -X, +Y, -Y, +Z, -Z.
 */
export function cube(t: number, id: number = 0, label: string = null): XMesh {
  return { id, label, vertexCount: 36, vertices: [
    // +X
    [1, 0, 0, 1, 1, 0, 1, 0, 0, t],
    [1, 1, 0, 1, 1, 1, 1, 0, 0, t],
    [1, 0, 1, 1, 0, 0, 1, 0, 0, t],
    [1, 1, 0, 1, 1, 1, 1, 0, 0, t],
    [1, 1, 1, 1, 0, 1, 1, 0, 0, t],
    [1, 0, 1, 1, 0, 0, 1, 0, 0, t],
    // -X
    [0, 0, 0, 1, 0, 0, -1, 0, 0, t+1],
    [0, 0, 1, 1, 1, 0, -1, 0, 0, t+1],
    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
    [0, 0, 1, 1, 1, 0, -1, 0, 0, t+1],
    [0, 1, 1, 1, 1, 1, -1, 0, 0, t+1],
    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
    // +Y
    [0, 1, 0, 1, 0, 0, 0, 1, 0, t+2],
    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
    [0, 1, 1, 1, 0, 1, 0, 1, 0, t+2],
    [0, 1, 1, 1, 0, 1, 0, 1, 0, t+2],
    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
    [1, 1, 1, 1, 1, 1, 0, 1, 0, t+2],
    // -Y
    [0, 0, 0, 1, 0, 0, 0, -1, 0, t+3],
    [1, 0, 0, 1, 1, 0, 0, -1, 0, t+3],
    [0, 0, 1, 1, 0, 1, 0, -1, 0, t+3],
    [1, 0, 0, 1, 1, 0, 0, -1, 0, t+3],
    [1, 0, 1, 1, 1, 1, 0, -1, 0, t+3],
    [0, 0, 1, 1, 0, 1, 0, -1, 0, t+3],
    // +Z
    [0, 0, 1, 1, 0, 0, 0, 0, 1, t+4],
    [1, 0, 1, 1, 1, 0, 0, 0, 1, t+4],
    [0, 1, 1, 1, 0, 1, 0, 0, 1, t+4],
    [0, 1, 1, 1, 0, 1, 0, 0, 1, t+4],
    [1, 0, 1, 1, 1, 0, 0, 0, 1, t+4],
    [1, 1, 1, 1, 1, 1, 0, 0, 1, t+4],
    // -Z
    [0, 0, 0, 1, 0, 0, 0, 0, -1, t+5],
    [0, 1, 0, 1, 0, 1, 0, 0, -1, t+5],
    [1, 0, 0, 1, 1, 0, 0, 0, -1, t+5],
    [1, 0, 0, 1, 1, 0, 0, 0, -1, t+5],
    [0, 1, 0, 1, 0, 1, 0, 0, -1, t+5],
    [1, 1, 0, 1, 1, 1, 0, 0, -1, t+5],
  ]}
}

/** Create a tetrahedron mesh.
 * Each side's vertices are mapped to the UV space `(0,0)` to `(1,1)`.
 * `t` is the first texture ID. The other 3 sides are mapped to `t+1` through `t+4`.
 * Normals point outwards.
 * Size: 4 triangles, 12 vertices.
 * Face order: +X, -X, +Y, -Y.
 */
export function tetrahedron(t: number, id: number = 0, label: string = null): XMesh {
  return { id, label, vertexCount: 12, vertices: [
    // +X
    [1, 0, 0, 1, 0, 0, 1, 0, 0, t],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, t],
    [1, 1, 0, 1, 0, 1, 1, 0, 0, t],
    // -X
    [0, 0, 0, 1, 0, 0, -1, 0, 0, t+1],
    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
    [0, 0, 1, 1, 1, 0, -1, 0, 0, t+1],
    // +Y
    [0, 1, 0, 1, 0, 0, 0, 1, 0, t+2],
    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
    [0, 1, 1, 1, 0, 1, 0, 1, 0, t+2],
    // -Y
    [0, 0, 0, 1, 0, 0, 0, -1, 0, t+3],
    [0, 0, 1, 1, 0, 1, 0, -1, 0, t+3],
    [1, 0, 0, 1, 1, 0, 0, -1, 0, t+3],
  ]}
}

//
// Mesh operations
//

/** Translate a mesh by a Vec3. */
export function v3translateMesh(m: XMesh, t: Vec3): XMesh {
  return { vertices: m.vertices.map(v => v3translateVertex(v, t)), ...m }
}

//
// Vertex operations
//

/** Translate a vertex by a Vec3. */
export function v3translateVertex(v: XVertex, t: Vec3): XVertex {
  return [
    v[0] + t[0],
    v[1] + t[1],
    v[2] + t[2],
    v[3],
    v[4],
    v[5],
    v[6],
    v[7],
    v[8],
    v[9],
  ]
}

/** Multiply a Vertex by a quaternion on its position.
 * Returns a new Vertex.
 */
export function quatMulVertex(q: Quat, v: XVertex): XVertex {
  const out = [
    ...quatMulVec3(tempV3_1, q, v.slice(0,3) as Vec3),
    ...v.slice(3)
  ] as XVertex
  return out
}

//
// Vec3 operations
//

/** Difference between two Vec3s. */
export function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Cross product of two Vec3s. */
export function v3cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ] 
}

/** Normalize a Vec3. */
export function v3normalize(a: Vec3): Vec3 {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Return a Vec3 which is normal to a triangle defined by three points. */
export function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return v3normalize(v3cross(v3sub(b, a), v3sub(c, a)))
}

//
// Quaternion operations
//

const tempQ_1 = quat.create()
const tempV3_1 = vec3.create()

/** Multiply a vector by a quaternion. */
export function quatMulVec3(out: Vec3, q: Quat, v: Vec3): Vec3 {
  quat.multiply(out, q, v)
  quat.multiply(out, out, quat.conjugate(tempQ_1, q))
  return out
}


function getBoundingBox(input: Mesh): BoundingBox {
  const x      = input.vertices.map(([x, y, z, ..._]) => x).sort((a, b) => a - b)[0];
  const y      = input.vertices.map(([x, y, z, ..._]) => y).sort((a, b) => a - b)[0];
  const z      = input.vertices.map(([x, y, z, ..._]) => z).sort((a, b) => a - b)[0];
  const width  = input.vertices.map(([x, y, z, ..._]) => x).sort((a, b) => b - a)[0] - x;
  const height = input.vertices.map(([x, y, z, ..._]) => y).sort((a, b) => b - a)[0] - y;
  const depth  = input.vertices.map(([x, y, z, ..._]) => z).sort((a, b) => b - a)[0] - z;
  return {x, y, z, width, height, depth};
}

type BoundingBox = {
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
}

