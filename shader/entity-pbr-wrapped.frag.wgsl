/** Physically-based rendering for entities. */

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
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
@group(0) @binding(1) var<storage> instanceData: InstanceData;
@group(0) @binding(2) var<storage> atlasData:    AtlasData;
@group(0) @binding(3) var          mySampler:    sampler;
@group(0) @binding(4) var          atlas:        texture_2d_array<f32>;

const lightPos    = vec3<f32>(  0.0,  10.0, -10.0);
const lightColour = vec3<f32>(  1.0,  1.0, 1.0);


@fragment
fn main(
  @location(0) worldPos:  vec3<f32>,
  @location(1) uv:        vec2<f32>,
  @location(2) uvColour:  vec3<f32>,
  @location(3) uvNormal:  vec3<f32>,
  @location(4) texColour: vec4<f32>,
  @location(5) texNormal: vec4<f32>,
  @location(6) normal:    vec3<f32>,
  @location(7) tangent:   vec3<f32>,
  @location(8) bitangent: vec3<f32>,
) -> @location(0) vec4<f32> {
  let uvColourWrapped = fract(uv)*texColour.zw + texColour.xy;
  let uvNormalWrapped = fract(uv)*texNormal.zw + texNormal.xy;
  let texelColour = textureSampleGrad(atlas, mySampler, uvColourWrapped, i32(uvColour.z), dpdx(uvColour.xy), dpdy(uvColour.xy));
  let texelNormal = 2 * textureSampleGrad(atlas, mySampler, uvNormalWrapped, i32(uvNormal.z), dpdx(uvNormal.xy), dpdy(uvNormal.xy)).rgb - 1;

  let camSpaceLightPos = (uniforms.view * vec4(lightPos, 1.0)).xyz;
  let tbn          = mat3x3<f32>(tangent, bitangent, normal);
  let mappedNormal = normalize(tbn * texelNormal);
  let lightDir     = normalize(camSpaceLightPos - worldPos);
  let lightDist    = min(1, 20 / distance(camSpaceLightPos, worldPos));
  let lightDiffuse = max(dot(lightDir, mappedNormal), 0.0);
  return vec4(texelColour.rgb * lightDiffuse * lightDist, texelColour.a); 
}

