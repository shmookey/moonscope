/** Depth map export. */

import type { ShaderStore } from "../types"
import { RatiteError } from "../error.js"

const UNIFORM_LENGTH = 12

export type DepthMapExporter = {
  device:        GPUDevice,
  bindGroup:     GPUBindGroup,
  pipeline:      GPURenderPipeline,
  renderPass:    GPURenderPassDescriptor,
  outputTexture: GPUTexture,
  outputBuffer:  GPUBuffer,
  outputView:    GPUTextureView,
  uniformBuffer: GPUBuffer,
  uniformData:   ArrayBuffer,
  uniformView:   DataView,
}

/** Create a depth map exporter. */
export function createDepthMapExporter(
    depthTexture: GPUTextureView, 
    shaderStore: ShaderStore, 
    device: GPUDevice): DepthMapExporter {

  const uniformBuffer = device.createBuffer({
    label: 'depth-map-export-uniform-buffer',
    size: UNIFORM_LENGTH,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const uniformData = new ArrayBuffer(UNIFORM_LENGTH)
  const uniformView = new DataView(uniformData)
  const outputTexture = device.createTexture({
    label: 'depth-map-export-output-texture',
    size: {
      width:  1024,
      height: 1024,
    },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const outputView = outputTexture.createView({
    label: 'depth-map-export-output-view',
  })
  const outputBuffer = device.createBuffer({
    label: 'depth-map-export-output-buffer',
    size: 1024 * 1024 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const sampler = device.createSampler({
    label: 'depth-map-export-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'depth-map-export-bind-group-layout',
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
      buffer: { type: 'uniform' },
    }, {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'depth', viewDimension: '2d-array' },
    }, {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    }],
  })
  const pipelineLayout = device.createPipelineLayout({
    label: 'depth-map-export-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  })
  if(!shaderStore['depth-to-image']) 
    throw new RatiteError('NotFound', 'Shader not found: depth-to-image')
  const shaderModule = shaderStore['depth-to-image']
  const pipeline = device.createRenderPipeline({
    label: 'depth-map-export-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vertex_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragment_main',
      targets: [{
        format: 'rgba8unorm',
      }],
    },
    primitive: {
      topology: 'triangle-list',  
    },
  })
  const bindGroup = device.createBindGroup({
    label: 'depth-map-export-bind-group',
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer },
    }, {
      binding: 1,
      resource: depthTexture,
    }, {
      binding: 2,
      resource: sampler,
    }],
  })
  const renderPass: GPURenderPassDescriptor = {
    label: 'depth-map-export-render-pass',
    colorAttachments: [{
      view: outputView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  }

  return {
    device,
    bindGroup,
    pipeline,
    renderPass,
    outputTexture,
    outputView,
    outputBuffer,
    uniformBuffer,
    uniformData,
    uniformView,
  }
}

/** Export a depth map layer as an ImageBitmap. */
export async function exportDepthMapLayer(
    layer:    number,
    depthMin: number,
    depthMax: number,
    exporter: DepthMapExporter): Promise<ImageBitmap> {

  const { device, uniformView } = exporter
  uniformView.setUint32(0, layer, true)
  uniformView.setFloat32(4, depthMin, true)
  uniformView.setFloat32(8, depthMax, true)
  device.queue.writeBuffer(
    exporter.uniformBuffer, 0, 
    exporter.uniformData, 0, 
    UNIFORM_LENGTH)
  const commandEncoder = device.createCommandEncoder({
    label: 'depth-map-export-command-encoder',
  })
  const passEncoder = commandEncoder.beginRenderPass(exporter.renderPass)
  passEncoder.setPipeline(exporter.pipeline)
  passEncoder.setBindGroup(0, exporter.bindGroup)
  passEncoder.draw(6, 1, 0, 0)
  passEncoder.end()
  commandEncoder.copyTextureToBuffer(
    { texture: exporter.outputTexture, mipLevel: 0, origin: { x: 0, y: 0, z: layer } },
    { buffer: exporter.outputBuffer, bytesPerRow: 1024 * 4, rowsPerImage: 1024 },
    { width: 1024, height: 1024, depthOrArrayLayers: 1 }
  )
  device.queue.submit([commandEncoder.finish()])
  await exporter.outputBuffer.mapAsync(GPUMapMode.READ)
  const data = new Uint8ClampedArray(exporter.outputBuffer.getMappedRange())
  const imageData = new ImageData(data, 1024, 1024)
  const imageBitmap = await createImageBitmap(imageData, { imageOrientation: 'flipY' })
  exporter.outputBuffer.unmap()
  return imageBitmap
}
