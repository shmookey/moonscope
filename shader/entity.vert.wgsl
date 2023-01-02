struct VertexOutput {
  @builtin(position)              Position:      vec4<f32>,
  @location(0)                    uv:            vec2<f32>,
  @location(1)                    normal:        vec3<f32>,
  @location(2)                    worldPos:      vec3<f32>,
  @location(3) @interpolate(flat) textureLayer:  i32,
  @location(4) @interpolate(flat) instanceSlot:  u32,
  @location(5) @interpolate(flat) textureBounds: vec4<f32>,
  @location(6)                    atlasUV:       vec2<f32>,
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
  @location(0) position: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) textureId: f32,
  @location(3) normal: vec3<f32>,
  @location(4) textureBounds: vec4<f32>,
  @location(5) instanceSlot: u32,
) -> VertexOutput {
  let model = instanceData.data[instanceSlot].model;
  var output: VertexOutput;
  output.Position = uniforms.projection 
                  * uniforms.view
                  * model
                  * position;
  output.worldPos = (model * position).xyz;
  output.normal = normal;
  output.instanceSlot = instanceSlot;

  let texId   = u32(textureId);
  let texInfo = atlasData.data[texId]; //  [0];
  let texUV   = vec2(uv.x * texInfo.size.x + texInfo.position.x,
                     uv.y * texInfo.size.y + texInfo.position.y);
  output.textureBounds.x = texInfo.position.x;
  output.textureBounds.y = texInfo.position.y;
  output.textureBounds.z = texInfo.size.x;
  output.textureBounds.w = texInfo.size.y;
  output.uv = uv;
  output.atlasUV = texUV;
  output.textureLayer = i32(texInfo.layer);

  return output;
}
