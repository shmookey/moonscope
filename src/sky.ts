import type {GPUContext} from './gpu/gpu'
import type {Renderable} from './gpu/types'
import {loadShader} from './gpu/gpu.js'
import {
  Float16Array
} from "../node_modules/@petamoriken/float16/browser/float16.mjs";

const { asin, sin, cos, log, min, max, random, PI } = Math

type VisGenState = {
  // Config
  width: number,
  height: number,
  layers: number,
  sublayersPerLayer: number,
  ingestBufferSize: number,
  dataSource: Iterator<LayerData>,
  // Local buffers
  vertexData: Float32Array,
  uniformData: Float32Array,
  instanceData: Float32Array,
  // GPU buffers
  vertexBuffer: GPUBuffer,
  instanceBuffer: GPUBuffer,
  uniformBuffer: GPUBuffer,
  exportBuffer: GPUBuffer,
  // Pipeline
  pipeline: GPURenderPipeline,
  uniformBindGroup: GPUBindGroup,
  renderPassDescriptor: GPURenderPassDescriptor,
  texture: GPUTexture,
}

export type LayerData = [
  number, // frequency
  number, // amplitude
  number, // rotation
  number, // phase
][]

const SUBLAYER_ELEMS     = 4
const SUBLAYER_SIZE      = SUBLAYER_ELEMS * 4
const VERTEX_COUNT       = 6
const VIS_TEXTURE_FORMAT = 'r16float'

//sources.push([0,0,80,true])
//sources.push([0.6,1,10,true])
//sources.push([1.2,0,10,true])
//sources.push([1,1.9,10,true])
//sources.push([1,0,1,true])
//sources.push([0,0,10,false])


//baselines = presetBaselines
//generateVisibilities()
//nextBaselines()

//export function frame(state: any, skyState: any, gpu: GPUContext) {
//  if(!nextBaselines()) return
//  //generateVisibilities();
//  //baselines[2] = PI/2;
//  (state.instanceData as Float32Array).set(baselines)
//  gpu.device.queue.writeBuffer(state.instanceBuffer, 0, state.instanceData)
//  render(state, gpu)
//  state.numBaselines += 10
//  updateSkyUniforms(state.numBaselines, skyState, gpu)
//}

//addSource(0, 0)
//addSource(1, 0)
//for(let i=1; i<500; i++) {
//  baselines.push(
//    random()*100,
//    random(),
//    random()*2*PI - PI,
//    0.2 + random() * 0.0001,
//  )
//}




export function applyLayers(layerCount: number, state: VisGenState, gpu: GPUContext): void {
  const sublayerCount = layerCount * state.sublayersPerLayer
  const ingestElems = sublayerCount * SUBLAYER_ELEMS
  const ingestSize = sublayerCount * SUBLAYER_SIZE
  if(ingestSize > state.ingestBufferSize)
    throw 'Ingest size exceeds ingest buffer size.'
  for(let layer=0; layer<layerCount; layer++) {
    const result = state.dataSource.next()
    const layerData: LayerData = result.value
    for(let sublayer=0; sublayer<state.sublayersPerLayer; sublayer++) {
      const sublayerData = layerData[sublayer]
      const dst = (layer*state.sublayersPerLayer + sublayer) * SUBLAYER_ELEMS
      state.instanceData.set(sublayerData, dst)
    }
  }

  gpu.device.queue.writeBuffer(state.instanceBuffer, 0, state.instanceData, 0, ingestElems)

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(state.renderPassDescriptor)
  passEncoder.setPipeline(state.pipeline)
  passEncoder.setVertexBuffer(0, state.vertexBuffer)
  passEncoder.setVertexBuffer(1, state.instanceBuffer)
  passEncoder.setBindGroup(0, state.uniformBindGroup)
  passEncoder.draw(VERTEX_COUNT, sublayerCount, 0, 0)
  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])

  state.layers += layerCount
}

export function grabVisTexture(state: VisGenState, gpu: GPUContext): void {
  const commandEncoder = gpu.device.createCommandEncoder()
  commandEncoder.copyTextureToBuffer({
    texture: state.texture
  }, {
    buffer: state.exportBuffer, 
    bytesPerRow: state.width*2
  }, {
    width: state.width, 
    height: state.height
  })
  gpu.device.queue.submit([commandEncoder.finish()])
}

export async function create(
      width:             number,
      height:            number,
      ingestBufferSize:  number,
      sublayersPerLayer: number,
      dataSource:        Iterator<LayerData>,
      gpu:               GPUContext
    ): Promise<VisGenState> {

  const vertexData = new Float32Array([
    -1, -1, 0, 1, -PI, -PI,
     1, -1, 0, 1,  PI, -PI,
     1,  1, 0, 1,  PI, PI,
     
    -1, -1, 0, 1, -PI, -PI,
     1,  1, 0, 1,  PI, PI,
    -1,  1, 0, 1, -PI, PI,
  ])
  const instanceData = new Float32Array(ingestBufferSize / 4)
  const texture = gpu.device.createTexture({
    size: [width, height, 1],
    format: VIS_TEXTURE_FORMAT,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const vertexBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
    size: vertexData.byteLength
  })
  const instanceBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    size: ingestBufferSize,
  })
  const vertexShader = await loadShader('/shader/vis.vert.wgsl', gpu)
  const fragmentShader = await loadShader('/shader/vis.frag.wgsl', gpu)
  
  const bindGroupLayout = gpu.device.createBindGroupLayout({
    entries: [{
      binding: 0, 
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    }]
  })
  const pipelineLayout = gpu.device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  })
  const pipeline = gpu.device.createRenderPipeline({
    label: 'vis-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vertexShader,
      entryPoint: 'main',
      buffers: [{
        arrayStride: 24,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset:  0, format: 'float32x4' }, // position
          { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
        ],
      }, {
        arrayStride: 16,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 2, offset:  0, format: 'float32' }, // frequency
          { shaderLocation: 3, offset:  4, format: 'float32' }, // amplitude
          { shaderLocation: 4, offset:  8, format: 'float32' }, // rotation
          { shaderLocation: 5, offset: 12, format: 'float32' }, // phase
        ],
      }],
    },
    fragment: {
      module: fragmentShader,
      entryPoint: 'main',
      targets: [{
        format: VIS_TEXTURE_FORMAT,
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }
        }
      }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
  })

  const exportBuffer = gpu.device.createBuffer({
    size: width * height * 2,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const uniformBuffer = gpu.device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const uniformBindGroup = gpu.device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: {buffer: uniformBuffer},
    }],
  })
  const uniformData = new Float32Array([sublayersPerLayer])

  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertexData)
  gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: texture.createView({
        format: VIS_TEXTURE_FORMAT,
        dimension: '2d',
        mipLevelCount: 1,
      }),
      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'load',
      storeOp: 'store',
    }],
  } as GPURenderPassDescriptor

  return {
    width,
    height,
    pipeline,
    vertexBuffer,
    instanceBuffer,
    uniformData,
    uniformBuffer,
    uniformBindGroup,
    renderPassDescriptor,
    texture,
    vertexData,
    instanceData,
    exportBuffer,
    layers: 0,
    sublayersPerLayer,
    dataSource,
    ingestBufferSize,
  }
}

export async function getPixels(state: any, gpu: GPUContext) {
  const buffer: GPUBuffer = state.exportBuffer
  await buffer.mapAsync(GPUMapMode.READ)
  const data = new Float16Array(buffer.getMappedRange())
  const data2 = Float16Array.from(data)
  
  console.log(data2)
  console.log(data2[0])
  buffer.unmap()
  return data2
}

export function updateSkyUniforms(numBaselines: number, state: any, gpu: GPUContext) {
  const uniformData: Float32Array = state.uniformData
  const uniformBuffer: GPUBuffer = state.uniformBuffer
  uniformData[0] = numBaselines
  gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
}

export async function createSkyRenderer(visTexture: GPUTexture, gpu: GPUContext): Promise<Renderable> {
  const vertexData = new Float32Array([
    -1, -1, 0, 1, 0, 0,
     1, -1, 0, 1, 1, 0,
     1,  1, 0, 1, 1, 1,
     
    -1, -1, 0, 1, 0, 0,
     1,  1, 0, 1, 1, 1,
    -1,  1, 0, 1, 0, 1,
  ])
  const uniformBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: 4,
  })
  const uniformData = new Uint32Array([0])

  const vertexBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
    size: vertexData.byteLength
  })
  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertexData)
  gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
  const vertexShader = await loadShader('/shader/sky.vert.wgsl', gpu)
  const fragShader = await loadShader('/shader/sky.frag.wgsl', gpu)

  const outputTexture = gpu.device.createTexture({
    size: [1024, 1024, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  })

  const uniformBindGroupLayout = gpu.device.createBindGroupLayout({
    entries: [{
      binding: 0, 
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    }, {
      binding: 1, 
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    }, {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
    }]
  })
  const pipelineLayout = gpu.device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout],
  })
  const pipeline = gpu.device.createRenderPipeline({
    label: 'sky-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vertexShader,
      entryPoint: 'main',
      buffers: [{
        arrayStride: 24,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // position
          { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
        ]
      }]
    },
    fragment: {
      module: fragShader,
      entryPoint: 'main',
      targets: [{
        format: 'rgba8unorm',
      }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
  })
  const sampler = gpu.device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  })
  
  const uniformBindGroup = gpu.device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } }, 
      { binding: 1, resource: sampler }, 
      { binding: 2, resource: visTexture.createView({ format: VIS_TEXTURE_FORMAT }) },
    ]
  })

  return {
    pipeline,
    vertexBuffer,
    vertexCount: 6,
    instanceCount: 1,
    uniformBindGroup,
    uniformBuffer,
    uniformData,
    outputTexture,
  }
}

export function renderSkyToTexture(state: Renderable, gpu: GPUContext) {
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: state.outputTexture.createView({
        format: 'rgba8unorm',
        dimension: '2d',
        mipLevelCount: 1,
      }),
      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'load',
      storeOp: 'store',
    }],
  } as GPURenderPassDescriptor

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
  passEncoder.setPipeline(state.pipeline)
  passEncoder.setVertexBuffer(0, state.vertexBuffer)
  passEncoder.setBindGroup(0, state.uniformBindGroup)
  passEncoder.draw(state.vertexCount, 1, 0, 0)
  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}
