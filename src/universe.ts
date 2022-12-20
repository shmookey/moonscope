/** universe.ts -- Celestial bodies and their orbits. */

import type {Vec3, Quat} from './gpu/types';
import {vec3, mat4, quat} from '../node_modules/gl-matrix/esm/index.js'
import {random, randomUnitVec3, randomUnitQuat} from './util.js';

/** Celestial body. */
export type Celestial  = {
  position: Vec3,      // Absolute position in space
  orientation: Quat,   // Absolute rotation
  size: number,        // Size scale factor
  instanceId?: number, // Instance ID, if this is a GPU object
}

/** Body in the solar system. */
export type LocalBody = {
  name: string,        // Name of the body
  radius: number,      // Radius in km
  mass: number,        // Mass in kg
  position: Vec3,      // Absolute position in space
  orientation: Quat,   // Absolute rotation
  rotation: number,    // Rotation per second
  instanceId?: number, // Instance ID, if this is a GPU object
}

export type Universe = {
  celestialBodies: Celestial[],  // Celestial bodies in the universe
  localBodies: LocalBody[],      // Bodies in the solar system  
  lastTick: number,              // Last time the universe state was updated
  localBodiesAllocId?: number,   // Instances allocation ID for local bodies
}

const EARTH_RADIUS = 6.371
const MIN_DIST     = 5000
const MAX_DIST     = 20000
const MIN_SIZE     = 5
const MAX_SIZE     = 10

const SUN: LocalBody = {
  name: 'Sun',
  radius: 695.700,
  mass: 1.989e30,
  position: [0, 1000, -10000],
  orientation: quat.create(),
  rotation: 0,
}

const MOON: LocalBody = {
  name: 'Moon',
  radius: 1,
  mass: 1,
  position: [1.5, 1.5, -3],
  orientation: quat.create(),
  rotation: 1,
}


/** Create a new random universe. */
export function generateUniverse(numObjects: number): Universe {
  const universe: Universe = {
    celestialBodies: [],
    localBodies: [SUN, MOON],
    lastTick: performance.now(),
  }
  for (let i = 0; i < numObjects; i++) {
    universe.celestialBodies.push(generateCelestialBody())
  }
  return universe
}

/** Create a new random celestial object. */
export function generateCelestialBody(): Celestial {
  const size = random() * (MAX_SIZE - MIN_SIZE) + MIN_SIZE
  const distance = random() * (MAX_DIST - MIN_DIST) + MIN_DIST
  const orientation = randomUnitQuat()
  const position = randomUnitVec3()
  vec3.scale(position, position, distance)
  return { position, orientation, size, instanceId: null }
}

/** Write a celestial body's model matrix to a mat4. */
export function celestialBodyModelMatrix(body: Celestial, out: mat4): mat4 {
  return mat4.fromRotationTranslationScale(
    out,
    body.orientation,
    body.position,
    [body.size, body.size, body.size]
  )
}

/** Write a local body's model matrix to a mat4. */
export function localBodyModelMatrix(body: LocalBody, out: mat4): mat4 {
  return mat4.fromRotationTranslationScale(
    out,
    body.orientation,
    body.position,
    [body.radius, body.radius, body.radius]
  )
}

/** Update the universe state. */
export function updateUniverse(universe: Universe, time: number): void {
  const dt = (time - universe.lastTick) / 1000
  universe.lastTick = time
  for (const body of universe.localBodies) {
    const rotation = quat.create()
    quat.rotateZ(rotation, rotation, body.rotation * dt)
    quat.multiply(body.orientation, body.orientation, rotation)
  }
}
