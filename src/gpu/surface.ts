/*import type {GPUContext} from './gpu'
import type {Renderable} from './types'
import {loadShader} from './gpu.js'

const vertices = new Float32Array([
  -1, -1, 0, 1, 0, 0,
   1, -1, 0, 1, 1, 0,
   1,  1, 0, 1, 1, 1,
   
  -1, -1, 0, 1, 0, 0,
   1,  1, 0, 1, 1, 1,
  -1,  1, 0, 1, 0, 1,
])

export async function create(gpu: GPUContext): Promise<Renderable> {
  const vertexBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
    size: vertices.byteLength
  })
  const instanceBuffer = gpu.device.createBuffer({
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    size: 100
  })
  gpu.device.queue.writeBuffer(vertexBuffer, 0, vertices)
  const vertexShader = await loadShader('/shader/surface.vert.wgsl', gpu)
  const fragmentShader = await loadShader('/shader/surface.frag.wgsl', gpu)
  const pipeline = gpu.device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: vertexShader,
      entryPoint: 'main',
      buffers: [{
        arrayStride: 24,
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // position
          { shaderLocation: 1, offset: 16, format: 'float32x2' }, // uv
        ],
      }, {
        arrayStride: 12,
        stepMode: 'instance',
        attributes: [
        ],
      }],
    },
    fragment: {
      module: fragmentShader,
      entryPoint: 'main',
      targets: [{ format: gpu.presentationFormat }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
  })
  return {
    pipeline,
    vertexBuffer,
    vertexCount: 6,
    instanceCount: 1,
    instanceBuffer,
  }
}

export function render(gpu: GPUContext) {

}
*/