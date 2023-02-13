/** Basic depth pass shader. */

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  modelView:    mat4x4<f32>,
  materialSlot: u32,
}

struct InstanceData {
  data: array<InstanceProperties>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<storage> instanceData: InstanceData;

@vertex
fn vertex_main(
  @location(0) position:     vec4<f32>,
  @location(1) uv:           vec2<f32>,
  @location(2) normal:       vec3<f32>,
  @location(3) tangent:      vec3<f32>,
  @location(4) bitangent:    vec3<f32>,
  @location(5) textures:     vec4<u32>,
  @location(6) instanceSlot: u32,
) -> VertexOutput {
  var modelView = instanceData.data[instanceSlot].modelView;
  var vertexOutput: VertexOutput;
  vertexOutput.position = uniforms.projection * modelView * position;
  return vertexOutput;
}

@fragment
fn fragment_main() {
  return;
}

