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

const fadeFactor: f32 = 35;
const lineWeight: f32 = 2.0;

fn findIntensity(r: f32, zoom: i32, ddx: f32, ddy: f32) -> f32 {
  let freq = pow(f32(5), f32(zoom));
  let unit = max(abs(ddx), abs(ddy));

  // Antialiased line
  let delta = abs(r % (1/freq) - 0.5/freq);
  let clipped = 1 - smoothstep(unit, lineWeight*unit, delta);

  // Zoom level intensity
  let period = 1/freq;
  let intensity = period / (fadeFactor * unit);

  return intensity * clipped;
}

@fragment
fn main(
  @location(0)  @interpolate(perspective)                         uv:           vec2<f32>,
  @location(1) @interpolate(perspective) normal:       vec3<f32>,
  @location(2)                           worldPos:     vec3<f32>,
  @location(3) @interpolate(flat)        textureLayer: i32,
  @location(4) @interpolate(flat)        instanceSlot: u32,
  @location(5) @interpolate(flat)        texBounds:    vec4<f32>,
) -> @location(0) vec4<f32> {
  let dUVdx = dpdx(uv);
  let dUVdy = dpdy(uv);

  var r = 0.0;
  var g = 0.0;
  for(var i: i32 = -2; i < 8; i++) {
    r += 0.25 * findIntensity(uv.x, i, dUVdx.x, dUVdy.x);
    g += 0.25 * findIntensity(uv.y, i, dUVdx.y, dUVdy.y);
  }
  var lvl = (r + g) / 2;

  var texColour = vec4(lvl, lvl, lvl, 0.9);
  
  return texColour;

}
