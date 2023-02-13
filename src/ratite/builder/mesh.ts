// So, this file originally contained all sorts of geometry-building functions,
// now it is a graveyard of old code. I'm keeping it around for now because
// I haven't got around to figuring out where the last few useful bits should
// go.

import type {XMesh, Vec2, Vec3, MeshVertex, Quat, BoundingVolume} from "../types"
import {vec3, mat4, quat} from "gl-matrix"
import { Vertex } from "../vertex.js"
const { sqrt } = Math

//
// Primitive builders
//

/** Create a triangle mesh from three points.
 * `a`, `b`, and `c` are mapped to `(0,0)`, `(1,0)`, and `(0,1)` in UV space.
 * `t` is the texture ID.
 * Size: 1 triangle, 3 vertices.
 */
//export function triangleFromPoints(a: Vec3, b: Vec3, c: Vec3, t: number, id: number = 0, label: string = null): XMesh {
//  const n = triangleNormal(a, b, c)
//  return {id, label, vertexCount: 3, vertices: [
//    Vertex([a[0], a[1], a[2]], [0, 0], [n[0], n[1], n[2]], [t, 0, 0, 0]]),
//    [b[0], b[1], b[2], 1, 1, 0, n[0], n[1], n[2], t],
//    [c[0], c[1], c[2], 1, 0, 1, n[0], n[1], n[2], t],
//  ]}
//}

/** Create a rectangle mesh from two points on the XY plane.
 * `a` and `b` are mapped to `(0,0)` and `(1,1)` in UV space.
 * `t` is the texture ID.
 * Size: 2 triangles, 6 vertices.
 */
//export function rectangleFromPoints(a: Vec2, b: Vec2, t: number, id: number = 0, label: string = null): XMesh {
//  const x0 = a[0], y0 = a[1]
//  const x1 = b[0], y1 = b[1]
//  return {id, label, vertexCount: 6, vertices: [
//    [x0, y0, 0, 1, 0, 0, 0, 0, 1, t],
//    [x1, y0, 0, 1, 1, 0, 0, 0, 1, t],
//    [x0, y1, 0, 1, 0, 1, 0, 0, 1, t],
//    [x0, y1, 0, 1, 0, 1, 0, 0, 1, t],
//    [x1, y0, 0, 1, 1, 0, 0, 0, 1, t],
//    [x1, y1, 0, 1, 1, 1, 0, 0, 1, t],
//  ]}
//}

/** Unit square on the XZ plane centred at the origin, UV mapped from -X,+Z */
//export function square(): XMesh {
//  const vertices: MeshVertex[] = [
//    Vertex([-0.5, 0,  0.5], [0, 0], [0,1,0,0], [1,0,0,0], [0,0,1,0]), // -X+Z
//    Vertex([ 0.5, 0,  0.5], [1, 0], [0,1,0,0], [1,0,0,0], [0,0,1,0]), // +X+Z
//    Vertex([ 0.5, 0, -0.5], [1, 1], [0,1,0,0], [1,0,0,0], [0,0,1,0]), // +X-Z
//    Vertex([-0.5, 0, -0.5], [0, 1], [0,1,0,0], [1,0,0,0], [0,0,1,0]), // -X-Z
//  ]
//  const triangles: [number,number,number][] = [
//    [0, 1, 2],
//    [0, 2, 3],
//  ]
//  return {
//    id: 0,
//    name: 'square',
//    vertexCount: 6,
//    vertices: triangles.flatMap(xs => xs.map(i => vertices[i])),
//    indexCount: 6,
//    indices: triangles.flat(),
//  }
//}

/** Set the textures for all vertices in a mesh. */
export function setTextures(textureIDs: [number, number, number, number], mesh: XMesh): XMesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map(v => ({...v, textures: textureIDs}))
  }
}

/** Create a unit cube mesh.
 * All sides are mapped to the UV space `(0,0)` to `(1,1)`.
 * `t` is the first texture ID. The other 5 sides are mapped to `t+1` through `t+6`.
 * Normals point outwards.
 * Size: 12 triangles, 36 vertices.
 * Face order: +X, -X, +Y, -Y, +Z, -Z.
 */
//export function cube(t: number, id: number = 0, label: string = null): XMesh {
//  return { id, label, vertexCount: 36, vertices: [
//    // +X
//    [1, 0, 0, 1, 1, 0, 1, 0, 0, t],
//    [1, 1, 0, 1, 1, 1, 1, 0, 0, t],
//    [1, 0, 1, 1, 0, 0, 1, 0, 0, t],
//    [1, 1, 0, 1, 1, 1, 1, 0, 0, t],
//    [1, 1, 1, 1, 0, 1, 1, 0, 0, t],
//    [1, 0, 1, 1, 0, 0, 1, 0, 0, t],
//    // -X
//    [0, 0, 0, 1, 0, 0, -1, 0, 0, t+1],
//    [0, 0, 1, 1, 1, 0, -1, 0, 0, t+1],
//    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
//    [0, 0, 1, 1, 1, 0, -1, 0, 0, t+1],
//    [0, 1, 1, 1, 1, 1, -1, 0, 0, t+1],
//    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
//    // +Y
//    [0, 1, 0, 1, 0, 0, 0, 1, 0, t+2],
//    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
//    [0, 1, 1, 1, 0, 1, 0, 1, 0, t+2],
//    [0, 1, 1, 1, 0, 1, 0, 1, 0, t+2],
//    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
//    [1, 1, 1, 1, 1, 1, 0, 1, 0, t+2],
//    // -Y
//    [0, 0, 0, 1, 0, 0, 0, -1, 0, t+3],
//    [1, 0, 0, 1, 1, 0, 0, -1, 0, t+3],
//    [0, 0, 1, 1, 0, 1, 0, -1, 0, t+3],
//    [1, 0, 0, 1, 1, 0, 0, -1, 0, t+3],
//    [1, 0, 1, 1, 1, 1, 0, -1, 0, t+3],
//    [0, 0, 1, 1, 0, 1, 0, -1, 0, t+3],
//    // +Z
//    [0, 0, 1, 1, 0, 0, 0, 0, 1, t+4],
//    [1, 0, 1, 1, 1, 0, 0, 0, 1, t+4],
//    [0, 1, 1, 1, 0, 1, 0, 0, 1, t+4],
//    [0, 1, 1, 1, 0, 1, 0, 0, 1, t+4],
//    [1, 0, 1, 1, 1, 0, 0, 0, 1, t+4],
//    [1, 1, 1, 1, 1, 1, 0, 0, 1, t+4],
//    // -Z
//    [0, 0, 0, 1, 0, 0, 0, 0, -1, t+5],
//    [0, 1, 0, 1, 0, 1, 0, 0, -1, t+5],
//    [1, 0, 0, 1, 1, 0, 0, 0, -1, t+5],
//    [1, 0, 0, 1, 1, 0, 0, 0, -1, t+5],
//    [0, 1, 0, 1, 0, 1, 0, 0, -1, t+5],
//    [1, 1, 0, 1, 1, 1, 0, 0, -1, t+5],
//  ]}
//}

/** Create a tetrahedron mesh.
 * Each side's vertices are mapped to the UV space `(0,0)` to `(1,1)`.
 * `t` is the first texture ID. The other 3 sides are mapped to `t+1` through `t+4`.
 * Normals point outwards.
 * Size: 4 triangles, 12 vertices.
 * Face order: +X, -X, +Y, -Y.
 */
//export function tetrahedron(t: number, id: number = 0, label: string = null): XMesh {
//  return { id, label, vertexCount: 12, vertices: [
//    // +X
//    [1, 0, 0, 1, 1, 0, 1, 0, 0, t],
//    [1, 1, 0, 1, 1, 1, 1, 0, 0, t],
//    [1, 0.5, 0.866, 1, 0.5, 0.5, 1, 0, 0, t],
//    // -X
//    [0, 0, 0, 1, 0, 0, -1, 0, 0, t+1],
//    [0, 0.5, 0.866, 1, 1, 0, -1, 0, 0, t+1],
//    [0, 1, 0, 1, 0, 1, -1, 0, 0, t+1],
//    // +Y
//    [0, 1, 0, 1, 0, 0, 0, 1, 0, t+2],
//    [1, 1, 0, 1, 1, 0, 0, 1, 0, t+2],
//    [0.5, 1, 0.866, 1, 0.5, 1, 0, 1, 0, t+2],
//    // -Y
//    [0, 0, 0, 1, 0, 0, 0, -1, 0, t+3],
//    [0.5, 0, 0.866, 1, 1, 0, 0, -1, 0, t+3],
//    [1, 0, 0, 1, 0, 1, 0, -1, 0, t+3],
//  ]}
//}

//
// Mesh operations
//

/** Translate a mesh by a Vec3. */
export function translateMesh(m: XMesh, t: Vec3): XMesh {
  return { ...m, vertices: m.vertices.map(v => v3translateVertex(v, t)) }
}

/** Scale the x, y and z components of a mesh's vertex positions by a uniform factor. */
export function uniformScaleMeshPosition(scale: number, mesh: XMesh): XMesh {
  return { 
    ...mesh,
    vertices: mesh.vertices.map(vertex =>  ({
      ...vertex,
      position: [
        vertex.position[0] * scale,
        vertex.position[1] * scale,
        vertex.position[2] * scale,
        vertex.position[3],
      ]
    }))
  }
}

/** Scale the x, y and z components of a mesh's vertex positions and UVs by a uniform factor. */
export function uniformScaleMeshPositionUV(scale: number, mesh: XMesh): XMesh {
  return { 
    ...mesh,
    vertices: mesh.vertices.map(vertex =>  ({
      ...vertex,
      position: [
        vertex.position[0] * scale,
        vertex.position[1] * scale,
        vertex.position[2] * scale,
        vertex.position[3],
      ],
      uv: [
        vertex.uv[0] * scale,
        vertex.uv[1] * scale,
      ]
    }))
  }
}

//
// Vertex operations
//

/** Translate a vertex by a Vec3. */
export function v3translateVertex(v: MeshVertex, t: Vec3): MeshVertex {
  const p = v.position
  return {
    ...v,
    position: [p[0] + t[0], p[1] + t[1], p[2] + t[2], p[3]],
  }
}

/** Multiply a Vertex by a quaternion on its position.
 * Returns a new Vertex.
 */
//export function quatMulVertex(q: Quat, v: XVertex): XVertex {
//  const out = [
//    ...quatMulVec3(tempV3_1, q, v.slice(0,3) as Vec3),
//    ...v.slice(3)
//  ] as XVertex
//  return out
//}

//
// Vec3 operations
//

/** Difference between two Vec3s. */
export function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Sum of two Vec3s. */
export function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/** Midpoint of two Vec3s. */
export function v3mid(a: Vec3, b: Vec3): Vec3 {
  return [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])]
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
//export function quatMulVec3(out: Vec3, q: Quat, v: Vec3): Vec3 {
//  quat.multiply(out, q, v)
//  quat.multiply(out, out, quat.conjugate(tempQ_1, q))
//  return out
//}

/** Get the bounding volume of a set of vertices. */
export function getBoundingVolume(vertices: MeshVertex[]): BoundingVolume {
  const min = [Infinity, Infinity, Infinity] as Vec3
  const max = [-Infinity, -Infinity, -Infinity] as Vec3
  for (const v of vertices) {
    const p = v.position
    min[0] = Math.min(min[0], p[0])
    min[1] = Math.min(min[1], p[1])
    min[2] = Math.min(min[2], p[2])
    max[0] = Math.max(max[0], p[0])
    max[1] = Math.max(max[1], p[1])
    max[2] = Math.max(max[2], p[2])
  }
  return { min, max }
}



//SurfaceMesh icosahedron()
//{
//  SurfaceMesh mesh;
//
//  float phi = (1.0f + sqrt(5.0f)) * 0.5f; // golden ratio
//  float a = 1.0f;
//  float b = 1.0f / phi;
//
//  // add vertices
//  auto v1  = mesh.add_vertex(Point(0, b, -a));
//  auto v2  = mesh.add_vertex(Point(b, a, 0));
//  auto v3  = mesh.add_vertex(Point(-b, a, 0));
//  auto v4  = mesh.add_vertex(Point(0, b, a));
//  auto v5  = mesh.add_vertex(Point(0, -b, a));
//  auto v6  = mesh.add_vertex(Point(-a, 0, b));
//  auto v7  = mesh.add_vertex(Point(0, -b, -a));
//  auto v8  = mesh.add_vertex(Point(a, 0, -b));
//  auto v9  = mesh.add_vertex(Point(a, 0, b));
//  auto v10 = mesh.add_vertex(Point(-a, 0, -b));
//  auto v11 = mesh.add_vertex(Point(b, -a, 0));
//  auto v12 = mesh.add_vertex(Point(-b, -a, 0));
//
//  project_to_unit_sphere(mesh);
//
//  // add triangles
//  mesh.add_triangle(v3, v2, v1);
//  mesh.add_triangle(v2, v3, v4);
//  mesh.add_triangle(v6, v5, v4);
//  mesh.add_triangle(v5, v9, v4);
//  mesh.add_triangle(v8, v7, v1);
//  mesh.add_triangle(v7, v10, v1);
//  mesh.add_triangle(v12, v11, v5);
//  mesh.add_triangle(v11, v12, v7);
//  mesh.add_triangle(v10, v6, v3);
//  mesh.add_triangle(v6, v10, v12);
//  mesh.add_triangle(v9, v8, v2);
//  mesh.add_triangle(v8, v9, v11);
//  mesh.add_triangle(v3, v6, v4);
//  mesh.add_triangle(v9, v2, v4);
//  mesh.add_triangle(v10, v3, v1);
//  mesh.add_triangle(v2, v8, v1);
//  mesh.add_triangle(v12, v10, v7);
//  mesh.add_triangle(v8, v11, v7);
//  mesh.add_triangle(v6, v12, v5);
//  mesh.add_triangle(v11, v9, v5);
//
//  return mesh;
//}
