import type {ResourceBundleDescriptor, TextureResourceDescriptor, MeshResourceDescriptor, Atlas, 
  ResourceBundle, TextureResource, MeshResource, MeshStore, TextureRemapping, PipelineStore, ShaderStore, ShaderResourceDescriptor, PipelineDescriptor, MeshVertex, Renderer} from "./types"
import { addSubTexture, copyImageBitmapToSubTexture2, copyImageToSubTexture } from "./atlas.js"
import {addMesh, getMeshById, serialiseVertices} from "./mesh.js"
import {createPipeline} from "./pipeline.js"
import {createSceneGraphFromDescriptor} from "./scene.js"
import { createMaterial } from "./material.js"


/** Load a resource bundle. */
export async function loadResourceBundle(path: string, renderer: Renderer): Promise<ResourceBundle> {
  const descriptor = await fetchResourceBundleDescriptor(path)
  return loadResourceBundleFromDescriptor(descriptor, renderer)
}

/** Load a resource bundle given a ResourceBundleDescriptor. */
export async function loadResourceBundleFromDescriptor(
    descriptor: ResourceBundleDescriptor, 
    renderer: Renderer): Promise<ResourceBundle> {
  const startTime = performance.now()
  console.debug(`Loading resources for bundle${descriptor.label ? ` '${descriptor.label}'` : ''}...`)
  const {meshes, label, textures} = descriptor
  const {atlas, meshStore, device, pipelineLayout} = renderer
  const shaderStore = renderer.shaders
  const pipelineStore = renderer.pipelines
  const materialStore = renderer.materials
  const presentationFormat = renderer.context.presentationFormat

  // Load textures
  let textureResources = []
  const texturesPromise = (async () => {
    textureResources = await Promise.all(textures.map(texture => loadTextureResource(texture, atlas, device)))
  })()

  // Load meshes
  let meshResources = []
  const meshesPromise = (async () => {
    meshResources = await Promise.all(meshes.map(mesh => loadMeshResource(mesh, meshStore, device)))
  })()

  // Load shaders
  const shadersPromise = (async () => {
    await Promise.all(descriptor.shaders.map(async shader => {
      if(shader.name in shaderStore)
        throw new Error(`Shader '${shader.name}' already exists`)
      shaderStore[shader.name] = await loadShaderResource(shader, device)
    }))
  })()

  await Promise.all([texturesPromise, meshesPromise, shadersPromise])

  // Load materials
  const materialResources = []
  if('materials' in descriptor) {
    for(let materialDescriptor of descriptor.materials) {
      const material = createMaterial(materialStore, materialDescriptor)
      materialResources.push(material)
    }
  }

  // Load pipelines
  for(let pipeline of descriptor.pipelines) {
    if(pipeline.name in pipelineStore)
      throw new Error(`Pipeline '${pipeline.name}' already exists`)
    pipelineStore[pipeline.name] = setupPipeline(pipeline, shaderStore, pipelineLayout, presentationFormat, device)
  }

  // Setup scenes
  const sceneResources = []
  for(let sceneDescriptor of descriptor.scenes) {
    const scene = createSceneGraphFromDescriptor(sceneDescriptor, renderer)
    sceneResources.push(scene)
  }

  const endTime = performance.now()
  console.debug(`Finished loading resources for bundle${descriptor.label ? ` '${descriptor.label}'` : ''} in ${endTime - startTime}ms.`)
  return {
    label, 
    meshes: meshResources, 
    textures: textureResources,
    scenes: sceneResources,
    materials: materialResources,
  }
}

/** Load a mesh resource. */
export async function loadMeshResource(
    descriptor: MeshResourceDescriptor, 
    meshStore: MeshStore,
    device: GPUDevice): Promise<MeshResource> {
  const {name, vertexCount} = descriptor
  let vertices = descriptor.vertices
  let indices = descriptor.indices
  if(!vertices) {
    const response = await fetch(descriptor.src)
    if (descriptor.srcType === 'json') {
      const json = await response.json()
      vertices = json.vertices
      if(!indices) indices = json.indices
    } else if (descriptor.srcType === 'bin') {
      const buffer = await response.arrayBuffer()
      throw 'Loading binary mesh files is not implemented'
    } else {
      throw new Error(`Unknown mesh resource source type: ${descriptor.srcType}`)
    }
  }
  
  if(descriptor.texRemap)
    vertices = vertices.map(v => remapTextures(v, descriptor.texRemap))
  if('prescale' in descriptor)
    vertices = vertices.map(v => prescaleVertex(v, descriptor.prescale))
  if('prescaleUV' in descriptor)
    vertices = vertices.map(v => prescaleVertexUV(v, descriptor.prescaleUV))
  const vertexData = serialiseVertices(vertices)

  const meshId = addMesh(name, vertexCount, vertexData, indices, meshStore, device)
  const mesh = getMeshById(meshId, meshStore) // todo: remove
  return mesh
}

function prescaleVertex(vertex: MeshVertex, scale: number): MeshVertex {
  const p = vertex.position
  return {...vertex, position: [p[0]*scale, p[1]*scale, p[2]*scale, p[3]]}
}

function prescaleVertexUV(vertex: MeshVertex, scale: number): MeshVertex {
  const uv = vertex.uv
  return {...vertex, uv: [uv[0]*scale, uv[1]*scale]}
}

function remapTextures(vertex: MeshVertex, remapping: TextureRemapping): MeshVertex {
  for(let i=0; i<4; i++) {
    const texId = vertex.textures[i]
    if(texId in remapping)
      vertex.textures[i] = remapping[texId]
  }
  return vertex
}

/** Remap UV coordinates in an XVertex using an Atlas to produce a Vertex. */
//function remapUVs(vertex: MeshVertex, atlas: Atlas): Vertex {
//  const normalisedTexel = [1 / atlas.layerSize[0], 1 / atlas.layerSize[1]]
//  const [vx,vy,vz,w,u,v,nx,ny,nz,textureId] = vertex
//  const id = textureId in atlas.subTextures ? textureId : 0
//  const {x, y, width, height, layer} = atlas.subTextures[id]
//  const umin = (x / atlas.layerSize[0]) + normalisedTexel[0]
//  const vmin = (y / atlas.layerSize[1]) + normalisedTexel[1]
//  const umax = ((x + width) / atlas.layerSize[0]) - normalisedTexel[0]
//  const vmax = ((y + height) / atlas.layerSize[1]) - normalisedTexel[1]
//
//  //console.log([vx,vy,vz,w,u2,v2,layer,nx,ny,nz])
//  return [vx,vy,vz,w,u,v,id,nx,ny,nz,umin,vmin,umax,vmax]
//}

/** Load a texture resource. */
export async function loadTextureResource(
    descriptor: TextureResourceDescriptor, 
    atlas: Atlas,
    device: GPUDevice): Promise<TextureResource> {
  const {id, label, size} = descriptor
  const wrappable = descriptor.wrappable ?? false
  const subTexture = addSubTexture(atlas, size[0], size[1], label, wrappable, device)
  if (descriptor.src) {
    //const srcType = descriptor.srcType ?? 'image'
    //if(srcType === 'image') {
    //  const image = await loadImageBitmap(descriptor.src)
    //  copyImageBitmapToSubTexture(device, atlas, subTexture.id, image, [0, 0])
    //} else {
      const image = await loadImageBitmap(descriptor.src)
      await copyImageBitmapToSubTexture2(image, subTexture.id, atlas, device)
    //}
  }
  return {id, label, size, wrappable, texture: subTexture}
}

/** Load an image from a URL into an ImageBitmap. */
export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url)
  const blob = await response.blob()
  const image = await createImageBitmap(blob)
  return image
}

/** Load an SVG from a URL into an ImageBitmap. */
export async function loadImageSVG(url: string): Promise<ImageBitmap> {
  const response = await fetch(url)
  const blob = await response.blob()
  const element = new Image()
  element.src = URL.createObjectURL(blob)
  await element.decode()
  const image = await createImageBitmap(element)
  return image
}

/** Load an image from a URL into an HTMLImageElement. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url)
  const blob = await response.blob()
  const element = new Image()
  element.src = URL.createObjectURL(blob)
  await element.decode()
  return element
}

export async function loadShaderResource(descriptor: ShaderResourceDescriptor, device: GPUDevice): Promise<GPUShaderModule> {
  const url    = descriptor.src
  const result = await fetch(url)
  const code   = await result.text()
  return device.createShaderModule({label: `${descriptor.name}(${descriptor.src})`, code})
}

export function setupPipeline(
  descriptor:  PipelineDescriptor,
  shaderStore: ShaderStore,
  pipelineLayout: GPUPipelineLayout,
  presentationFormat: GPUTextureFormat,
  device: GPUDevice): GPURenderPipeline {

  if(!(descriptor.vertexShader in shaderStore))
    throw new Error(`Vertex shader ${descriptor.vertexShader} not found for pipeline ${descriptor.name}.`)
  if(!(descriptor.fragmentShader in shaderStore)) 
    throw new Error(`Fragment shader ${descriptor.fragmentShader} not found for pipeline ${descriptor.name}.`)
      
  return createPipeline(
    descriptor.name, 
    shaderStore[descriptor.vertexShader], 
    shaderStore[descriptor.fragmentShader], 
    pipelineLayout, 
    presentationFormat, 
    device,
    descriptor.depthWrite,
  )
}

/** Fetch a resource bundle descriptor from a URL and validate it. */
export async function fetchResourceBundleDescriptor(url: string): Promise<ResourceBundleDescriptor> {
  const response = await fetch(url)
  const bundle = await response.json()
  validateResourceBundleDescriptor(bundle)
  return bundle
}

/** Ensure a resource bundle descriptor is valid. */
export function validateResourceBundleDescriptor(bundle: ResourceBundleDescriptor) {
  if (!bundle.meshes) {
    throw new Error('Resource bundle missing meshes')
  }
  if (!bundle.textures) {
    throw new Error('Resource bundle missing textures')
  }
  if (!bundle.shaders) {
    throw new Error('Resource bundle missing shaders')
  }
  if (!bundle.pipelines) {
    throw new Error('Resource bundle missing pipelines')
  }
  for (const mesh of bundle.meshes) {
    if (!('name' in mesh)) {
      throw new Error('Resource bundle mesh missing name')
    }
    if (!('vertexCount' in mesh)) {
      throw new Error('Resource bundle mesh missing vertex count')
    }
  }
  for (const texture of bundle.textures) {
    if (!('id' in texture)) {
      throw new Error('Resource bundle texture missing ID')
    }
    if (!('label' in texture)) {
      throw new Error('Resource bundle texture missing label')
    }
    if (!('size' in texture)) {
      throw new Error('Resource bundle texture missing size')
    }
  }
  for (const shader of bundle.shaders) {
    if (!('name' in shader)) {
      throw new Error('Resource bundle shader missing name')
    }
    if (!('src' in shader)) {
      throw new Error('Resource bundle shader missing source')
    }
  }
  for (const pipeline of bundle.pipelines) {
    if (!('name' in pipeline)) {
      throw new Error('Resource bundle pipeline missing name')
    }
    if (!('vertexShader' in pipeline)) {
      throw new Error('Resource bundle pipeline missing vertex shader')
    }
    if (!('fragmentShader' in pipeline)) {
      throw new Error('Resource bundle pipeline missing fragment shader')
    }
    if (!('depthWrite' in pipeline)) {
      throw new Error('Resource bundle pipeline missing depth write')
    }
  }
}


