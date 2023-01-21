/** node script to build asset files */

import * as fs from 'node:fs/promises'
import * as Polyhedron from './build/src/ratite/builder/polyhedron.js'
import { tiledSquareMesh, embedMesh } from './build/src/ratite/builder/2d.js'
import { setTextures } from './build/src/ratite/builder/mesh.js'
import { serialiseMeshToJSON } from './build/src/ratite/mesh.js'

async function main() {
  const ground     = await makeGround()
  const icosphere1 = await makeIcosphere(1)
  const icosphere3 = await makeIcosphere(3)
  const earth      = await makeEarth()
}

async function makeGround() {
  //const mesh = uniformScaleMeshPositionUV(1000, square())
  const mesh = setTextures([1,2,6,0], embedMesh(tiledSquareMesh(6, 1)))
  mesh.name = 'ground'
  mesh.id = 0

  const src = serialiseMeshToJSON(mesh)
  const filename_json = `assets/mesh/generated/ground.json`
  await fs.writeFile(filename_json, src)
  console.log(`Wrote ${filename_json} (${mesh.vertexCount} vertices)`)

  return mesh
}

async function makeEarth() {
  const mesh = await makeIcosphere(4)
  mesh.name = 'earth'
  mesh.id = 1
  const src = serialiseMeshToJSON(mesh)
  const filename_json = `assets/mesh/generated/earth.json`
  await fs.writeFile(filename_json, src)
  console.log(`Wrote ${filename_json} (${mesh.vertexCount} vertices)`)
}

async function makeIcosphere(n) {
  const p = Polyhedron.subdividedIcosahedron(n)
  const mesh = Polyhedron.polyhedronMesh(p, [0, 0, 0, 0], true)
  const src = serialiseMeshToJSON(mesh)
  const filename_json = `assets/mesh/generated/icosphere-${n}.json`
  await fs.writeFile(filename_json, src)
  console.log(`Wrote ${filename_json} (${mesh.vertexCount} vertices)`)
  return mesh
}

await main()
