/** Entity fragment shader for Blinn-Phong lighting. 
 *
 * Uses three textures: colour, normal and specular. All three are expected to
 * be the same size.
 */

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

struct AtlasRecord {
  position: vec2<f32>,
  size:     vec2<f32>,
  layer:    u32,
}

struct AtlasData {
  data: array<AtlasRecord>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<uniform> lighting:     Lighting;
@group(0) @binding(3) var<storage> atlasData:    AtlasData;
@group(0) @binding(4) var          mySampler:    sampler;
@group(0) @binding(5) var          atlas:        texture_2d_array<f32>;

//const viewDirection = vec3<f32>(  0.0,  0.0,  1.0);

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
    texelSpecular: f32) -> vec3<f32> {

  let mappedNormal = getMappedNormal(normal, texelNormal, tangent, bitangent);
  var lightValue = vec3<f32>(0);
  for (var i:u32 = 0; i<lighting.count; i = i+1) {
    let light     = lighting.data[i];
    let path      = light.position.xyz - position;
    let direction = normalize(path);
    let dist      = length(path);
    let level     = attenuate(dist, light.attenuation);
    if (light.type_ == 0) {
      let diffuseComponent  = getDiffuse(light, direction, mappedNormal);
      let specularComponent = getSpecular(light, direction, -position, mappedNormal, texelSpecular);
      lightValue += (diffuseComponent + specularComponent) * level;
    }
  }
  return lightValue;
}

@fragment
fn main(
  @location(0) position:   vec3<f32>,
  @location(1) uvColour:   vec3<f32>,
  @location(2) uvNormal:   vec3<f32>,
  @location(3) uvSpecular: vec3<f32>,
  @location(4) normal:     vec3<f32>,
  @location(5) tangent:    vec3<f32>,
  @location(6) bitangent:  vec3<f32>,
) -> @location(0) vec4<f32> {
  let texelColour   = textureSample(atlas, mySampler, uvColour.xy,   i32(uvColour.z));
  let texelNormal   = textureSample(atlas, mySampler, uvNormal.xy,   i32(uvNormal.z)).rgb * 2 - 1;
  let texelSpecular = 1 - textureSample(atlas, mySampler, uvSpecular.xy, i32(uvSpecular.z)).r;

  let light = getLighting(position, normal, tangent, bitangent, texelNormal, texelSpecular);
  return vec4(pow(texelColour.rgb * light, vec3(1/2.2)), texelColour.a); 
  //return vec4(texelColour.rgb * light, texelColour.a); 
  //return vec4(1 / lightDist.xxx, 1);
  //return vec4(1);
}

