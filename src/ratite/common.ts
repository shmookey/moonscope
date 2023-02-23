import { mat4, vec4, glMatrix, vec3 } from "gl-matrix"
import type {BoundingVolume, Mat4, Vec2, Vec3, Vec4} from "./types"
const { sin, cos, atan2, sqrt } = Math
glMatrix.setMatrixArrayType(Array)

export const identityMatrix = mat4.create() as Mat4

export const nullBoundingVolume: BoundingVolume = {
  min: [ Infinity,  Infinity,  Infinity],
  max: [-Infinity, -Infinity, -Infinity],
}

/** Create a bounding volume, initialised to the null bounding volume. */
export function createBoundingVolume(): BoundingVolume {
  return {
    min: [ Infinity,  Infinity,  Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
}

/** Is the bounding volume null? */
export function isNullBoundingVolume(bv: BoundingVolume): boolean {
  return bv.min.every((v,i) => v === Infinity && bv.max[i] === -Infinity)
}

/** Reset a bounding volume to the null bounding volume. */
export function resetBoundingVolume(bv: BoundingVolume): void {
  bv.min[0] = bv.min[1] = bv.min[2] =  Infinity
  bv.max[0] = bv.max[1] = bv.max[2] = -Infinity
}

/** Expand a bounding volume to include another bounding volume. */
export function expandBoundingVolume(bv: BoundingVolume, other: BoundingVolume): void {
  bv.min[0] = Math.min(bv.min[0], other.min[0])
  bv.min[1] = Math.min(bv.min[1], other.min[1])
  bv.min[2] = Math.min(bv.min[2], other.min[2])
  bv.max[0] = Math.max(bv.max[0], other.max[0])
  bv.max[1] = Math.max(bv.max[1], other.max[1])
  bv.max[2] = Math.max(bv.max[2], other.max[2])
}

/** Expand a bounding volume to include a point. */
export function expandBoundingVolumePoint(bv: BoundingVolume, point: Vec3 | Vec4): void {
  bv.min[0] = Math.min(bv.min[0], point[0])
  bv.min[1] = Math.min(bv.min[1], point[1])
  bv.min[2] = Math.min(bv.min[2], point[2])
  bv.max[0] = Math.max(bv.max[0], point[0])
  bv.max[1] = Math.max(bv.max[1], point[1])
  bv.max[2] = Math.max(bv.max[2], point[2])
}

/** Get the bounding volume of a transformed bounding volume. */
//export function transformedBoundingVolume(bv: BoundingVolume, transform: Mat4): BoundingVolume {

const tmpVec4 = [0,0,0,1] as Vec4
const tmpBoundingVolume: BoundingVolume = {
  min: [ Infinity,  Infinity,  Infinity],
  max: [-Infinity, -Infinity, -Infinity],
}

/** Get the bounding volume of a transformed bounding volume. */
export function transformedBoundingVolume(bv: BoundingVolume, transform: Mat4, out: BoundingVolume): BoundingVolume {
  const minX = bv.min[0]
  const minY = bv.min[1]
  const minZ = bv.min[2]
  const maxX = bv.max[0]
  const maxY = bv.max[1]
  const maxZ = bv.max[2]

  resetBoundingVolume(out)

  tmpVec4[0] = minX; tmpVec4[1] = minY; tmpVec4[2] = minZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = minX; tmpVec4[1] = minY; tmpVec4[2] = maxZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = minX; tmpVec4[1] = maxY; tmpVec4[2] = minZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = minX; tmpVec4[1] = maxY; tmpVec4[2] = maxZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = maxX; tmpVec4[1] = minY; tmpVec4[2] = minZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = maxX; tmpVec4[1] = minY; tmpVec4[2] = maxZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = maxX; tmpVec4[1] = maxY; tmpVec4[2] = minZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  tmpVec4[0] = maxX; tmpVec4[1] = maxY; tmpVec4[2] = maxZ
  vec4.transformMat4(tmpVec4, tmpVec4, transform)
  expandBoundingVolumePoint(out, tmpVec4)

  return out
}

const tmpVec4_frustumTest = [0,0,0,1] as Vec4

/** Does the bounding volume intersect the view frustum?
 * 
 * The bounding volume is transformed to clip space by the view-projection
 * matrix. For each vertex, we check if it is outside each of the 6 planes
 * of the view frustum. If all vertices are outside at least one plane,
 * the bounding volume is outside the view frustum.
 */
export function frustumTest(bv: BoundingVolume, viewProjection: Mat4): boolean {
  let numOutsideLeft = 0
  let numOutsideRight = 0
  let numOutsideBottom = 0
  let numOutsideTop = 0
  let numOutsideNear = 0
  let numOutsideFar = 0

  const minX = bv.min[0]
  const minY = bv.min[1]
  const minZ = bv.min[2]
  const maxX = bv.max[0]
  const maxY = bv.max[1]
  const maxZ = bv.max[2]

  for(let i = 0; i < 8; i++) {
    tmpVec4_frustumTest[0] = i & 1 ? maxX : minX
    tmpVec4_frustumTest[1] = i & 2 ? maxY : minY
    tmpVec4_frustumTest[2] = i & 4 ? maxZ : minZ
    tmpVec4_frustumTest[3] = 1
    vec4.transformMat4(tmpVec4_frustumTest, tmpVec4_frustumTest, viewProjection)

    const x = tmpVec4_frustumTest[0]
    const y = tmpVec4_frustumTest[1]
    const z = tmpVec4_frustumTest[2]
    const w = tmpVec4_frustumTest[3]

    if(x < -w) numOutsideLeft++
    else if(x >  w) numOutsideRight++
    if(y < -w) numOutsideBottom++
    else if(y >  w) numOutsideTop++
    if(z > w) numOutsideNear++
    else if(z <  0) numOutsideFar++
  }

  return numOutsideLeft < 8 && numOutsideRight < 8 && numOutsideBottom < 8 && numOutsideTop < 8 && numOutsideNear < 8 && numOutsideFar < 8
}


const tmpVec4_pointInFrustum = [0,0,0,1] as Vec4

/** Test if a point is in the view frustum.
 * 
 * The point is transformed to clip space by a view-projection matrix.
 */
export function pointInFrustum(point: Vec4, viewProjection: Mat4): boolean {
  vec4.transformMat4(tmpVec4_pointInFrustum, point, viewProjection)
  const x = tmpVec4_pointInFrustum[0]
  const y = tmpVec4_pointInFrustum[1]
  const z = tmpVec4_pointInFrustum[2]
  const w = tmpVec4_pointInFrustum[3]
  return x >= -w && x <= w && y >= -w && y <= w && z >= -w && z <= w
}

// Bounding volume corners
const _bvCorners = [
  [0,0,0], // -X -Y -Z
  [0,0,0], // +X -Y -Z
  [0,0,0], // +X +Y -Z
  [0,0,0], // -X +Y -Z
  [0,0,0], // -X -Y +Z
  [0,0,0], // +X -Y +Z
  [0,0,0], // +X +Y +Z
  [0,0,0], // -X +Y +Z
] as Vec3[]


/** Get the corners of a bounding volume. */
export function getBoundingVolumeCorners(volume: BoundingVolume, out: Vec3[] = _bvCorners): Vec3[] {
  const minX = volume.min[0]
  const minY = volume.min[1]
  const minZ = volume.min[2]
  const maxX = volume.max[0]
  const maxY = volume.max[1]
  const maxZ = volume.max[2]

  out[0][0] = minX; out[0][1] = minY; out[0][2] = minZ
  out[1][0] = maxX; out[1][1] = minY; out[1][2] = minZ
  out[2][0] = maxX; out[2][1] = maxY; out[2][2] = minZ
  out[3][0] = minX; out[3][1] = maxY; out[3][2] = minZ
  out[4][0] = minX; out[4][1] = minY; out[4][2] = maxZ
  out[5][0] = maxX; out[5][1] = minY; out[5][2] = maxZ
  out[6][0] = maxX; out[6][1] = maxY; out[6][2] = maxZ
  out[7][0] = minX; out[7][1] = maxY; out[7][2] = maxZ

  return out
}

/** Get the bounding volume of a transformed bounding volume. */
export function getTransformedBoundingVolume(volume: BoundingVolume, transform: Mat4, out: BoundingVolume = createBoundingVolume()): BoundingVolume {
  const corners = getBoundingVolumeCorners(volume)
  corners.forEach(c => vec3.transformMat4(c, c, transform))
  getPointsBoundingVolume(corners, out)
   return out
}

/** Get the bounding volume of a list of points. */
export function getPointsBoundingVolume(points: Vec3[], out: BoundingVolume = createBoundingVolume()): BoundingVolume {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for(const p of points) {
    minX = Math.min(minX, p[0])
    minY = Math.min(minY, p[1])
    minZ = Math.min(minZ, p[2])
    maxX = Math.max(maxX, p[0])
    maxY = Math.max(maxY, p[1])
    maxZ = Math.max(maxZ, p[2])
  }
  return out
}

export function latLonToUnitVec(c: Vec2): Vec3 {
  const [lat,lon] = c
  const y = sin(lat)
  const z = sin(lon) * cos(lat)
  const x = cos(lon) * cos(lat)
  return [x,y,z]
}

export function unitVecToLatLon(v: Vec3): Vec2 {
  const [x,y,z] = v
  return [
    atan2(y, sqrt(x*x + z*z)),  // latitude
    atan2(z, x)                 // longitude
  ]
}

/** Return a list of integers from `lo` to `hi`. */
export function numberRange(lo: number, high: number): number[] {
  return Array.from({length: high - lo + 1}, (_, i) => i + lo)
}

/** Copy a list of elements from one array to another. */
export function arraySet(dest: any[], src: any[], start: number = 0): void {
  for(let i = 0; i < src.length; i++) {
    dest[start + i] = src[i]
  }
}
