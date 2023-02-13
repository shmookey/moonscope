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
  data:  array<Light, 16>, 
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

struct ShadowData {
  data: array<mat4x4<f32>>,
}

@group(0) @binding(0) var<uniform> uniforms:      Uniforms;
@group(0) @binding(1) var<storage> instanceData:  InstanceData;
@group(0) @binding(2) var<storage> lighting:      Lighting;
@group(1) @binding(0) var<storage> materialData:  MaterialData;
@group(1) @binding(1) var<storage> atlasData:     AtlasData;
@group(1) @binding(2) var          mySampler:     sampler;
@group(1) @binding(3) var          atlas:         texture_2d_array<f32>;
@group(2) @binding(0) var          shadowAtlas:   texture_depth_2d_array;
@group(2) @binding(1) var          shadowSampler: sampler_comparison;
@group(2) @binding(2) var<storage> shadowData:    ShadowData;
override shadowDepthTextureSize: f32 = 1024.0;


fn attenuate(dist: f32, attenuation: vec4<f32>) -> f32 {
  return 1.0 / (attenuation.x + 
               (attenuation.y * dist) + 
               (attenuation.z * dist * dist));
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
  var material        = materialData.data[materialSlot];
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
  var visibility = 1.0;
  for (var i:u32 = 0; i < lighting.count; i = i+1) {
    let light      = lighting.data[i];
    var lightLevel = 0.0;
    var lightDir   = vec3<f32>(0);

    // Get shadows
    let shadowMatrix = shadowData.data[0];
    let shadowCoord  = shadowMatrix * vec4<f32>(position, 1);
    let shadowCoordN = shadowCoord.xyz / shadowCoord.w;
    let shadowCoordS = vec3(shadowCoordN.xy * vec2(0.5,-0.5) + 0.5, shadowCoordN.z);

   // var vis = 0.0;
    if(shadowCoordS.z < 1 && shadowCoordS.x > 0 && shadowCoordS.x < 1 && shadowCoordS.y > 0 && shadowCoordS.y < 1) {  
      var vis = 0.0;
      let oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;
      for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
          let offset = vec2<f32>(vec2(x, y)) * oneOverShadowDepthTextureSize;
          vis += textureSampleCompareLevel(
            shadowAtlas, shadowSampler,
            shadowCoordS.xy + offset, i, shadowCoordS.z - 0.002
          );
        }
      }
      vis /= 9.0;
      visibility = vis; //visibility - (1 - vis);
    }
    //let shadow       = textureSample(shadowAtlas, shadowSampler, shadowCoordS.xy, i);
    //var shadowFactor = visibility; //select(0.2, 1.0, shadow > (shadowCoordS.z-0.007));
    //if(shadowCoordS.z >= 1) {
    //  shadowFactor = 1;
    //}

    if(light.type_ == 0) { // point light
      let path   = light.position.xyz - position;
      let dist   = length(path);
      lightDir   = normalize(path);
      lightLevel = attenuate(dist, light.attenuation);
    } else if(light.type_ == 1) { // directional light
      lightDir   = -light.direction.xyz;
      lightLevel = 1.0;
    } else if(light.type_ == 2) { // spot light
      let path      = light.position.xyz - position;
      let dir       = normalize(path);
      let theta     = dot(dir, -light.direction.xyz);
      let phi       = light.cone.x;
      let gamma     = light.cone.y;
      let epsilon   = phi - gamma;
      let intensity = clamp((theta - gamma) / epsilon, 0, 1);
      let dist      = length(path);
      lightDir      = dir;
      lightLevel    = intensity * attenuate(dist, light.attenuation);
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

  let colour = ambient + (diffuse + specular) * visibility + emissive;
  var alpha: f32 = max(materialDiffuse.a, material.emissive.a);
  return vec4(pow(colour, vec3(1/2.2)), alpha);
}

