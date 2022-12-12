struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var texture: texture_cube<f32>;

@fragment
fn main(
  @location(0) direction: vec3<f32>
) -> @location(0) vec4<f32> {
  return textureSample(texture, mySampler, direction); 
//  return vec4<f32>(0.0, 0.0, 1.0, 1.0);
}