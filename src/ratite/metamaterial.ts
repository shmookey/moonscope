/** Meta-material management.
 * 
 * A meta-material is a collection of shaders and pipeline configurations that
 * can be parameterised to create a material. The structure of a meta-
 * material's configuration object is defined by its `layout` property, which
 * describes the names, types and offsets of the configuration parameters
 * 
 * Like most Ratite objects, a meta-material can be created by calling a
 * "create" function (`createMetamaterial`) with a descriptor, however due to
 * the wide range of possible pipeline configurations in WebGPU, some valid
 * pipelines can not be expressed in a descriptor. In these cases, a meta-
 * material object can be constructed directly and registered with the material
 * manager using `addMetamaterial`, or a meta-material created in the usual way
 * can be modified with custom pipelines by setting the appropriate properties
 * on the meta-material object. The `MetaMaterialDescriptor` type covers the
 * most common cases for blending, depth testing, etc. while more specialised
 * cases will require a custom meta-material object.
 * 
 * A meta-material's shaders control how the material is rendered in a number
 * of different contexts. The "forward" shaders are used for normal forward-
 * rendering passes including both geometry and lighting. The "shadow" shaders
 * are used in depth-only passes for shadow mapping. In the future, "deferred"
 * shaders will be used to implement deferred rendering.
 * 
 * This module only manages CPU-side shader and pipeline objects, storage of
 * material configuration data in GPU buffers is the responsibility of the
 * material manager. In particular, the material manager may choose to use a
 * different size than the meta-material's `layout.byteLength` in order to
 * facilitate consistent buffer alignment.
 * 
 * Meta-materials are part of Ratite's material system, which defines a common
 * set of pipeline layouts for all [meta-]materials. It is possible to create
 * meta-materials by hand that use different layouts, but the Ratite renderer
 * will not about their custom bind groups. A custom bind group layout which is
 * a strict subset of the common layout is renderable but not recommended, as
 * switching layouts is expensive and shaders which do not need certain
 * bindings can simply ignore them.
 */

import type {
  MetaMaterial, MetaMaterialDescriptor, MetaMaterialState, PipelineLayoutState,
  ShaderName, ShaderStore
} from './types'
import { RatiteError } from './error.js'
import { vertexBufferLayout } from './pipeline.js'

/** Default alpha blend state configuration. */
const alphaBlendState: GPUBlendState = {
  color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
}

/** Initialise the meta-material manager. */
export function createMetaMaterialState(
    shaderStore:        ShaderStore,
    pipelineLayouts:    PipelineLayoutState,
    presentationFormat: GPUTextureFormat,
    multisampleCount:   number,
    depthFormat:        GPUTextureFormat,
    device:             GPUDevice): MetaMaterialState {
  const metaMaterials = new Map<string, MetaMaterial>()
  const slots: MetaMaterial[] = []
  const nextMetaMaterialID = 0
  return {
    slots, 
    device, 
    metaMaterials, 
    nextMetaMaterialID, 
    shaderStore, 
    pipelineLayouts,
    presentationFormat,
    multisampleCount,
    depthFormat,
  }
}

/** Create a new meta-material. */
export function createMetaMaterial(
    descriptor: MetaMaterialDescriptor,
    state:      MetaMaterialState) {
  const { device, pipelineLayouts, shaderStore } = state

  const forwardVertexShader   = getShader(descriptor.shaders.forwardVertex, shaderStore)
  const forwardFragmentShader = getShader(descriptor.shaders.forwardFragment, shaderStore)
  const shadowVertexShader    = getShader(descriptor.shaders.shadowVertex, shaderStore)
  const shadowFragmentShader  = getShader(descriptor.shaders.shadowFragment, shaderStore)

  const forwardPipeline = device.createRenderPipeline({
    label: `forward-render-pipeline::${descriptor.name}`,
    layout: pipelineLayouts.forwardRenderPipelineLayout,
    vertex: {
      module:     forwardVertexShader.module,
      entryPoint: forwardVertexShader.entryPoint,
      buffers:    vertexBufferLayout,
    },
    fragment: {
      module:     forwardFragmentShader.module,
      entryPoint: forwardFragmentShader.entryPoint,
      targets: [{
        format: state.presentationFormat,
        ...(descriptor.alphaBlend && { blend: alphaBlendState}),
      }]
    },
    primitive: {
      topology:  'triangle-list',
      frontFace: descriptor.frontFace ?? 'ccw',
      cullMode:  descriptor.cullMode ?? 'back',
      
    },
    depthStencil: {
      depthWriteEnabled: descriptor.depthWrite ?? true,
      depthCompare:      descriptor.depthTest ?? 'less',
      format:            state.depthFormat,
    },
    multisample: {
      count: state.multisampleCount,
    },
  })

  const shadowPipeline = device.createRenderPipeline({
    label: `shadow-render-pipeline::${descriptor.name}`,
    layout: pipelineLayouts.depthPassPipelineLayout,
    vertex: {
      module:     shadowVertexShader.module,
      entryPoint: shadowVertexShader.entryPoint,
      buffers:    vertexBufferLayout,
    },
    fragment: {
      module:     shadowFragmentShader.module,
      entryPoint: shadowFragmentShader.entryPoint,
      targets:    [],
    },
    primitive: {
      topology:  'triangle-list',
      frontFace: descriptor.frontFace ?? 'ccw',
      cullMode:  descriptor.shadowCullMode ?? 'back',
      unclippedDepth: true,
    },
    depthStencil: {
      depthWriteEnabled: descriptor.shadowDepthWrite ?? true,
      depthCompare:      'less',
      format:            state.depthFormat,
    },
    multisample: {
      count: state.multisampleCount,
    },
  })

  const metaMaterial: MetaMaterial = {
    id:          state.nextMetaMaterialID++,
    name:        descriptor.name,
    layout:      descriptor.layout,
    usage:       0,
    castShadows: descriptor.castShadows ?? true,
    pipelines: {
      forward:   forwardPipeline,
      shadow:    shadowPipeline,
    },
  }

  state.slots[metaMaterial.id] = metaMaterial
  state.metaMaterials.set(descriptor.name, metaMaterial)
  return metaMaterial
}

/** Shader reference. */
export type ShaderRef = {module: GPUShaderModule, entryPoint: string}

/** Get a shader from the shader store. */
export function getShader(name: ShaderName, state: ShaderStore): ShaderRef {
  if (!(name[0] in state)) 
    throw new RatiteError('NotFound', `Shader module "${name[0]}" not found`)
  const module = state[name[0]]
  return {module, entryPoint: name[1]}
}
