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
    texelNormal:   vec3<f32>, 
    texelSpecular: f32,
    lightLevel:    vec4<f32>,
    lightDir:      vec3<f32>) -> vec3<f32> {

  let mappedNormal = getMappedNormal(normal, texelNormal, tangent, bitangent);
  var lightValue = vec3<f32>(0.0, 0.0, 0.0);
  let precalculatedLightCount = min(lighting.count, 1);
  for (var i = 0u; i < precalculatedLightCount; i = i + 1u) {
    let light = lighting.data[i];
    let direction = lightDir; //normalize(light.position.xyz - position);
    //let dist = lightDist[i];
    let level = lightLevel[i]; //attenuate(dist, light.attenuation);
    //if(level < 0.01) {
    //  continue;
    //}
    if (light.type_ == 0) {
      let diffuseComponent  = getDiffuse(light, direction, mappedNormal);
      let specularComponent = getSpecular(light, -position, direction, mappedNormal, texelSpecular);
      lightValue += (diffuseComponent + specularComponent) * level;
    }
  }
  //for (var i = 4u; i < lighting.count; i = i + 1u) {
  //  let light = lighting.data[i];
  //  let direction = normalize(light.position.xyz - position);
  //  let dist = distance(light.position.xyz, position);
  //  let level = attenuate(dist, light.attenuation);
  //  if(level < 0.01) {
  //    continue;
  //  }
  //  if (light.type_ == 0) {
  //    let diffuseComponent  = getDiffuse(light, direction, mappedNormal);
  //    //let specularComponent = getSpecular(light, direction, mappedNormal, texelSpecular);
  //    lightValue += (diffuseComponent /*+ specularComponent*/) * level;
  //  }
  //}
  return lightValue;
}

fn modw(a: f32, b: f32) -> f32 {
  return a - b * floor(a / b);
}


@fragment
fn main(
  @location(0)                     position:    vec3<f32>,
  @location(1)                     uv:          vec2<f32>,
  @location(2)  @interpolate(flat) texLayers:   vec3<i32>,
  @location(3)                     texColour:   vec4<f32>,
  @location(4)                     texNormal:   vec4<f32>,
  @location(5)                     texSpecular: vec4<f32>,
  @location(6)                     normal:      vec3<f32>,
  @location(7)                     tangent:     vec3<f32>,
  @location(8)                     bitangent:   vec3<f32>,
  @location(9)                     lightLevel:  vec4<f32>,
  @location(10)                    lightDir:    vec3<f32>,
) -> @location(0) vec4<f32> {
  let uvWrapped         = vec2(modw(uv.x, 1), modw(uv.y, 1));
  let uvColourWrapped   = uvWrapped*texColour.zw   + texColour.xy;
  let uvNormalWrapped   = uvWrapped*texNormal.zw   + texNormal.xy;
  let uvSpecularWrapped = uvWrapped*texSpecular.zw + texSpecular.xy;
  let uvBase            = uv*texColour.zw;
  let ddx               = dpdx(uvBase.xy);
  let ddy               = dpdy(uvBase.xy);

  let texelColour       = textureSampleGrad(atlas, mySampler, uvColourWrapped,   texLayers.x, ddx, ddy);
  let texelNormal       = textureSampleGrad(atlas, mySampler, uvNormalWrapped,   texLayers.y, ddx, ddy).rgb * 2 - 1;
  let texelSpecular     = 1 - textureSampleGrad(atlas, mySampler, uvSpecularWrapped, texLayers.z, ddx, ddy).r;

  let light             = getLighting(position, normal, tangent, bitangent, texelNormal, texelSpecular, lightLevel, lightDir);
  return vec4(pow(texelColour.rgb * light, vec3(1/2.2)), texelColour.a); 
  //return vec4(texelColour.rgb * light, texelColour.a); 
  //return vec4(1 / lightDist.xxx, 1);
  //return vec4(1);
}

