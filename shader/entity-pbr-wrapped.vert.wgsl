struct VertexOutput {
  @builtin(position)               Position:     vec4<f32>,  // position in screen space
  @location(0)                     viewPos:      vec3<f32>,  // position in view space
  @location(1)                     uv:           vec2<f32>,  // position in texture
  @location(2)  @interpolate(flat) texLayers:    vec3<i32>,  // texture layers (colour, normal, specular)
  @location(3)                     texColour:    vec4<f32>,  // position and size of colour texture
  @location(4)                     texNormal:    vec4<f32>,  // position and size of normal texture
  @location(5)                     texSpecular:  vec4<f32>,  // position and size of specular texture
  @location(6)                     normal:       vec3<f32>,  // normal vector
  @location(7)                     tangent:      vec3<f32>,  // tangent vector
  @location(8)                     bitangent:    vec3<f32>,  // bitangent vector
  @location(9)                     lightLevel:   vec4<f32>,  // attenuation for first 4 lights
  @location(10)                    lightDir:     vec3<f32>,  // direction to first light
  @location(11) @interpolate(flat) materialSlot: u32,        // material slot
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  modelView:    mat4x4<f32>,
  materialSlot: u32,
}

struct Material {
  ambient:    vec4<f32>,
  diffuse:    vec4<f32>,
  specular:   vec4<f32>,
  emissive:   vec4<f32>,
  textures:   vec4<u32>,
  shininess:  f32,
}

struct MaterialData {
  data: array<Material>,
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

struct Light {
  type_:       u32, // TODO: hope webgpu lets us use keywords as identifiers soon...  
  position:    vec4<f32>,
  direction:   vec4<f32>,
  attenuation: vec4<f32>,
  ambient:     vec4<f32>,
  diffuse:     vec4<f32>,
  specular:    vec4<f32>,
  cone:        vec2<f32>,
}

struct Lighting {
  count: u32,
  data:  array<Light, 16>, // TODO: hope webgpu lets us use override values for this soon...
}


@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<uniform> lighting:     Lighting;
@group(0) @binding(2) var<storage> materialData: MaterialData;
@group(0) @binding(3) var<storage> instanceData: InstanceData;
@group(0) @binding(4) var<storage> atlasData:    AtlasData;

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

fn attenuate(dist: f32, attenuation: vec4<f32>) -> f32 {
  return 1.0 / (attenuation.x + 
               (attenuation.y * dist) + 
               (attenuation.z * dist * dist));
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
  let instance       = instanceData.data[instanceSlot];

  // Positioning
  let modelView       = instance.modelView;
  let viewRotation    = extractRotation(modelView);
  let camSpacePos     = modelView * position;
  output.Position     = uniforms.projection  * camSpacePos;
  output.viewPos      = camSpacePos.xyz;
  output.materialSlot = instance.materialSlot;

  // Texture coordinates
  let material = materialData.data[instance.materialSlot];
  output.uv    = uv;
  if(material.textures[0] != 0) { 
    let texColour      = atlasData.data[material.textures[0]]; 
    output.texColour   = vec4(texColour.position, texColour.size);
    output.texLayers.x = texColour.layer;
  } else {
    output.texLayers.x = -1;
  }
  if(material.textures[1] != 0) { 
    let texNormal      = atlasData.data[material.textures[1]];
    output.texNormal   = vec4(texNormal.position, texNormal.size);
    output.texLayers.y = texNormal.layer;
  } else {
    output.texLayers.y = -1;
  }
  if(material.textures[2] != 0) {
    let texSpecular    = atlasData.data[material.textures[2]];
    output.texSpecular = vec4(texSpecular.position, texSpecular.size);
    output.texLayers.z = texSpecular.layer;
  } else {
    output.texLayers.z = -1;
  }

  // Lighting
  let precalculatedLightCount = min(lighting.count, 4);
  output.normal      = (viewRotation * vec4(normalize(normal),    1.0)).xyz;
  output.tangent     = (viewRotation * vec4(normalize(tangent),   1.0)).xyz;
  output.bitangent   = (viewRotation * vec4(normalize(bitangent), 1.0)).xyz; 
  output.lightLevel  = vec4<f32>(0);
  for(var i:u32 = 0; i<precalculatedLightCount; i = i + 1) {
    let light = lighting.data[i];
    let path  = light.position.xyz - camSpacePos.xyz;
    let dist  = length(path);
    let level = attenuate(dist, light.attenuation);
    output.lightLevel[i] = level;
    output.lightDir      = normalize(path);
  }
  
  return output;
}
