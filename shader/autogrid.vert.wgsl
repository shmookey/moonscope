struct VertexOutput {
  @builtin(position) Position: vec4<f32>,  // position in screen space
  @location(0)       worldPos: vec3<f32>,  // position in world space
  @location(1)       uv:       vec2<f32>,  // position in texture
  @location(2)       uvColour: vec3<f32>,  // colour texel: x, y, layer (atlas coordinates)
  @location(3)       uvNormal: vec3<f32>,  // normal texel: x, y, layer (atlas coordinates)
  @location(4)       texColour: vec4<f32>, // position and size of colour texture
  @location(5)       texNormal: vec4<f32>, // position and size of normal texture
  @location(6)       normal:    vec3<f32>, // normal vector
  @location(7)       tangent:   vec3<f32>, // tangent vector
  @location(8)       bitangent: vec3<f32>, // bitangent vector
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
  @location(2) normal:        vec3<f32>,
  @location(3) tangent:       vec3<f32>,
  @location(4) bitangent:     vec3<f32>,
  @location(5) textures:      vec4<u32>,
  @location(6) instanceSlot:  u32,
) -> VertexOutput {
  var output: VertexOutput;
  let model     = instanceData.data[instanceSlot].model;
  let texColour = atlasData.data[textures.x];
  let texNormal = atlasData.data[textures.y];

  output.Position    = uniforms.projection  * model * position;
  output.worldPos    = (model * position).xyz;
  output.uv          = uv;
  output.uvColour    = vec3(uv * texColour.size + texColour.position, f32(texColour.layer));
  output.uvNormal    = vec3(uv * texNormal.size + texNormal.position, f32(texNormal.layer));
  output.texColour   = vec4(texColour.position, texColour.size);
  output.texNormal   = vec4(texNormal.position, texNormal.size);
  output.normal      = normal;
  output.tangent     = tangent;
  output.bitangent   = bitangent;
  
  return output;
}
