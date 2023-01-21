/** Trivial vertex shader for entity geometry.
 *
 * Exports screen and view positions, UV coordinates and instance slot.
 */

struct VertexOutput {
  @builtin(position)              Position:     vec4<f32>, 
  @location(0)                    viewPos:      vec3<f32>,
  @location(1)                    uv:           vec2<f32>,
  @location(2) @interpolate(flat) instanceSlot: u32,
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  modelView: mat4x4<f32>,
  reserved:  vec4<f32>,
}

struct InstanceData {
  data: array<InstanceProperties>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(2) var<storage> instanceData: InstanceData;

@vertex
fn main(
  @location(0) position:      vec4<f32>,
  @location(1) uv:            vec2<f32>,
  @location(2) normal:        vec3<f32>,
  @location(3) tangent:       vec3<f32>,
  @location(4) bitangent:     vec3<f32>,
  @location(5) textures:      vec4<u32>,
  @location(6) instanceSlot:  u32,
) -> VertexOutput {
  var output: VertexOutput;
  let modelView       = instanceData.data[instanceSlot].modelView;
  let camSpacePos     = modelView * position;
  output.Position     = uniforms.projection  * camSpacePos;
  output.viewPos      = camSpacePos.xyz;
  output.uv           = uv;
  output.instanceSlot = instanceSlot;
  return output;
}
