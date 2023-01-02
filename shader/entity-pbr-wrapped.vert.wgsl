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
  modelView: mat4x4<f32>,
  reserved:  vec4<f32>,
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
  @location(0) position:      vec4<f32>,
  @location(1) uv:            vec2<f32>,
  @location(2) normal:        vec3<f32>,
  @location(3) tangent:       vec3<f32>,
  @location(4) bitangent:     vec3<f32>,
  @location(5) textures:      vec4<u32>,
  @location(6) instanceSlot:  u32,
) -> VertexOutput {
  var output: VertexOutput;
  let modelView = instanceData.data[instanceSlot].modelView;
  let texColour = atlasData.data[textures.x];
  let texNormal = atlasData.data[textures.y];
  let viewRotation = extractRotation(modelView);
  //let model        = modelView * invert(uniforms.view);

  let camSpacePos    = modelView * position;
  output.Position    = uniforms.projection  * camSpacePos;
  output.worldPos    = camSpacePos.xyz;
  output.uv          = uv;
  output.uvColour    = vec3(uv * texColour.size + texColour.position, f32(texColour.layer));
  output.uvNormal    = vec3(uv * texNormal.size + texNormal.position, f32(texNormal.layer));
  output.texColour   = vec4(texColour.position, texColour.size);
  output.texNormal   = vec4(texNormal.position, texNormal.size);
  output.normal      = (viewRotation * vec4(normalize(normal),    1.0)).xyz;
  output.tangent     = (viewRotation * vec4(normalize(tangent),   1.0)).xyz;
  output.bitangent   = (viewRotation * vec4(normalize(bitangent), 1.0)).xyz; 
  
  return output;
}
