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
  ambient:     vec4<f32>,  // Set alpha to 0 to disable ambient
  diffuse:     vec4<f32>,  // Set alpha to 0 to disable diffuse
  specular:    vec4<f32>,  // Set alpha to 0 to disable specular
  cone:        vec2<f32>,
}

struct Material {
  ambient:    vec4<f32>,   // Set alpha to 0 to disable ambient
  diffuse:    vec4<f32>,   // Set alpha to 0 to disable diffuse
  specular:   vec4<f32>,   // Set alpha to 0 to disable specular
  emissive:   vec4<f32>,   // Set alpha to 0 to disable emissive
  textures:   vec4<u32>,   // 0 = diffuse, 1 = normal, 2 = specular, 3 = emissive, set to 0 to disable
  shininess:  f32,         // Can be overridden by a specular texture
}

struct MaterialData {
  data: array<Material>,
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
@group(0) @binding(2) var<storage> lighting:     Lighting;
@group(1) @binding(0) var<storage> materialData: MaterialData;
@group(1) @binding(1) var<storage> atlasData:    AtlasData;
@group(1) @binding(2) var          mySampler:    sampler;
@group(1) @binding(3) var          atlas:        texture_2d_array<f32>;


fn attenuate(dist: f32, attenuation: vec4<f32>) -> f32 {
  return 1.0 / (attenuation.x + 
               (attenuation.y * dist) + 
               (attenuation.z * dist * dist));
}

@fragment
fn main(
  @location(0)                    position:      vec3<f32>,
  @location(1)                    uvDiffuse:     vec3<f32>,
  @location(2)                    uvNormal:      vec3<f32>,
  @location(3)                    uvSpecular:    vec3<f32>,
  @location(4)                    surfaceNormal: vec3<f32>,
  @location(5)                    tangent:       vec3<f32>,
  @location(6)                    bitangent:     vec3<f32>,
  @location(7) @interpolate(flat) materialSlot:  u32,
  @location(8)                    uv:            vec2<f32>,
) -> @location(0) vec4<f32> {

  // Geometry
  var normal  = normalize(surfaceNormal);
  let viewDir = normalize(-position);
 
  // Material properties
  let material   = materialData.data[materialSlot];
  var materialDiffuse = material.diffuse;
  var shininess = material.shininess;

  // Texture mappings
  let ddx = dpdx(uv);
  let ddy = dpdy(uv);
  if(uvDiffuse.z  >= 0) { 
    materialDiffuse = textureSampleGrad(atlas, mySampler, uvDiffuse.xy, i32(uvDiffuse.z), ddx, ddy); 
  }
  if(uvNormal.z >= 0) { 
    let textureNormal = textureSampleGrad(atlas, mySampler, uvNormal.xy,   i32(uvNormal.z), ddx, ddy).rgb * 2 - 1;
    let tbn = mat3x3<f32>(tangent, bitangent, normal);
    normal = normalize(tbn * textureNormal);
  }
  if(uvSpecular.z >= 0 && material.specular.a > 0) { 
    shininess = 1 - textureSampleGrad(atlas, mySampler, uvSpecular.xy, i32(uvSpecular.z), ddx, ddy).r;
  }

  // Lighting
  var ambient  = vec3<f32>(0);
  var diffuse  = vec3<f32>(0);
  var specular = vec3<f32>(0);
  var emissive = material.emissive.rgb;
  for (var i:u32 = 0; i < lighting.count; i = i+1) {
    let light      = lighting.data[i];
    var lightLevel = 0.0;
    var lightDir   = vec3<f32>(0);
    if(light.type_ == 0) { // point light
      let path   = light.position.xyz - position;
      let dist   = length(path);
      lightDir   = normalize(path);
      lightLevel = attenuate(dist, light.attenuation);
    } else if(light.type_ == 1) { // directional light
      lightDir   = light.direction.xyz;
      lightLevel = 1;
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
      ambient += light.ambient.rgb * material.ambient.rgb * lightLevel;
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

