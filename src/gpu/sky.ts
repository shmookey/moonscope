import type {GPUContext} from './gpu'
import type {Renderable} from './types'
import {loadShader} from './gpu.js'
import {
  Float16Array
} from "../../node_modules/@petamoriken/float16/browser/float16.mjs";

const { asin, sin, cos, log, min, max, random, PI } = Math


let [U, V] = [1, 1]
let angle = PI/2
let freq = 3
const sources: [number, number,number,boolean][] = []
const presetBaselines: number[] = [
//  1, 1, 0, 0,
//  
//  1, 1, 0, 0,
//  1, 1, 0, PI,
]
const batchSize = 10
let baselines: Float32Array = new Float32Array(batchSize*4)
let numBaselines = 0
function generateVisibilities() {
  //presetBaselines.length = 0
  for(let i=0; i<10000; i++) {
    let angle = random()*2*PI - PI
    let freq = max(1.0, random() *min(400, numBaselines))
    for(let [U,V,A,isBright] of sources) {
      let B = isBright ? 0 : PI
      let phase = U*cos(angle) + V*sin(angle)
      presetBaselines.push(
        freq,
        A,
        angle,
        freq * phase + B,
      )
    }
    numBaselines++
  }
  
}


function nextBaselines() {
  if(presetBaselines.length < batchSize*4) {
    console.log('end')
    return false
  }
  baselines.set(presetBaselines.slice(0, batchSize*4))
  presetBaselines.splice(0, batchSize*4)
  return true
}

//sources.push([0,0,80,true])
//sources.push([0.6,1,10,true])
//sources.push([1.2,0,10,true])
//sources.push([1,1.9,10,true])
//sources.push([1,0,1,true])
//sources.push([0,0,10,false])
for(let i=0; i<10; i++) {
  let x = (random()**2) * PI/1.5  // 3 - log(random()*1000)/Math.log(10)
  if(random() > 0.5) x = -x

  let y = (random()**2) * PI/2
  if(random() > 0.5) y = -y

  sources.push([
    x,                  // u
    y,                  // v
    random()*20,        // a
    random() > 0.5,     // light/dark
  ])
}

//baselines = presetBaselines
generateVisibilities()
nextBaselines()

export function frame(state: any, skyState: any, gpu: GPUContext) {
  if(!nextBaselines()) return
  //generateVisibilities();
  //baselines[2] = PI/2;
  (state.instanceData as Float32Array).set(baselines)
  gpu.device.queue.writeBuffer(state.instanceBuffer, 0, state.instanceData)
  render(state, gpu)
  state.numBaselines += 10
  updateSkyUniforms(state.numBaselines, skyState, gpu)
}

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
const textureFormat = 'r16float'

export async function create(gpu: GPUContext) {
  const width = 1280 // gpu.presentationSize.width
  const height = 1280 // gpu.presentationSize.height
  const vertexData = new Float32Array([
    -1, -1, 0, 1, -PI, -PI,
     1, -1, 0, 1,  PI, -PI,
     1,  1, 0, 1,  PI, PI,
     
    -1, -1, 0, 1, -PI, -PI,
     1,  1, 0, 1,  PI, PI,
    -1,  1, 0, 1, -PI, PI,
  ])
  const instanceData = new Float32Array(baselines)
  const texture = gpu.device.createTexture({
    size: [width, height, 1],
    format: textureFormat,
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
    size: instanceData.byteLength,
  })
  const instanceCount = baselines.length / 4
  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertexData)
  gpu.device.queue.writeBuffer(instanceBuffer, 0, instanceData)
  const vertexShader = await loadShader('/shader/vis.vert.wgsl', gpu)
  const fragmentShader = await loadShader('/shader/vis.frag.wgsl', gpu)
  
  const pipeline = gpu.device.createRenderPipeline({
    layout: 'auto',
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
        format: textureFormat,
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
  //const uniformBindGroup = gpu.device.createBindGroup({
  //  layout: pipeline.getBindGroupLayout(0),
  //  entries: [{
  //    binding: 0,
  //    resource: {buffer: uniformBuffer},
  //  }],
  //})
  //const uniformData = new Float32Array([0.5, 3.14])
  //gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: texture.createView({
        format: textureFormat,
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
    vertexCount: 6,
    instanceCount,
    instanceBuffer,
    uniformBuffer,
    //uniformBindGroup,
    renderPassDescriptor,
    texture,
    vertexData,
    instanceData,
    exportBuffer,
    numBaselines: 1,
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

export async function createSkyRenderer(numBaselines: number, visTexture: GPUTexture, gpu: GPUContext): Promise<Renderable> {
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
  const uniformData = new Uint32Array([numBaselines])

  const vertexBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
    size: vertexData.byteLength
  })
  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertexData)
  gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
  const vertexShader = await loadShader('/shader/sky.vert.wgsl', gpu)
  const fragShader = await loadShader('/shader/sky.frag.wgsl', gpu)

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
        format: gpu.presentationFormat,
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
      { binding: 2, resource: visTexture.createView({ format: textureFormat }) },
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
  }
}

export function render(state: any, gpu: GPUContext) {
  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(state.renderPassDescriptor)
  passEncoder.setPipeline(state.pipeline)
  passEncoder.setVertexBuffer(0, state.vertexBuffer)
  passEncoder.setVertexBuffer(1, state.instanceBuffer)
  //passEncoder.setBindGroup(0, entity.uniformBindGroup)
  passEncoder.draw(state.vertexCount, state.instanceCount, 0, 0)
  passEncoder.end()
  commandEncoder.copyTextureToBuffer({texture: state.texture}, {buffer: state.exportBuffer, bytesPerRow: state.width*2}, {width: state.width, height: state.height})
  gpu.device.queue.submit([commandEncoder.finish()])
}
