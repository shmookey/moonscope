/** node script to build asset files */

import * as fs from 'node:fs/promises'
import * as Polyhedron from './build/ratite/builder/polyhedron.js'
import { square, uniformScaleMeshPosition, uniformScaleMeshPositionUV } from './build/ratite/builder/mesh.js'
import { serialiseMeshToJSON } from './build/ratite/mesh.js'

async function main() {
  const ground     = makeGround()
  const icosphere1 = await makeIcosphere(1)
  const icosphere3 = await makeIcosphere(3)
  const earth      = await makeEarth()
}

function makeGround() {
  const mesh = uniformScaleMeshPositionUV(1000, square())
  mesh.name = 'ground'
  mesh.id = 0
  return mesh
}

async function makeEarth() {
  const mesh = await makeIcosphere(4)
  mesh.name = 'earth'
  mesh.id = 1
  const src = serialiseMeshToJSON(mesh)
  const filename_json = `assets/mesh/generated/earth.json`
  await fs.writeFile(filename_json, src)
}

async function makeIcosphere(n) {
  const p = Polyhedron.subdividedIcosahedron(n)
  const mesh = Polyhedron.polyhedronMesh(p, [0, 0, 0, 0], true)
  const src = serialiseMeshToJSON(mesh)
  const filename_json = `assets/mesh/generated/icosphere-${n}.json`
  await fs.writeFile(filename_json, src)
  return mesh
}

await main()
