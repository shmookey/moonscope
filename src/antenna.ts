/** Antenna model. */

import type {ModelNode, Node, SceneGraph, Vec2, Vec3} from './ratite/types'
import {mat4} from 'gl-matrix'
import { cloneNode, getChildNodeByName } from './ratite/scene.js'
const { min, max, PI } = Math

export type Antenna = {
  id:       number,     // Unique ID for the antenna
  group:    Node,       // Container node for the antenna
  dish:     ModelNode,  // Dish model node
  boom:     ModelNode,  // Boom model node
  mount:    ModelNode,  // Mount model node
  altaz:    Vec2,       // Altitude/azimuth pointing direction
  position: Vec3,       // East/north/height distance from array centre
  scene:    SceneGraph, // Scene graph containing the antenna
}

let _antennaCount = 0


/** Initialise an antenna using an existing scene graph node. */
export function initAntenna(node: Node, scene: SceneGraph): Antenna {
  return {
    id:       _antennaCount++,
    group:    node,
    dish:     getChildNodeByName('dish', node)  as ModelNode,
    boom:     getChildNodeByName('boom', node)  as ModelNode,
    mount:    getChildNodeByName('mount', node) as ModelNode, 
    altaz:    [0, 0],
    position: [0, 0, 0],
    scene:    scene
  }
}

/** Clone an antenna.
 * 
 * The cloned antenna will be not be attached to the scene graph at creation.
 */
export function cloneAntenna(antenna: Antenna): Antenna {
  const group = cloneNode(antenna.group, antenna.scene)
  return {
    id:       _antennaCount++,
    group:    group, 
    dish:     getChildNodeByName('dish', group)  as ModelNode,
    boom:     getChildNodeByName('boom', group)  as ModelNode,
    mount:    getChildNodeByName('mount', group) as ModelNode, 
    altaz:    [antenna.altaz[0], antenna.altaz[1]],
    position: [antenna.position[0], antenna.position[1], antenna.position[2]],
    scene:    antenna.scene
  }
}

/** Set the altitude of an antenna's pointing direction. */
export function setAntennaAltitude(altitude: number, antenna: Antenna): void {
  altitude = max(0, min(altitude, PI/2))
  const dAlt = altitude - antenna.altaz[0]
  mat4.translate(antenna.dish.transform, antenna.dish.transform, [0, 18, 0])
  mat4.rotateX(antenna.dish.transform, antenna.dish.transform, -dAlt)
  mat4.translate(antenna.dish.transform, antenna.dish.transform, [0, -18, 0])
  antenna.altaz[0] = altitude
}

/** Set the azimuth of an antenna's pointing direction. */
export function setAntennaAzimuth(azimuth: number, antenna: Antenna): void {
  azimuth = max(-PI, min(azimuth, PI))
  const dAz = azimuth - antenna.altaz[1]
  mat4.rotateY(antenna.boom.transform, antenna.boom.transform, dAz)
  antenna.altaz[1] = azimuth
}

/** Set the pointing direction. */
export function setPointingDirection(altaz: Vec2, antenna: Antenna): void {
  setAntennaAltitude(altaz[0], antenna)
  setAntennaAzimuth(altaz[1], antenna)
}

/** Set the position of an antenna. */
export function setAntennaPosition(position: Vec3, antenna: Antenna): void {
  mat4.translate(antenna.group.transform, antenna.group.transform, position)
  antenna.position = position
}
