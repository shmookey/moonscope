/** Geometry builder types.
 * 
 * These types are used internally to the geometry builder and are not
 * exported to the rest of the engine.
 */

import type {Vec3} from "../types";

/** Polyhedron type.
 * 
 * Represents a convex polyhedron, defined by a set of vertices and a set of
 * faces. Each face is defined by a set of vertex indices.
 */
export type Polyhedron = {
  vertices: Vec3[],
  faces: number[][],
}


export type Triangle = [Vec3, Vec3, Vec3]
