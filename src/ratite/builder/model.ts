import {XMesh} from '../types';
import * as MeshBuilder from './mesh.js'

type Model = {
  name: string,
  mesh: XMesh,
  textures: TextureDescriptor[],
}

type TextureDescriptor = {
  name: string,
  size: number,
}
