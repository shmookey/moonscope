import { mat4, vec4, glMatrix } from "gl-matrix"
import type {BoundingVolume, Mat4, Vec2, Vec3, Vec4} from "./types"
const { sin, cos, atan2, sqrt } = Math
glMatrix.setMatrixArrayType(Array)

export const DirtyFlags = {
  WORLD_TRANSFORM:       0x01,
  MODEL_VIEW_MATRIX:     0x02,
  BOUNDING_VOLUME:       0x04,
  ALL:                   0x07,
}

export const INITIAL_DIRTY_FLAGS = 
  DirtyFlags.WORLD_TRANSFORM | 
  DirtyFlags.MODEL_VIEW_MATRIX | 
  DirtyFlags.BOUNDING_VOLUME

export const identityMatrix = mat4.create() as Mat4

export const nullBoundingVolume: BoundingVolume = {
  min: [ Infinity,  Infinity,  Infinity],
  max: [-Infinity, -Infinity, -Infinity],
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
