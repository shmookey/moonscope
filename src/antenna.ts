import {mat4} from 'gl-matrix'
import type {ModelNode} from './gpu/types'
const { min, max, PI } = Math

export type AntennaObject = {
  dish: ModelNode,
  boom: ModelNode,
  mount: ModelNode,

  altitude: number,
  azimuth: number,
}

/** Set the altitude of an antenna's pointing direction. */
export function setAntennaAltitude(altitude: number, antenna: AntennaObject): void {
  altitude = max(0, min(altitude, PI/2))
  const dAlt = altitude - antenna.altitude
  mat4.translate(antenna.dish.transform, antenna.dish.transform, [0, 18, 0])
  mat4.rotateX(antenna.dish.transform, antenna.dish.transform, -dAlt)
  mat4.translate(antenna.dish.transform, antenna.dish.transform, [0, -18, 0])
  antenna.altitude = altitude
}

/** Set the azimuth of an antenna's pointing direction. */
export function setAntennaAzimuth(azimuth: number, antenna: AntennaObject): void {
  azimuth = max(-PI, min(azimuth, PI))
  const dAz = azimuth - antenna.azimuth
  mat4.rotateY(antenna.boom.transform, antenna.boom.transform, dAz)
  antenna.azimuth = azimuth
}

/** Set the pointing direction. */
export function setPointingDirection(altitude: number, azimuth: number, antenna: AntennaObject): void {
  setAntennaAltitude(altitude, antenna)
  setAntennaAzimuth(azimuth, antenna)
}
