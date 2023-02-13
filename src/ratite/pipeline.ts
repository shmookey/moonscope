/** Pipeline builder functions */

import {mat4} from "gl-matrix"
import type {Atlas, Mat4, PipelineLayoutState, ShaderStore} from "./types.js"
import {UNIFORM_BUFFER_FLOATS, UNIFORM_BUFFER_SIZE, VERTEX_SIZE} from "./constants.js"


/** Initialise the global uniform buffer. */
export function createMainUniformBuffer(device: GPUDevice): GPUBuffer {
  const viewMatrix = mat4.create()
  const projectionMatrix = mat4.create()
  const uniformData = new Float32Array(UNIFORM_BUFFER_FLOATS)
  uniformData.set(viewMatrix, 0)
  uniformData.set(projectionMatrix, 16)
  const buffer = device.createBuffer({
    label: 'main-uniform-buffer',
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: UNIFORM_BUFFER_SIZE,
  })
  device.queue.writeBuffer(buffer, 0, uniformData)
  return buffer
}

/** Update the view matrix. */
export function setViewMatrix(viewMatrix: Mat4, buffer: GPUBuffer, device: GPUDevice) {
  if(viewMatrix.length != 16) {
    throw new Error("viewMatrix must have 16 elements")
  }
  device.queue.writeBuffer(buffer, 0, new Float32Array(viewMatrix))
}

/** Update the projection matrix. */
export function setProjectionMatrix(projectionMatrix: Mat4, buffer: GPUBuffer, device: GPUDevice) {
  if(projectionMatrix.length != 16) {
    throw new Error("projectionMatrix must have 16 elements")
  }
  device.queue.writeBuffer(buffer, 64, new Float32Array(projectionMatrix))
}

/** Setup Ratite's basic pipeline layouts. */
export function createPipelineLayouts(
    shadowMapBindGroupLayout: GPUBindGroupLayout,
    device: GPUDevice
  ): PipelineLayoutState {

  const geometryBindGroupLayout = device.createBindGroupLayout({
    label: 'geometry-bind-group-layout',
    entries: [{
      // General uniforms
      binding: 0, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    }, { 
      // Instance data
      binding: 1, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }, {
      // Lighting uniforms
      binding: 2, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }]
  })
  const materialsBindGroupLayout = device.createBindGroupLayout({
    label: 'materials-bind-group-layout',
    entries: [{ 
      // Materials data
      binding: 0, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }, {
      // Atlas metadata
      binding: 1, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }, {
      // Sampler
      binding: 2, 
      visibility: GPUShaderStage.FRAGMENT,
      sampler:    { type: 'filtering' },
    }, {
      // Atlas texture    
      binding: 3,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { 
        sampleType:    'float', 
        viewDimension: '2d-array', 
        multisampled:  false 
      },
    }]
  })
  //const shadowMapBindGroupLayout = device.createBindGroupLayout({
  //  label: 'shadow-map-bind-group-layout',
  //  entries: [{
  //    // Array texture    
  //    binding: 0,
  //    visibility: GPUShaderStage.FRAGMENT,
  //    texture: { 
  //      sampleType:    'depth', 
  //      viewDimension: '2d-array'
  //    },
  //  }]
  //})
  const forwardRenderPipelineLayout = device.createPipelineLayout({
    label: 'forward-render-pipeline-layout',
    bindGroupLayouts: [
      geometryBindGroupLayout,
      materialsBindGroupLayout,
      shadowMapBindGroupLayout,
    ],
  })
  const depthPassPipelineLayout = device.createPipelineLayout({
    label: 'depth-pass-pipeline-layout',
    bindGroupLayouts: [
      geometryBindGroupLayout,
      materialsBindGroupLayout,
    ],
  })
  return {
    geometryBindGroupLayout,
    materialsBindGroupLayout,
    shadowMapBindGroupLayout,
    forwardRenderPipelineLayout,
    depthPassPipelineLayout,
  }
}

/** Create a geometry bind group. */
export function createGeometryBindGroup(
  uniformBuffer:   GPUBuffer,
  instanceBuffer:  GPUBuffer,
  lightingBuffer:  GPUBuffer,
  layouts:         PipelineLayoutState,
  device:          GPUDevice): GPUBindGroup {

  return device.createBindGroup({
    label: 'geometry-bind-group', 
    layout: layouts.geometryBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer  } },
      { binding: 1, resource: { buffer: instanceBuffer } }, 
      { binding: 2, resource: { buffer: lightingBuffer } },
    ]
  })
}

/** Create a materials bind group. */
export function createMaterialsBindGroup( 
  materialsBuffer: GPUBuffer,
  atlas:           Atlas,
  sampler:         GPUSampler,
  layouts:         PipelineLayoutState,
  device:          GPUDevice): GPUBindGroup {

  const textureView = atlas.texture.createView({
    label:           'materials-bind-group-texture-view',
    format:          atlas.format,
    dimension:       '2d-array',
    arrayLayerCount: atlas.layerCount,
  })
  return device.createBindGroup({
    label: 'materials-bind-group',
    layout: layouts.materialsBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: materialsBuffer } },
      { binding: 1, resource: { buffer: atlas.metadataBuffer } },
      { binding: 2, resource: sampler }, 
      { binding: 3, resource: textureView },
    ]
  })
}

/** Create a shadow map bind group. */
//export function createShadowMapBindGroup( 
//  texture:         GPUTexture,
//  layouts:         PipelineLayoutState,
//  device:          GPUDevice): GPUBindGroup {
//    
//  const textureView = texture.createView({
//    label:           'materials-bind-group-texture-view',
//    format:          texture.format,
//    dimension:       '2d-array',
//    arrayLayerCount: texture.depthOrArrayLayers,
//  })
//  return device.createBindGroup({
//    label: 'shadow-map-bind-group',
//    layout: layouts.shadowMapBindGroupLayout,
//    entries: [
//      { binding: 0, resource: textureView },
//    ]
//  })
//}

/** Create a sampler for the main texture atlas. */
export function createMainSampler(device: GPUDevice): GPUSampler {
  return device.createSampler({
    label:         'main-sampler',
    magFilter:     'linear',
    minFilter:     'linear',
    mipmapFilter:  'linear',
    maxAnisotropy: 1,
    lodMinClamp:   2,
  })
}

export const vertexBufferLayout: GPUVertexBufferLayout[] = [{
  arrayStride: VERTEX_SIZE,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // position
    { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
    { shaderLocation: 2, offset: 24, format: 'snorm16x4' }, // normal
    { shaderLocation: 3, offset: 32, format: 'snorm16x4' }, // tangent
    { shaderLocation: 4, offset: 40, format: 'snorm16x4' }, // bitangent
    { shaderLocation: 5, offset: 48, format: 'uint32x4'  }, // textures
  ]
}, {
  arrayStride: 4,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 6, offset: 0, format: 'uint32' }, // storage index
  ]
}]


/** Create a pipeline object for forward rendering. */
export function createForwardRenderPipeline(
  name:               string,
  vertexShader:       GPUShaderModule,
  fragShader:         GPUShaderModule,
  layouts:            PipelineLayoutState,
  presentationFormat: GPUTextureFormat,
  device:             GPUDevice,
  enableDepthBuffer:  boolean = true,
  sampleCount:        number = 1): GPURenderPipeline {

  const pipeline = device.createRenderPipeline({
    label: `forward-render-pipeline::${name}`,
    layout: layouts.forwardRenderPipelineLayout,
    vertex: {
      module:     vertexShader,
      entryPoint: 'main',
      buffers:    vertexBufferLayout,
    },
    fragment: {
      module: fragShader,
      entryPoint: 'main',
      targets: [{
        format: presentationFormat,
        /*blend: {
          color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        }*/
      }]
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back',
      
    },
    depthStencil: {
      depthWriteEnabled: enableDepthBuffer,
      depthCompare: enableDepthBuffer ? 'less' : 'always',
      format: 'depth24plus',
    },
    multisample: {
      count: sampleCount,
    },
  })
  return pipeline
}


/** Create a pipeline object for depth pass rendering. */
export function createDepthPassPipeline(
  name:               string,
  vertexShader:       GPUShaderModule,
  fragShader:         GPUShaderModule,
  layouts:            PipelineLayoutState,
  device:             GPUDevice,
  alphaBlending:      boolean = false): GPURenderPipeline {

  const target: GPUColorTargetState = {
    format: 'depth24plus',
  }
  if (alphaBlending) {
    target.blend = {
      color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
    }
  }
  const pipeline = device.createRenderPipeline({
    label: `depth-pass-pipeline::${name}`,
    layout: layouts.forwardRenderPipelineLayout,
    vertex: {
      module:     vertexShader,
      entryPoint: 'main',
      buffers:    vertexBufferLayout,
    },
    fragment: {
      module:     fragShader,
      entryPoint: 'main',
      targets:    [],      // TODO: restore this functionality
    },
    primitive: {
      topology:  'triangle-list',
      frontFace: 'ccw',
      cullMode:  'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare:      'less',
      format:            'depth24plus',
    },
  })
  return pipeline
}
