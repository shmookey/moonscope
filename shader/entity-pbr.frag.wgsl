/** Physically-based rendering for entities. */


struct InstanceProperties {
  model:    mat4x4<f32>,
  reserved: vec4<f32>,
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

@group(0) @binding(1) var<storage> instanceData: InstanceData;
@group(0) @binding(2) var<storage> atlasData:    AtlasData;
@group(0) @binding(3) var          mySampler:    sampler;
@group(0) @binding(4) var          atlas:        texture_2d_array<f32>;

const lightPos    = vec3<f32>(-20.0, 25.0, 5.0);
const lightColour = vec3<f32>(  1.0,  1.0, 1.0);

@fragment
fn main(
  @location(0) worldPos: vec3<f32>,
  @location(1) uvColour: vec3<f32>,
  @location(2) uvNormal: vec3<f32>,
) -> @location(0) vec4<f32> {
  let texColour = textureSample(atlas, mySampler, uvColour.xy, i32(uvColour.z));
  let texNormal = textureSample(atlas, mySampler, uvNormal.xy, i32(uvNormal.z));

  let lightDir     = normalize(lightPos - worldPos);
  let lightDiffuse = max(dot(lightDir, texNormal.xyz), 0.0);

  return vec4(texColour.rgb * lightDiffuse, texColour.a); 
}

