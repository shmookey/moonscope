/** Linear wave shader. */

@fragment
fn main(
  @location(0)                    viewPos:      vec3<f32>,
  @location(1)                    uv:           vec2<f32>,
  @location(2) @interpolate(flat) instanceSlot: u32,
) -> @location(0) vec4<f32> {

  return vec4(1, 0, uv.y, 1);
}
