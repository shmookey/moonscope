/** Radio telescope model.
 * 
 * Manages the scene graph for a radio telescope comprised of multiple antenna
 * elements. The telescope object can manage the pointing direction for the
 * entire array, but individual antennas can also be manipulated independently.
 */
import type { Node, SceneGraph, Vec2, Vec3 } from "./ratite/types"
import type { Antenna } from "./antenna"
import { attachNode, detachNode, getNodeByName, setTranslation } from "./ratite/scene.js"
import { setPointingDirection, cloneAntenna, initAntenna, setAntennaPosition } from "./antenna.js"


export type Telescope = {
  node:            Node,        // Root node of the telescope
  antennas:        Antenna[],   // Sparse array of antennas indexed by ID
  antennaTemplate: Antenna,     // Template antenna used to create new antennas
  scene:           SceneGraph,  // Scene graph containing the telescope
  altaz:           Vec2,        // Altitude/azimuth pointing direction
}

export type AntennaDescriptor = {
  altaz:    Vec2,  // Altitude/azimuth pointing direction
  position: Vec3,  // East/North/Height distance from array centre
}

export const defaultTelescopeDescriptor: AntennaDescriptor[] = [
  { altaz: [0, 0], position: [ 15,  0,  20] },
  { altaz: [0, 0], position: [ -2,  0,  15] },
  { altaz: [0, 0], position: [ 25,  0, -20] },
  { altaz: [0, 0], position: [-15,  0, -15] },
  { altaz: [0, 0], position: [ 30,  0,   5] },
  { altaz: [0, 0], position: [-35,  0,   3] },
  { altaz: [0, 0], position: [ 10,  0, -40] },
  { altaz: [0, 0], position: [-30,  0, -35] },
  { altaz: [0, 0], position: [ 18,  0,   4] },
  { altaz: [0, 0], position: [-22,  0,  -6] },
  { altaz: [0, 0], position: [  3,  0, -19] },
  { altaz: [0, 0], position: [ -5,  0, -23] },
]

/** Initialse a telescope.
 * 
 * The scene graph must contain an "antenna" node, which will be used as the
 * template for creating all of the telescope's constituent antennas. This node
 * will be removed from the scene graph.
 * 
 * The scene graph must also contain a "telescope" node, which will be used as
 * the root node for the telescope.
 */
export function createTelescope(node: Node, antennaDescriptors: AntennaDescriptor[], scene: SceneGraph): Telescope {
  const antennaNode = getNodeByName('antenna', scene)
  if (!antennaNode)
    throw new Error('Scene graph does not contain an "antenna" node.')
  detachNode(antennaNode, scene)
  const antennaTemplate = initAntenna(antennaNode, scene)
  const telescope: Telescope = {
    node:            node, 
    antennas:        [], 
    antennaTemplate: antennaTemplate,
    altaz:           [0, 0],
    scene:           scene,
  }
  for (const descriptor of antennaDescriptors)
    addAntenna(descriptor, telescope)
  return telescope
}

/** Add an antenna to a telescope.
 * 
 * Returns the antenna object.
 */
export function addAntenna(descriptor: AntennaDescriptor, telescope: Telescope): Antenna {
  const antenna = cloneAntenna(telescope.antennaTemplate)
  setPointingDirection(descriptor.altaz, antenna)
  setAntennaPosition(descriptor.position, antenna)
  attachNode(antenna.group, telescope.node, telescope.scene)
  telescope.antennas[antenna.id] = antenna
  return antenna
}

/** Remove an antenna from a telescope. */
export function removeAntenna(antenna: Antenna, telescope: Telescope): void {
  detachNode(antenna.group, telescope.scene)
  delete telescope.antennas[antenna.id]
}

/** Set the pointing direction of a telescope.
 * 
 * This function sets the pointing direction for all of the telescope's
 * antennas.
 */
export function setTelescopePointingDirection(altaz: Vec2, telescope: Telescope): void {
  telescope.altaz = altaz
  for (const antenna of telescope.antennas)
    setPointingDirection(altaz, antenna)
}

/** Set the position of a telescope. */
export function setTelescopePosition(position: Vec3, telescope: Telescope): void {
  setTranslation(position, telescope.node)
}
