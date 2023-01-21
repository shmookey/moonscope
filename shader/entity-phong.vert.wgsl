/** Entity vertex shader for Blinn-Phong lighting. 
 *
 * Uses three textures: colour, normal and specular. All three are expected to
 * be the same size.
 */

struct VertexOutput {
  @builtin(position) Position:   vec4<f32>, // position in screen space
  @location(0)       viewPos:    vec3<f32>, // position in view space
  @location(1)       uvColour:   vec3<f32>, // position and layer of colour texture
  @location(2)       uvNormal:   vec3<f32>, // position and layer of normal texture
  @location(3)       uvSpecular: vec3<f32>, // position and layer of specular texture
  @location(4)       normal:     vec3<f32>, // normal vector
  @location(5)       tangent:    vec3<f32>, // tangent vector
  @location(6)       bitangent:  vec3<f32>, // bitangent vector
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
@group(0) @binding(2) var<storage> instanceData: InstanceData;
@group(0) @binding(3) var<storage> atlasData:    AtlasData;

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
  @location(0) position:     vec4<f32>,
  @location(1) uv:           vec2<f32>,
  @location(2) normal:       vec3<f32>,
  @location(3) tangent:      vec3<f32>,
  @location(4) bitangent:    vec3<f32>,
  @location(5) textures:     vec4<u32>,
  @location(6) instanceSlot: u32,
) -> VertexOutput {
  var output: VertexOutput;

  // Positioning
  let modelView     = instanceData.data[instanceSlot].modelView;
  let viewRotation  = extractRotation(modelView);
  let camSpacePos   = modelView * position;
  output.Position   = uniforms.projection  * camSpacePos;
  output.viewPos    = camSpacePos.xyz;

  // Texture coordinates
  let texColour     = atlasData.data[textures.x];
  let texNormal     = atlasData.data[textures.y];
  let texSpecular   = atlasData.data[textures.z];
  output.uvColour   = vec3(uv * texColour.size   + texColour.position,   f32(texColour.layer));
  output.uvNormal   = vec3(uv * texNormal.size   + texNormal.position,   f32(texNormal.layer));
  output.uvSpecular = vec3(uv * texSpecular.size + texSpecular.position, f32(texSpecular.layer));

  // Lighting
  output.normal     = (viewRotation * vec4(normalize(normal),    1.0)).xyz;
  output.tangent    = (viewRotation * vec4(normalize(tangent),   1.0)).xyz;
  output.bitangent  = (viewRotation * vec4(normalize(bitangent), 1.0)).xyz; 
  
  return output;
}
