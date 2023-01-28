struct VertexOutput {
  @builtin(position)               Position:      vec4<f32>,  // position in screen space
  @location(0)                     viewPos:       vec3<f32>,  // position in view space
  @location(1)                     uvPlusSize:    vec4<f32>,  // uv + size of textures
  @location(2)                     texDiffNorm:   vec4<f32>,  // location of diffuse and normal textures
  @location(3)                     texSpecEmit:   vec4<f32>,  // location of specular and emissive textures
  @location(4)  @interpolate(flat) texLayers:     vec4<i32>,  // texture layers (colour, normal, specular)
  @location(5)                     surfaceNormal: vec3<f32>,  // normal vector
  @location(6)                     tangent:       vec3<f32>,  // tangent vector
  @location(7)                     bitangent:     vec3<f32>,  // bitangent vector
  @location(8)                     lightLevel:    vec4<f32>,  // attenuation for first 4 lights
  @location(9)                     lightDir:      vec3<f32>,  // direction to first light
  @location(10) @interpolate(flat) materialSlot:  u32,        // material slot
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
@group(0) @binding(1) var<storage> lighting:     Lighting;
@group(0) @binding(2) var<storage> materialData: MaterialData;
@group(0) @binding(3) var<storage> instanceData: InstanceData;
@group(0) @binding(4) var<storage> atlasData:    AtlasData;

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
  var instance       = instanceData.data[instanceSlot];

  // Positioning
  let modelView       = instance.modelView;
  let camSpacePos     = modelView * position;
  output.Position     = uniforms.projection  * camSpacePos;
  output.viewPos      = camSpacePos.xyz;
  output.materialSlot = instance.materialSlot;

  // Texture coordinates
  let material        = materialData.data[instance.materialSlot];
  output.uvPlusSize.x = uv.x;
  output.uvPlusSize.y = uv.y;
  output.texLayers    = vec4(-1);
  if(material.textures[0] != 0) { 
    let texDiffuse        = atlasData.data[material.textures[0]]; 
    output.texDiffNorm.x  = texDiffuse.position.x;
    output.texDiffNorm.y  = texDiffuse.position.y;
    output.texLayers.x    = texDiffuse.layer;
    output.uvPlusSize.z   = texDiffuse.size.x;
    output.uvPlusSize.w   = texDiffuse.size.y;
  }
  if(material.textures[1] != 0) { 
    let texNormal         = atlasData.data[material.textures[1]];
    output.texDiffNorm.z  = texNormal.position.x;
    output.texDiffNorm.w  = texNormal.position.y;
    output.texLayers.y    = texNormal.layer;
    output.uvPlusSize.z   = texNormal.size.x;
    output.uvPlusSize.w   = texNormal.size.y;
  }
  if(material.textures[2] != 0) {
    let texSpecular       = atlasData.data[material.textures[2]];
    output.texSpecEmit.x  = texSpecular.position.x;
    output.texSpecEmit.y  = texSpecular.position.y;
    output.texLayers.z    = texSpecular.layer;
    output.uvPlusSize.z   = texSpecular.size.x;
    output.uvPlusSize.w   = texSpecular.size.y;
  }
  if(material.textures[3] != 0) {
    let texEmissive       = atlasData.data[material.textures[3]];
    output.texSpecEmit.z  = texEmissive.position.x;
    output.texSpecEmit.w  = texEmissive.position.y;
    output.texLayers.w    = texEmissive.layer;
    output.uvPlusSize.z   = texEmissive.size.x;
    output.uvPlusSize.w   = texEmissive.size.y;
  }

  // Lighting
  let precalcLightCount = min(lighting.count, 1);
  output.surfaceNormal  = (modelView * vec4(normal,    0)).xyz;
  output.tangent        = (modelView * vec4(tangent,   0)).xyz;
  output.bitangent      = (modelView * vec4(bitangent, 0)).xyz; 
  output.lightLevel     = vec4<f32>(0);
  for(var i:u32 = 0; i<precalcLightCount; i = i + 1) {
    let light = lighting.data[i];
    let path  = light.position.xyz - camSpacePos.xyz;
    let dist  = length(path);
    let level = attenuate(dist, light.attenuation);
    output.lightLevel[i] = level;
    output.lightDir      = normalize(path);
  }
  
  return output;
}
