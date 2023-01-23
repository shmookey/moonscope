import type { Vec2, Vec3, XMesh, MeshVertex } from '../types'

type Vertex = {
  xy: Vec2,
  uv: Vec2,
}

type Rect = {
  xy: Vec2,
  wh: Vec2,
}

type Mesh2D = {
  vertices: Vertex[],
  indices:  number[],
}


function square(): Rect {
  return {xy: [-0.5, -0.5], wh: [1, 1]}
}

function subdivideRect(rect: Rect, n: number): Rect[] {
  const [x, y] = rect.xy
  const [w, h] = rect.wh
  const rects: Rect[] = []
  const dx = w / n
  const dy = h / n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      rects.push({xy: [x + i * dx, y + j * dy], wh: [dx, dy]})
    }
  }
  return rects
}

function rectToVertices(rect: Rect): Vertex[] {
  const [x, y] = rect.xy
  const [w, h] = rect.wh
  const uv0: Vec2 = [ x    + 0.5,  y    + 0.5]
  const uv1: Vec2 = [(x+w) + 0.5, (y+h) + 0.5]
  return [
    {xy: [x, y],         uv: uv0},
    {xy: [x + w, y],     uv: [uv1[0], uv0[1]]},
    {xy: [x, y + h],     uv: [uv0[0], uv1[1]]},
    {xy: [x + w, y + h], uv: uv1},
  ]
}

export function subdividedSquareMesh(n: number): Mesh2D {
  const rects = subdivideRect(square(), n)
  const vertices: Vertex[] = []
  const indices: number[] = []
  for (const rect of rects) {
    const rectVertices = rectToVertices(rect)
    const offset = vertices.length
    vertices.push(...rectVertices)
    indices.push(
      offset + 0, offset + 2, offset + 1,
      offset + 1, offset + 2, offset + 3,
    )
  }
  return simplifyMesh2D({vertices, indices})
}

/** Create a tiled mesh of subdivided squares.
 * 
 * @argument n The number of subdivisions per square.
 * @argument m The number of squares in each direction.
 * 
 * Each tile is a subdivided square of unit length, for a mesh of side length
 * `m`. The mesh is centered at the origin.
 */
export function tiledSquareMesh(n: number, m: number): Mesh2D {
  const template = translateMesh2D(subdividedSquareMesh(n), [0.5, 0.5])
  const submeshes = []
  for(let i=0; i<m; i++) {
    for(let j=0; j<m; j++) {
      const submesh = cloneMesh2D(template)
      submeshes.push(translateMesh2D(submesh, [i, j]))
    }
  }
  const mesh = translateMesh2D(combineMeshes2D(submeshes), [-m/2, -m/2])
  //console.log(JSON.stringify(mesh))
  return mesh
}

function equal(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** Remove duplicate vertices from a mesh.
 *  Indices referring to removed vertices are updated.
 *  A vertex is a duplicate if it has the same position and UV coordinates as
 *  another vertex.   
 */
export function simplifyMesh2D(mesh: Mesh2D): Mesh2D {
  const vertices: Vertex[] = []
  const indices: number[] = []
  const vertexMap: Map<number, number> = new Map() // vertex index -> new index
  const verticesSeen: Map<string, number> = new Map() // vertex position string -> vertex index
  for (let i = 0; i < mesh.vertices.length; i++) {
    const vertex = mesh.vertices[i]
    const key = `${vertex.xy.toString()},${vertex.uv.toString()}`
    if (verticesSeen.has(key)) {
      vertexMap.set(i, verticesSeen.get(key)!)
    } else {
      verticesSeen.set(key, vertices.length)
      vertexMap.set(i, vertices.length)
      vertices.push(vertex)
    }
  }
  for (const index of mesh.indices) {
    indices.push(vertexMap.get(index)!)
  }
  return {vertices, indices}
}

/** Translate a 2D mesh by a vector. */
export function translateMesh2D(mesh: Mesh2D, v: Vec2): Mesh2D {
  const vertices = mesh.vertices.map(vertex => ({
    xy: [vertex.xy[0] + v[0], vertex.xy[1] + v[1]] as Vec2,
    uv: vertex.uv,
  }))
  return {vertices, indices: mesh.indices}
}

/** Clone a 2D vertex. */
export function cloneVertex2D(vertex: Vertex): Vertex {
  return {
    xy: [vertex.xy[0], vertex.xy[1]],
    uv: [vertex.uv[0], vertex.uv[1]],
  }
}

/** Clone a 2D mesh. */
export function cloneMesh2D(mesh: Mesh2D): Mesh2D {
  return {
    vertices: mesh.vertices.map(cloneVertex2D),
    indices: [...mesh.indices],
  }
}

/** Combine a list of 2D meshes into a single mesh. */
export function combineMeshes2D(meshes: Mesh2D[]): Mesh2D {
  const vertices: Vertex[] = []
  const indices: number[] = []
  let offset = 0
  for (const mesh of meshes) {
    vertices.push(...mesh.vertices)
    indices.push(...mesh.indices.map(i => i + offset))
    offset += mesh.vertices.length
  }
  return {vertices, indices}
}


/** Convert a 2D vertex to a 3D MeshVertex.
 * 
 * The vertex is placed on the XZ plane, with the Y coordinate set to 0. The
 * normal, tangent and bitangent point in the +Y, +X and -Z directions. UV
 * coordinates are copied from the input vertex, and the texture values are set
 * to 0.
 */
function vertexToMeshVertex(vertex: Vertex): MeshVertex {
  return {
    position:  [vertex.xy[0], 0, vertex.xy[1], 1],
    uv:        vertex.uv,
    normal:    [0,  1,  0,  0],
    tangent:   [1,  0,  0,  0],
    bitangent: [0,  0, -1,  0],
    textures:  [0,  0,  0,  0],
  }
}

/** Embed a 2D mesh in 3D space, with the XZ plane as the base. */
export function embedMesh(mesh: Mesh2D): XMesh {
  const vertices = mesh.vertices.map(vertexToMeshVertex)
  return {
    vertices:    vertices, 
    indices:     mesh.indices,
    id:          0,
    name:        '',
    vertexCount: vertices.length,
    indexCount:  mesh.indices.length,
    material:    'default',
  }
}

