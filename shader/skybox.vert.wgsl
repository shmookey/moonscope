struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) direction: vec3<f32>
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn extractRotation(m: mat4x4<f32>) -> mat4x4<f32> {
  var c0 = m[0];
  var c1 = m[1];
  var c2 = m[2];
  var sx = length(c0);
  var sy = length(c1);
  var sz = length(c2);
  var output = mat4x4<f32>(
    c0 / sx,
    c1 / sy,
    c2 / sz,
    vec4<f32>(0.0, 0.0, 0.0, 1.0)
  );
  return output;
}

@vertex
fn main(
  @location(0) position: vec3<f32>,
//  @location(1) uv: vec2<f32>
) -> VertexOutput {
  var rotation = extractRotation(uniforms.view);
  var output : VertexOutput;
  output.Position = uniforms.projection * rotation * vec4(position, 1.0);
  output.direction = position.xyz;
  return output;
}
