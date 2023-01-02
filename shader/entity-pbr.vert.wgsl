struct VertexOutput {
  @builtin(position) Position: vec4<f32>, // position in screen space
  @location(0)       worldPos: vec3<f32>, // position in world space
  @location(1)       uvColour: vec3<f32>, // colour texel: x, y, layer (atlas coordinates)
  @location(2)       uvNormal: vec3<f32>, // normal texel: x, y, layer (atlas coordinates)
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  model:    mat4x4<f32>,
  reserved: vec4<f32>,
}

struct AtlasRecord {
  position: vec2<f32>,
  size:     vec2<f32>,
  layer:    i32,
}

struct InstanceData {
  data: array<InstanceProperties>,
}

struct AtlasData {
  data: array<AtlasRecord>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<storage> instanceData: InstanceData;
@group(0) @binding(2) var<storage> atlasData:    AtlasData;

@vertex
fn main(
  @location(0) position:      vec4<f32>,
  @location(1) uv:            vec2<f32>,
  @location(2) textureId:     f32,
  @location(3) normal:        vec3<f32>,
  @location(4) textureBounds: vec4<f32>,
  @location(5) instanceSlot:  u32,
) -> VertexOutput {
  var output: VertexOutput;
  let model     = instanceData.data[instanceSlot].model;
  let texColour = atlasData.data[u32(textureId)];
  let texNormal = atlasData.data[u32(normal.x)];

  output.Position    = uniforms.projection  * uniforms.view * model * position;
  output.worldPos    = (model * position).xyz;
  output.uvColour    = vec3(uv * texColour.size + texColour.position, f32(texColour.layer));
  output.uvNormal    = vec3(uv * texNormal.size + texNormal.position, f32(texNormal.layer));

  return output;
}
