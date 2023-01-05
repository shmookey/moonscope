/** universe.ts -- Celestial bodies and their orbits. */

import type {Vec3, Quat, Node} from './ratite/types';
import {vec3, mat4, quat} from '../node_modules/gl-matrix/esm/index.js'
import {random, randomUnitVec3, randomUnitQuat} from './util.js';

/** Celestial body. */
export type Celestial  = {
  position: Vec3,      // Absolute position in space
  orientation: Quat,   // Absolute rotation
  size: number,        // Size scale factor
  node?: Node,         // Scene graph node
}

/** Body in the solar system. */
export type LocalBody = {
  name: string,        // Name of the body
  radius: number,      // Radius in km
  mass: number,        // Mass in kg
  position: Vec3,      // Absolute position in space
  orientation: Quat,   // Absolute rotation
  angularVelocity: number,    // Rotation per second
  node?: Node,         // Scene graph node
  orbitalRate: number // Orbital rate in radians per second
}

export type Universe = {
  celestialBodies: Celestial[],  // Celestial bodies in the universe
  localBodies: { [name: string]: LocalBody },      // Bodies in the solar system  
  lastTick: number,              // Last time the universe state was updated
  localBodiesAllocId?: number,   // Instances allocation ID for local bodies
}

const SCALE = 1/1000
const EARTH_RADIUS    =      637.1    // 6371 km
const SUN_RADIUS      =    69.6340    // 696,340 km
const MOON_RADIUS     =      173.74  // 1737.4 km
const DIST_EARTH_SUN  = 1471.50000    // 147.15 million km
const DIST_EARTH_MOON =    5*384.400    // 384,400 km
const MIN_DIST        = DIST_EARTH_SUN * 3000
const MAX_DIST        = DIST_EARTH_SUN * 30000
const MIN_SIZE        = EARTH_RADIUS * 1
const MAX_SIZE        = EARTH_RADIUS * 10

const SUN: LocalBody = {
  name: 'Sun',
  radius: SUN_RADIUS,
  mass: 1.989e30,
  position: [0, 0, 0],
  orientation: quat.create(),
  angularVelocity: 0,
  orbitalRate: 0,
}

const MOON: LocalBody = {
  name: 'Moon',
  radius: MOON_RADIUS,
  mass: 1,
  position: [0, 0, DIST_EARTH_MOON], // relative to earth
  orientation: quat.create(),
  angularVelocity: 0,
  orbitalRate: 1,
}

const EARTH: LocalBody = {
  name: 'Earth',
  radius: EARTH_RADIUS,
  mass: 5.972e24,
  position: [0, 0, DIST_EARTH_SUN], // relative to sun
  orientation: quat.create(),
  angularVelocity: 1,
  orbitalRate: 0.1,
}


/** Create a new random universe. */
export function generateUniverse(numObjects: number): Universe {
  const universe: Universe = {
    celestialBodies: [],
    localBodies: {
      earth: EARTH, 
      sun:   SUN, 
      moon:  MOON
    },
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
  return { position, orientation, size }
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
