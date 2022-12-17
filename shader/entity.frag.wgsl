struct InstanceProperties {
  model: mat4x4<f32>,
  reserved: vec4<f32>,
}

struct Storage {
  data: array<InstanceProperties>,
}

@group(0) @binding(1) var<storage> store: Storage;
@group(0) @binding(2) var mySampler: sampler;
@group(0) @binding(3) var atlas: texture_2d_array<f32>;

@fragment
fn main(
  @location(0)                    uv:           vec2<f32>,
  @location(1)                    normal:       vec3<f32>,
  @location(2) @interpolate(flat) textureLayer: i32,
  @location(3) @interpolate(flat) instanceSlot: u32,
  @location(4) @interpolate(flat) texBounds: vec4<f32>,
) -> @location(0) vec4<f32> {
  let texWidth  = texBounds.z - texBounds.x;
  let texHeight = texBounds.w - texBounds.y;

  let u = fract(uv.x) * texWidth + texBounds.x;
  let v = fract(uv.y) * texHeight + texBounds.y;
  return textureSample(atlas, mySampler, vec2(u,v), textureLayer); 
}
