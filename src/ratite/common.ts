import type {Vec2, Vec3} from "./types"
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
