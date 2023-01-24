/** Physically-based rendering for entities. */

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
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

struct InstanceProperties {
  model:      mat4x4<f32>,
  materialId: u32,
}

struct AtlasRecord {
  position: vec2<f32>,
  size:     vec2<f32>,
  layer:    u32,
}

struct InstanceData {
  data: array<InstanceProperties>,
}

struct AtlasData {
  data: array<AtlasRecord>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<uniform> lighting:     Lighting;
@group(0) @binding(2) var<storage> materialData: MaterialData;
@group(0) @binding(3) var<storage> instanceData: InstanceData;
@group(0) @binding(4) var<storage> atlasData:    AtlasData;
@group(0) @binding(5) var          mySampler:    sampler;
@group(0) @binding(6) var          atlas:        texture_2d_array<f32>;

fn attenuate(dist: f32, attenuation: vec4<f32>) -> f32 {
  return 1.0 / (attenuation.x + 
               (attenuation.y * dist) + 
               (attenuation.z * dist * dist));
}

fn getDiffuse(light: Light, direction: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let diffuse  = max(dot(direction, normal), 0.0);
  return light.diffuse.rgb * diffuse;
}

fn getSpecular(light: Light, direction: vec3<f32>, viewDirection: vec3<f32>, normal: vec3<f32>, shininess: f32) -> vec3<f32> {
  let halfway   = normalize(direction + viewDirection);
  let specular = pow(max(dot(normal, halfway), 0), 32);
  return light.specular.rgb * specular * shininess;
}

fn getMappedNormal(modelNormal: vec3<f32>, texelNormal: vec3<f32>, tangent: vec3<f32>, bitangent: vec3<f32>) -> vec3<f32> {
  let tbn = mat3x3<f32>(tangent, bitangent, modelNormal);
  return normalize(tbn * texelNormal);
}

fn getLighting(
    position:      vec3<f32>, 
    normal:        vec3<f32>, 
    tangent:       vec3<f32>, 
    bitangent:     vec3<f32>, 
    texelNormal:   vec4<f32>, 
    texelSpecular: vec2<f32>,
    lightLevel:    vec4<f32>,
    lightDir:      vec3<f32>,
    materialSlot:  u32) -> vec3<f32> {

  var lightValue = vec3<f32>(0);
  let precalculatedLightCount: u32 = 1; // todo: support more
  let material = materialData.data[materialSlot];
  for (var i = 0u; i < precalculatedLightCount; i = i + 1u) {
    let light = lighting.data[i];
    let direction = lightDir;
    let level = lightLevel[i]; 
    if(level < 0.001) {
      continue;
    }
    if (light.type_ == 0) {
      if(texelNormal.a > 0) {
        let mappedNormal = getMappedNormal(normal, texelNormal.xyz, tangent, bitangent);
        let diffuseComponent  = getDiffuse(light, direction, mappedNormal);
        lightValue += diffuseComponent * level;
        if(texelSpecular.g > 0) {
          let specularComponent = getSpecular(light, -position, direction, mappedNormal, texelSpecular.r);
          lightValue += specularComponent * level;
        }
      }
    }
  }

  return material.ambient.xyz + lightValue;
}

fn modw(a: f32, b: f32) -> f32 {
  return a - b * floor(a / b);
}


@fragment
fn main(
  @location(0)                     position:     vec3<f32>,
  @location(1)                     uv:           vec2<f32>,
  @location(2)  @interpolate(flat) texLayers:    vec3<i32>,
  @location(3)                     texColour:    vec4<f32>,
  @location(4)                     texNormal:    vec4<f32>,
  @location(5)                     texSpecular:  vec4<f32>,
  @location(6)                     normal:       vec3<f32>,
  @location(7)                     tangent:      vec3<f32>,
  @location(8)                     bitangent:    vec3<f32>,
  @location(9)                     lightLevel:   vec4<f32>,
  @location(10)                    lightDir:     vec3<f32>,
  @location(11) @interpolate(flat) materialSlot: u32,
) -> @location(0) vec4<f32> {
  let uvWrapped         = vec2(modw(uv.x, 1), modw(uv.y, 1));
  let uvColourWrapped   = uvWrapped*texColour.zw   + texColour.xy;
  let uvNormalWrapped   = uvWrapped*texNormal.zw   + texNormal.xy;
  let uvSpecularWrapped = uvWrapped*texSpecular.zw + texSpecular.xy;
  let uvBase            = uv*texColour.zw;
  let ddx               = dpdx(uvBase.xy);
  let ddy               = dpdy(uvBase.xy);

  var texelColour   = vec4<f32>(0);
  var texelNormal   = vec4<f32>(0);
  var texelSpecular = vec2<f32>(0);
  if(texLayers.x >= 0) { texelColour   = textureSampleGrad(atlas, mySampler, uvColourWrapped,   texLayers.x, ddx, ddy);             }
  if(texLayers.y >= 0) { texelNormal   = vec4(textureSampleGrad(atlas, mySampler, uvNormalWrapped,   texLayers.y, ddx, ddy).rgb * 2 - 1, 1); }
  if(texLayers.z >= 0) { texelSpecular = vec2(1 - textureSampleGrad(atlas, mySampler, uvSpecularWrapped, texLayers.z, ddx, ddy).r, 1);       }

  let light = getLighting(position, normal, tangent, bitangent, texelNormal, texelSpecular, lightLevel, lightDir, materialSlot);
  return vec4(pow(texelColour.rgb * light, vec3(1/2.2)), texelColour.a); 
}

