import {vec3, mat4, quat} from "../../node_modules/gl-matrix/esm/index.js"
import type {Camera, FirstPersonCamera, Mat4, Quat, Vec3} from './types'
const {sin, cos, min, max, PI} = Math

const tempQ_1 = mat4.create()
const tempQ_2 = mat4.create()

/** Create a new camera with the given aspect ratio. 
 * 
 * Starts at the origin pointing in the positive z direction.
 */
export function createCamera(aspect: number): Camera {
  const position = vec3.create()
  const orientation = quat.create()
  const projection = mat4.create()
  mat4.perspectiveZO(projection, PI/2, aspect, 0.1, Infinity)
  return {isDirty: true, projection, position, orientation}
}

/** Create a new first-person camera.
 * 
 * Starts at the origin pointing in the positive z direction.
 */
export function createFirstPersonCamera(): FirstPersonCamera {
  const position = vec3.create()
  return {
    position,
    roll: 0,
    pitch: 0,
    yaw: 0,
  }
}


export function getCameraViewMatrix(out: Mat4, camera: Camera): void {
  mat4.fromQuat(out, camera.orientation)
  mat4.translate(out, out, camera.position)
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

/** Apply a FirstPersonCamera to a Camera. */
export function applyFirstPersonCamera(fpCamera: FirstPersonCamera, camera: Camera): void {
  const {position, roll, pitch, yaw} = fpCamera
  const q = camera.orientation
  quat.identity(q)
  quat.rotateX(q, q, pitch)
  quat.rotateY(q, q, yaw)
  quat.rotateZ(q, q, roll)
  vec3.copy(camera.position, position)
  camera.isDirty = true
}

/** Rotate a first person camera by a given pitch and yaw. */
export function rotateFirstPersonCamera(pitch: number, yaw: number, fpCamera: FirstPersonCamera): void {
  fpCamera.pitch += pitch
  fpCamera.yaw += yaw
  fpCamera.pitch = max(-PI/2, min(PI/2, fpCamera.pitch))
}

/** Move a first person camera in the forward/backwards direction. */
export function moveFirstPersonCameraForward(dist: number, fpCamera: FirstPersonCamera): void {
  const {position, yaw} = fpCamera
  const dx = dist * sin(yaw)
  const dz = dist * cos(yaw)
  position[0] -= dx
  //position[1] += dy
  position[2] += dz
}

/** Move a first person camera in the left/right direction. */
export function moveFirstPersonCameraRight(dist: number, fpCamera: FirstPersonCamera): void {
  const {position, yaw} = fpCamera
  const dx = dist * cos(yaw)
  const dz = dist * sin(yaw)
  position[0] += dx
  position[2] += dz
}
