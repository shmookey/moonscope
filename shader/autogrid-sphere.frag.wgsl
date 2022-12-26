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

const pi = 3.1415926535897932384626433832795;
const zoomBias = 2;
const fadeFactor: f32 = 35;
const lineWeight: f32 = 2.0;

///** Select a zoom level. */
//fn chooseZoomLevel(lat: f32, lon: f32) -> f32 {
//  var dL = 1 / fwidthFine(lat);
//  var level = log(dL) / log(5);
//  return level - zoomBias;
//}
//
//fn findIntensity(x: f32, freq: f32, weight: f32) -> f32 {
//  let amp      = max(0, cos(x * freq));
//  let envelope = weight * freq / 100;
//  let clipped  = max(0, amp - (1-envelope)) * (1/envelope);
//  return clipped;
//}
//
//fn combineLevels(coarse: f32, medium: f32, high: f32, transition: f32) -> f32 {
//  return coarse
//       + medium * sqrt(1-transition)
//       + high * pow(transition,2);
//}


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
  @location(0)                    uv:           vec2<f32>,
  @location(1) @interpolate(perspective)                   normal:       vec3<f32>,
  @location(2)                    worldPos:     vec3<f32>,
  @location(3) @interpolate(flat) textureLayer: i32,
  @location(4) @interpolate(flat) instanceSlot: u32,
  @location(5) @interpolate(flat) texBounds: vec4<f32>,
) -> @location(0) vec4<f32> {
  let lat = abs(asin(normal.y));
  let lon = abs(atan2(normal.z, normal.x));
  let dLatdx = dpdx(lat);
  let dLatdy = dpdy(lat);
  let dLondx = dpdx(lon);
  let dLondy = dpdy(lon);

  var r = 0.0;
  var g = 0.0;
  for(var i: i32 = -2; i < 8; i++) {
    r += 0.25 * findIntensity(lat, i, dLatdx, dLatdy);
    g += 0.25 * findIntensity(lon, i, dLondx, dLondy);
  }
  var lvl = (r + g) / 2;

  var texColour = vec4(lvl, lvl, lvl/4, 0.99);
  
  return texColour;

}
