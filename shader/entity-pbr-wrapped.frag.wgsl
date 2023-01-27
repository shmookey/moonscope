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
  @location(0)                     position:      vec3<f32>,
  @location(1)                     uvPlusSize:    vec4<f32>,
  @location(2)                     texDiffNorm:   vec4<f32>,
  @location(3)                     texSpecEmit:   vec4<f32>,
  @location(4)  @interpolate(flat) texLayers:     vec4<i32>,
  @location(5)                     surfaceNormal: vec3<f32>,
  @location(6)                     tangent:       vec3<f32>,
  @location(7)                     bitangent:     vec3<f32>,
  @location(8)                     precalcLightLevel:    vec4<f32>,
  @location(9)                     precalcLightDir:      vec3<f32>,
  @location(10) @interpolate(flat) materialSlot:  u32,
) -> @location(0) vec4<f32> {

  // Geometry
  var normal  = normalize(surfaceNormal);
  let viewDir = normalize(-position);
 
  // Material properties
  let material        = materialData.data[materialSlot];
  var materialDiffuse = material.diffuse;
  var shininess       = material.shininess;

  // Texture mappings
  let uv         = uvPlusSize.xy;
  let texSize    = uvPlusSize.zw;
  let uvWrap     = texSize * vec2(modw(uv.x, 1), modw(uv.y, 1));
  let uvNoWrap   = uv*texSize;
  let ddx        = dpdx(uvNoWrap.xy);
  let ddy        = dpdy(uvNoWrap.xy);
  let uvDiffuse  = uvWrap + texDiffNorm.xy;
  let uvNormal   = uvWrap + texDiffNorm.zw;
  let uvSpecular = uvWrap + texSpecEmit.xy;
  let uvEmissive = uvWrap + texSpecEmit.zw;

  if(texLayers.x >= 0) { 
    materialDiffuse = textureSampleGrad(atlas, mySampler, uvDiffuse, texLayers.x, ddx, ddy);
  }
  if(texLayers.y >= 0) {
    let textureNormal = textureSampleGrad(atlas, mySampler, uvNormal, texLayers.y, ddx, ddy).rgb * 2 - 1;
    let tbn = mat3x3<f32>(tangent, bitangent, normal);
    normal = normalize(tbn * textureNormal);
  }
  if(texLayers.z >= 0 && material.specular.a > 0) {
    shininess = 1 - textureSampleGrad(atlas, mySampler, uvSpecular, texLayers.z, ddx, ddy).r; 
  }

  // Lighting
  var ambient  = vec3<f32>(0);
  var diffuse  = vec3<f32>(0);
  var specular = vec3<f32>(0);
  var emissive = material.emissive.rgb;
  let precalcLightCount: u32 = 1; // todo: support more
  for (var i:u32 = 0; i < lighting.count; i = i+1) {
    let light      = lighting.data[i];
    var lightLevel = 0.0;
    var lightDir   = vec3<f32>(0);
    if(i < precalcLightCount) {
      lightDir   = precalcLightDir;
      lightLevel = precalcLightLevel[i];
    } else {
      let path   = light.position.xyz - position;
      let dist   = length(path);
      lightDir   = normalize(path);
      lightLevel = attenuate(dist, light.attenuation);
    }
    
    if(material.ambient.a > 0 && light.ambient.a > 0) {
      ambient += light.ambient.rgb * material.ambient.rgb * materialDiffuse.rgb * lightLevel;
    }
    if(material.diffuse.a > 0 && materialDiffuse.a > 0 && light.diffuse.a > 0) {
      let diff = max(dot(lightDir, normal), 0);
      diffuse += light.diffuse.rgb * materialDiffuse.rgb * diff * lightLevel;
    }
    if(material.specular.a > 0 && light.specular.a > 0 && shininess > 0) {
      let halfway = normalize(lightDir + viewDir);
      let spec = pow(max(dot(normal, halfway), 0), shininess);
      specular += light.specular.rgb * material.specular.rgb * spec * lightLevel;
    }
  }

  let colour = ambient + diffuse + specular + emissive;
  var alpha: f32 = max(materialDiffuse.a, material.emissive.a);
  return vec4(pow(colour, vec3(1/2.2)), alpha);
}

