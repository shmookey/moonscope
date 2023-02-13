/** Create an image from a depth texture. */

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0)       uv:       vec2<f32>,
  @location(1)       @interpolate(flat) layer:    u32,
  @location(2)       depthMin: f32,
  @location(3)       depthMax: f32,
}

struct Uniforms {
  layer:    u32,
  depthMin: f32,
  depthMax: f32,
}

@group(0) @binding(0) var<uniform> uniforms:      Uniforms;
@group(0) @binding(1) var          shadowAtlas:   texture_depth_2d_array;
@group(0) @binding(2) var          shadowSampler: sampler;

// Vertex positions for two triangles forming a quad over the entire screen.
const vertex_positions = array<vec4<f32>, 6>(
  vec4<f32>(-1.0, -1.0, 0.0, 1.0),
  vec4<f32>( 1.0, -1.0, 0.0, 1.0),
  vec4<f32>(-1.0,  1.0, 0.0, 1.0),
  vec4<f32>( 1.0, -1.0, 0.0, 1.0),
  vec4<f32>( 1.0,  1.0, 0.0, 1.0),
  vec4<f32>(-1.0,  1.0, 0.0, 1.0),
);
const vertex_uvs = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 0.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(1.0, 1.0),
  vec2<f32>(0.0, 1.0),
);


@vertex
fn vertex_main(
  @builtin(vertex_index) vertexIndex: u32,
) -> VertexOutput {
  var vertexOutput: VertexOutput;
  vertexOutput.position = vertex_positions[vertexIndex];
  vertexOutput.uv       = vertex_uvs[vertexIndex];
  vertexOutput.layer    = uniforms.layer;
  vertexOutput.depthMin = uniforms.depthMin;
  vertexOutput.depthMax = uniforms.depthMax;
  return vertexOutput;
}

@fragment
fn fragment_main(
  @location(0) uv:       vec2<f32>,
  @location(1) @interpolate(flat) layer:    u32,
  @location(2) depthMin: f32,
  @location(3) depthMax: f32,
) -> @location(0) vec4<f32> {
  var depth = textureSample(shadowAtlas, shadowSampler, uv, layer);
  depth = clamp(depth, depthMin, depthMax);
  depth = (depth - depthMin) / (depthMax - depthMin);
  depth = pow(depth, 4);
  return vec4<f32>(depth, depth, depth, 1.0);
}
