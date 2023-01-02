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

@fragment
fn main(
  @location(0)                    uv:           vec2<f32>,
  @location(1)                    normal:       vec3<f32>,
  @location(2)                    worldPos:     vec3<f32>,
  @location(3) @interpolate(flat) textureLayer: i32,
  @location(4) @interpolate(flat) instanceSlot: u32,
  @location(5) @interpolate(flat) texBounds:    vec4<f32>,
  @location(6)                    atlasUV:      vec2<f32>,
) -> @location(0) vec4<f32> {
  let lightPos = vec3<f32>(-20.0, 25.0, 5.0);
  let lightDir = normalize(lightPos - worldPos);
  let lightColour = vec3<f32>(1.0, 1.0, 1.0);
  let lightDiffuse = max(dot(lightDir, normal), 0.0);

  let wrappedUV = fract(uv)*texBounds.zw + texBounds.xy;
  let texColour = textureSampleGrad(atlas, mySampler, wrappedUV, textureLayer, dpdx(atlasUV), dpdy(atlasUV));
  return vec4(texColour.rgb,0.5);
  //return vec4(texColour.rgb * lightDiffuse, texColour.a); 
  //let newColour = vec4(colour.rgb, colour.a * r);
  //return newColour;
}
