import type {GPUContext, Renderable} from './types'

export async function initGPU(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<GPUContext> {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if(adapter == null)
    throw 'webgpu not available'
  const device = await adapter.requestDevice({
    //requiredFeatures: ['shader-f16'],
  })
  if(device == null)
    throw 'could not get gpu device'
  const context = canvas.getContext('webgpu') as GPUCanvasContext
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat()
  const presentationSize = {width: canvas.width, height: canvas.height}
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  })
  const msaaTexture: GPUTexture = device.createTexture({
    size: presentationSize,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    sampleCount: 1,
  })
  const msaaView: GPUTextureView = msaaTexture.createView()
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: msaaView,
      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  } as GPURenderPassDescriptor
  return {
    adapter, 
    device, 
    context, 
    presentationSize,
    presentationFormat, 
    renderPassDescriptor,
    modules: {},
    entities: [],
    aspect: canvas.width / canvas.height,
  }
}

export async function loadShader(url: string, gpu: GPUContext): Promise<GPUShaderModule> {
  if(url in gpu.modules)
    return gpu.modules[url]
  const r = await fetch(url)
  const v = await r.text()
  const module = gpu.device.createShaderModule({code: v})
  gpu.modules[url] = module
  return module
}

export function frame(gpu: GPUContext): void {
  (gpu.renderPassDescriptor as any).colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView()

  const commandEncoder = gpu.device.createCommandEncoder()
  const passEncoder = commandEncoder.beginRenderPass(gpu.renderPassDescriptor)
  for(let entity of gpu.entities) {
    passEncoder.setPipeline(entity.pipeline)
    passEncoder.setVertexBuffer(0, entity.vertexBuffer)
    if(entity.instanceBuffer)
      passEncoder.setVertexBuffer(1, entity.instanceBuffer)
    if(entity.uniformBindGroup)
      passEncoder.setBindGroup(0, entity.uniformBindGroup)
    passEncoder.draw(entity.vertexCount, entity.instanceCount, 0, 0)
  }
  passEncoder.end()
  gpu.device.queue.submit([commandEncoder.finish()])
}

