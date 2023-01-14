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
  model:    mat4x4<f32>,
  reserved: vec4<f32>,
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
@group(0) @binding(2) var<storage> instanceData: InstanceData;
@group(0) @binding(3) var<storage> atlasData:    AtlasData;
@group(0) @binding(4) var          mySampler:    sampler;
@group(0) @binding(5) var          atlas:        texture_2d_array<f32>;

//const lightPos    = vec3<f32>(  3.0,  10.0, -3.0);
const viewDirection = vec3<f32>(  0.0,  0.0,  1.0);


fn attenuate(distance: f32, attenuation: vec4<f32>) -> f32 {
  return 1.0 / (attenuation.x + 
               (attenuation.y * distance) + 
               (attenuation.z * distance * distance));
}

fn getDiffuse(light: Light, direction: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let diffuse  = max(dot(direction, normal), 0.0);
  return light.diffuse.rgb * diffuse;
}

fn getSpecular(light: Light, direction: vec3<f32>, normal: vec3<f32>, shininess: f32) -> vec3<f32> {
  let halfway   = normalize(direction + viewDirection);
  let specular = pow(max(dot(normal, halfway), 0), 32);
  return light.specular.rgb * specular * shininess;
}

fn getMappedNormal(modelNormal: vec3<f32>, texelNormal: vec3<f32>, tangent: vec3<f32>, bitangent: vec3<f32>) -> vec3<f32> {
  let tbn = mat3x3<f32>(tangent, bitangent, modelNormal);
  return normalize(tbn * texelNormal);
}

fn getLighting(position: vec3<f32>, normal: vec3<f32>, tangent: vec3<f32>, bitangent: vec3<f32>, texelNormal: vec3<f32>, texelSpecular: f32) -> vec3<f32> {
  let mappedNormal = getMappedNormal(normal, texelNormal, tangent, bitangent);
  var lightValue = vec3<f32>(0.0, 0.0, 0.0);
  for (var i = 0u; i < lighting.count; i = i + 1u) {
    let light = lighting.data[i];
    let direction = normalize(light.position.xyz - position);
    let distance = distance(light.position.xyz, position);
    let level = attenuate(distance, light.attenuation);
    if(level < 0.01) {
      continue;
    }
    if (light.type_ == 0) {
      let diffuseComponent  = getDiffuse(light, direction, mappedNormal);
      let specularComponent = getSpecular(light, direction, mappedNormal, texelSpecular);
      lightValue += (diffuseComponent + specularComponent) * level;
    }
  }
  return lightValue;
}



@fragment
fn main(
  @location(0)  position:    vec3<f32>,
  @location(1)  uv:          vec2<f32>,
  @location(2)  uvColour:    vec3<f32>,
  @location(3)  uvNormal:    vec3<f32>,
  @location(4)  uvSpecular:  vec3<f32>,
  @location(5)  texColour:   vec4<f32>,
  @location(6)  texNormal:   vec4<f32>,
  @location(7)  texSpecular: vec4<f32>,
  @location(8)  normal:      vec3<f32>,
  @location(9)  tangent:     vec3<f32>,
  @location(10) bitangent:   vec3<f32>,
) -> @location(0) vec4<f32> {
  let uvColourWrapped   = fract(uv)*texColour.zw + texColour.xy;
  let uvNormalWrapped   = fract(uv)*texNormal.zw + texNormal.xy;
  let uvSpecularWrapped = fract(uv)*texSpecular.zw + texSpecular.xy;

  let texelColour   = textureSampleGrad(atlas, mySampler, uvColourWrapped, i32(uvColour.z), dpdx(uvColour.xy), dpdy(uvColour.xy));
  let texelNormal   = 2 * textureSampleGrad(atlas, mySampler, uvNormalWrapped, i32(uvNormal.z), dpdx(uvNormal.xy), dpdy(uvNormal.xy)).rgb - 1;
  let texelSpecular = textureSampleGrad(atlas,  mySampler, uvSpecularWrapped, i32(uvSpecular.z), dpdx(uvSpecular.xy), dpdy(uvSpecular.xy)).r / 4;

  let light = getLighting(position, normal, tangent, bitangent, texelNormal, texelSpecular);
  return vec4(texelColour.rgb * light, texelColour.a); 
}

