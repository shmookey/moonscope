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
  @location(0) worldPos:  vec3<f32>,
  @location(1) uv:        vec2<f32>,
  @location(2) uvColour:  vec3<f32>,
  @location(3) uvNormal:  vec3<f32>,
  @location(4) texColour: vec4<f32>,
  @location(5) texNormal: vec4<f32>,
  @location(6) normal:    vec3<f32>,
  @location(7) tangent:   vec3<f32>,
  @location(8) bitangent: vec3<f32>,
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

  var gridColour = vec4(lvl, lvl, lvl/4, 0.99);
  
  return gridColour;

}
