/** scene.ts - Low-level scene management and rendering. */

import {mat4} from "../../node_modules/gl-matrix/esm/index.js"
import type {Atlas, DrawCallDescriptor, Mat4} from "./types.js"
import {UNIFORM_BUFFER_FLOATS, UNIFORM_BUFFER_SIZE, VERTEX_SIZE} from "./constants.js"


const bindGroupLayoutDescriptor: GPUBindGroupLayoutDescriptor = {
  label: 'main-bind-group-layout',
  entries: [{
    binding: 0, 
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: 'uniform' },
  }, {
    binding: 1, 
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: 'read-only-storage' },
  }, {
    binding: 2, 
    visibility: GPUShaderStage.FRAGMENT,
    sampler: { type: 'filtering' },
  }, {
    binding: 3,
    visibility: GPUShaderStage.FRAGMENT,
    texture: { 
      sampleType: 'float', 
      viewDimension: '2d-array', 
      multisampled: false 
    },
  }]
}

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
  device.queue.writeBuffer(buffer, 0, viewMatrix)
}

/** Update the projection matrix. */
export function setProjectionMatrix(projectionMatrix: Mat4, buffer: GPUBuffer, device: GPUDevice) {
  if(projectionMatrix.length != 16) {
    throw new Error("projectionMatrix must have 16 elements")
  }
  device.queue.writeBuffer(buffer, 64, projectionMatrix.buffer)
}

export function createMainBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout(bindGroupLayoutDescriptor)
}

export function createMainBindGroup( 
  layout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
  storageBuffer: GPUBuffer,
  atlas: Atlas,
  sampler: GPUSampler,
  device: GPUDevice): GPUBindGroup {
  const textureView = atlas.texture.createView({
    label: 'main-texture-view',
    format: atlas.format,
    dimension: '2d-array',
    arrayLayerCount: atlas.layerCount,
  })
  const bindGroup = device.createBindGroup({
    label: 'main-bind-group',
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: storageBuffer } }, 
      { binding: 2, resource: sampler }, 
      { binding: 3, resource: textureView},
    ]
  })
  return bindGroup
}

export function createMainSampler(device: GPUDevice): GPUSampler {
  return device.createSampler({
    label: 'main-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  })
}

/** Create the main pipeline object. */
export async function createMainPipeline(
    bindGroupLayout: GPUBindGroupLayout,
    presentationFormat: GPUTextureFormat,
    device: GPUDevice): Promise<GPURenderPipeline> {
  const vertexShader = await loadShader('/shader/entity.vert.wgsl', device)
  const fragShader = await loadShader('/shader/entity.frag.wgsl', device)
  const pipelineLayout = device.createPipelineLayout({
    label: 'main-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  })
  const pipeline = device.createRenderPipeline({
    label: 'main-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vertexShader,
      entryPoint: 'main',
      buffers: [{
        arrayStride: VERTEX_SIZE,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // position
          { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
          { shaderLocation: 2, offset: 24, format: 'float32' },   // texture layer
          { shaderLocation: 3, offset: 28, format: 'float32x3' }, // normal
          { shaderLocation: 4, offset: 40, format: 'float32x4' }, // position
        ]
      }, {
        arrayStride: 4,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 5, offset: 0, format: 'uint32' }, // storage index
        ]
      }]
    },
    fragment: {
      module: fragShader,
      entryPoint: 'main',
      targets: [{
        format: presentationFormat,
      }]
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back',
      
    },
  })
  return pipeline
}

async function loadShader(url: string, device: GPUDevice): Promise<GPUShaderModule> {
  const result = await fetch(url)
  const code = await result.text()
  return device.createShaderModule({label: url, code})
}
