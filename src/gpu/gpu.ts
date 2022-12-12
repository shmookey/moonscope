import type {Renderable} from './types'

export type GPUContext = {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  modules: { [k: string]: GPUShaderModule };
  presentationFormat: GPUTextureFormat;
  renderPassDescriptor: GPURenderPassDescriptor;
  entities: Renderable[];
  presentationSize: { width: number; height: number };
  aspect: number;
}

export async function initGPU(canvas: HTMLCanvasElement): Promise<GPUContext> {
  const adapter = await navigator.gpu.requestAdapter()
  if(adapter == null)
    throw 'webgpu not available'
  const device = await adapter.requestDevice({
    //requiredFeatures: ['shader-f16'],
  })
  if(device == null)
    throw 'could not get gpu device'
  const context = canvas.getContext('webgpu') as GPUCanvasContext
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  })
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: null,
      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  } as GPURenderPassDescriptor
  return {
    adapter, 
    device, 
    context, 
    presentationFormat, 
    renderPassDescriptor,
    modules: {},
    entities: [],
    presentationSize: {width: canvas.width, height: canvas.height},
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

