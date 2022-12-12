import {vec3, mat4, quat} from "../../node_modules/gl-matrix/esm/index.js"
import type {Mat4, Quat, Vec3} from './types'
const {sin, cos, min, max, PI} = Math

const tempQ_1 = mat4.create()
const tempQ_2 = mat4.create()

/** Camera type.
 * 
 * Changes mark the camera as "dirty" so that the renderer knows to propagate
 * it to whatever buffers need a copy.
 */
export type Camera = {
  projection: Mat4,
  isDirty: boolean, 
  position: Vec3,
  orientation: Quat,
}

export function create(aspect: number): Camera {
  const position = vec3.create()
  const orientation = quat.create()
  const projection = mat4.create()
  mat4.perspectiveZO(projection, PI/2, aspect, 0.1, 100)
  console.log(orientation)
  return {isDirty: true, projection, position,
      orientation}
}

export function viewMatrix(out: Mat4, camera: Camera): void {
  mat4.fromQuat(out, camera.orientation) 
}

/** Multiply a vector by a quaternion. */
function quatMulVec3(out: Vec3, q: Quat, v: Vec3): void {
  quat.multiply(out, q, v)
  quat.multiply(out, out, quat.conjugate(tempQ_1, q))
}

/** Adjust the altitude of the camera by the given amount.
 * Does not affect its position or azimuth.
 */
export function adjustAltitude(alt: number, camera: Camera): void {
  const q = camera.orientation
  quat.multiply(q, quat.setAxisAngle(tempQ_1, [1,0,0], alt), q)
  camera.isDirty = true
}

/** Adjust the azimuth of the camera by the given amount.
 * Does not affect its position or altitude.
 */
export function adjustAzimuth(az: number, camera: Camera): void {
  const q = camera.orientation
  quat.multiply(q, q, quat.setAxisAngle(tempQ_1, [0,1,0], az))
  camera.isDirty = true
}

/** Adjust the altitude and azimuth of the camera by the given amounts.
 * Does not affect its position.
 */
export function adjustAltAz(alt: number, az: number, camera: Camera): void {
  adjustAltitude(alt, camera)
  adjustAzimuth(az, camera)
}
