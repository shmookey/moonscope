import {loadShader} from './gpu.js'
import type {GPUContext, SkyboxState} from './types'

const VERTICES = [
  // front
  -1.0, -1.0,  1.0,
   1.0,  1.0,  1.0,
  -1.0,  1.0,  1.0,
  -1.0, -1.0,  1.0,
   1.0, -1.0,  1.0,
   1.0,  1.0,  1.0,
  // back
   1.0, -1.0, -1.0,
  -1.0,  1.0, -1.0,
   1.0,  1.0, -1.0,
   1.0, -1.0, -1.0,
  -1.0, -1.0, -1.0,
  -1.0,  1.0, -1.0,
  // left
  -1.0, -1.0, -1.0,
  -1.0,  1.0,  1.0,
  -1.0,  1.0, -1.0,
  -1.0, -1.0, -1.0,
  -1.0, -1.0,  1.0,
  -1.0,  1.0,  1.0,
  // right
   1.0,  1.0, -1.0,
   1.0, -1.0,  1.0,
   1.0, -1.0, -1.0,
   1.0,  1.0, -1.0,
   1.0,  1.0,  1.0,
   1.0, -1.0,  1.0,
  // top
  -1.0,  1.0, -1.0,
   1.0,  1.0,  1.0,
  -1.0,  1.0,  1.0,
  -1.0,  1.0, -1.0,
   1.0,  1.0, -1.0,
   1.0,  1.0,  1.0,
  // bottom
  -1.0, -1.0, -1.0,
   1.0, -1.0,  1.0,
  -1.0, -1.0,  1.0,
  -1.0, -1.0, -1.0,
   1.0, -1.0, -1.0,
   1.0, -1.0,  1.0,
]
const TEXTURE_FORMAT = 'rgba8unorm'


export async function createSkybox(uniformBuffer: GPUBuffer, gpu: GPUContext, msaaCount: number = 1): Promise<SkyboxState> {
  const vertexData = new Float32Array(VERTICES)
  
  const vertexBuffer = gpu.device.createBuffer({
    label: 'skybox-vertex-buffer',
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
    size: vertexData.byteLength
  })
  
  
  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertexData)

  const vertexShader = await loadShader('/shader/skybox.vert.wgsl', gpu)
  const fragShader = await loadShader('/shader/skybox.frag.wgsl', gpu)

  const texture = gpu.device.createTexture({
    label:     'skybox-texture',
    size:      [1024, 1024, 6],
    dimension: '2d',
    format:    'rgba8unorm',
    usage:     GPUTextureUsage.TEXTURE_BINDING 
             | GPUTextureUsage.COPY_DST,
  })

  const uniformBindGroupLayout = gpu.device.createBindGroupLayout({
    label: 'skybox-uniform-bind-group-layout',
    entries: [{
      binding: 0, 
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    }, {
      binding: 1, 
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    }, {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float', viewDimension: 'cube', multisampled: false },
    }]
  })
  const pipelineLayout = gpu.device.createPipelineLayout({
    label: 'skybox-pipeline-layout',
    bindGroupLayouts: [uniformBindGroupLayout],
  })
  const pipeline = gpu.device.createRenderPipeline({
    label: 'skybox-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vertexShader,
      entryPoint: 'main',
      buffers: [{
        arrayStride: 12,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
         // { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
        ]
      }]
    },
    fragment: {
      module: fragShader,
      entryPoint: 'main',
      targets: [{
        format: gpu.presentationFormat,
      }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: 'less',
      format: 'depth24plus',
    },
    multisample: {
      count: msaaCount,
    },
  })
  const sampler = gpu.device.createSampler({
    label: 'skybox-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  })
  
  const uniformBindGroup = gpu.device.createBindGroup({
    label: 'skybox-uniform-bind-group',
    layout: uniformBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } }, 
      { binding: 1, resource: sampler }, 
      { binding: 2, resource: texture.createView({ 
                                format: TEXTURE_FORMAT,
                                dimension: 'cube',
                                arrayLayerCount: 6,
                              })},
    ]
  })

  return {
    pipeline,
    vertexBuffer,
    vertexCount: VERTICES.length / 3,
    uniformBindGroup,
    texture
  }
}

export function writeSkyboxTextures(texture: GPUTexture, state: SkyboxState, gpu: GPUContext) {
  const src = {texture}
  const [width, height] = [1024,1024]
  const commandEncoder = gpu.device.createCommandEncoder()
  for(let z=0; z<6; z++) {
    const dst: GPUImageCopyTexture = {texture: state.texture, origin: {z}}    
    commandEncoder.copyTextureToTexture(src, dst, {width, height})
  }
  gpu.device.queue.submit([commandEncoder.finish()])
}