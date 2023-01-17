/** Linear wave shader. */

@fragment
fn main(
  @location(0)  position:    vec3<f32>,
  @location(1)  uv:          vec2<f32>,
  @location(2)  uvColour:    vec3<f32>,
  @location(3)  uvNormal:    vec3<f32>,
  @location(4)  uvSpecular:  vec3<f32>,
  @location(5)  texColour:   vec4<f32>,
  @location(6)  texNormal:   vec4<f32>,
  @location(7)  texSpecular: vec4<f32>,
  @location(8)  normal:      vec3<f32>,
  @location(9)  tangent:     vec3<f32>,
  @location(10) bitangent:   vec3<f32>,
) -> @location(0) vec4<f32> {


  return vec4(1, 0, uv.y, 1);
}


