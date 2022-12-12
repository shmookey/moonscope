export type Renderable = {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  instanceCount: number;
  instanceBuffer?: GPUBuffer;
  uniformBuffer?: GPUBuffer;
  uniformBindGroup?: GPUBindGroup;
  uniformData?: any;
  outputTexture?: GPUTexture;
}

export type Vec3 = Float32Array | [number,number, number]
export type Vec4 = Float32Array
export type Mat4 = Float32Array
export type Quat = Float32Array