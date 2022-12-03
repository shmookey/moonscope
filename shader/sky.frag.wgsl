struct Uniforms {
  numBaselines: u32
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

@fragment
fn main(
  @location(0) fragUV: vec2<f32>
) -> @location(0) vec4<f32> {
  let x = textureSample(myTexture, mySampler, fragUV).r; // / f32(uniforms.numBaselines);
  let y = abs(x);// / (f32(uniforms.numBaselines)); // / log(f32(uniforms.numBaselines)/log(1.5));
  let r = (y / f32(uniforms.numBaselines));
  //if(x > 0) {
  //  return vec4(x, x, x, 1.0);
  //} else {
  //  return vec4(-x, -x, -x, 1.0);
  //}
  if(x > 0) {
    return vec4(r/2.0, r/2.0, r/2.0, 1.0) * 1.0;
  } else {
    return vec4(r/2.0, r/2.0, r/3.0, 1.0) * 1.0;
  }
}