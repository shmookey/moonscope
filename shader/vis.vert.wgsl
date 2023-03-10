struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV: vec2<f32>,
  @location(1) amplitude: f32
}

@vertex
fn main(
  @location(0) position: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) freq: f32,
  @location(3) amplitude: f32,
  @location(4) rotation: f32,
  @location(5) phase: f32
) -> VertexOutput {
  let matrix = mat3x3(
    freq *  cos(rotation), freq * sin(rotation), 0.0, 
    freq * -sin(rotation), freq * cos(rotation), 0.0,
    phase,                 0.0,                  1.0
  );
  let fragUV = matrix * vec3(uv, 1.0);
  var output: VertexOutput;
  output.Position = position;
  output.fragUV = fragUV.xy; 
  output.amplitude = amplitude;
  return output;
}
