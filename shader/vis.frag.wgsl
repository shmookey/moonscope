//struct Uniforms {
//  slope: f32,
//  phase: f32
//}
//@binding(0) @group(0) var<uniform> uniforms: Uniforms;


@fragment
fn main(
  @location(0) fragUV: vec2<f32>,
  @location(1) frequency: f32,
  @location(2) amplitude: f32
) -> @location(0) f32 {
  return amplitude * cos(fragUV.x * frequency);
}
