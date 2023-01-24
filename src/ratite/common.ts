import type {ErrorType, Vec2, Vec3} from "./types"
const { sin, cos, atan2, sqrt } = Math

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
