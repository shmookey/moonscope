/** OBJ file importer. */

import * as fs from 'node:fs/promises'
import {objToXMesh} from './build/ratite/builder/objparse.js'
import { serialiseMeshToJSON } from './build/ratite/mesh.js'
import { setTextures } from './build/ratite/builder/mesh.js'

async function main() {
  if(process.argv.length !== 4)
    abort('usage: objimport <infile> <colour,normal,specular,occlusion>')

  const infile = process.argv[2]
  const textures = process.argv[3].split(',').map(x => Number.parseInt(x))

  const objSrc = await fs.readFile(infile, 'utf-8')
  const meshes = objToXMesh(objSrc)

  for(let mesh of meshes) {
    mesh = setTextures(textures, mesh)
    const src = serialiseMeshToJSON(mesh)
    const filename_json = `assets/mesh/imported/${mesh.name}.json`
    console.log(`Imported "${mesh.name}": ${mesh.vertexCount} vertices, ${mesh.indexCount} indices.`) 
    await fs.writeFile(filename_json, src)
    console.log(`Wrote ${filename_json}`)
  }
}

function abort(msg) {
  console.error(msg)
  process.exit(1)
}

await main()
