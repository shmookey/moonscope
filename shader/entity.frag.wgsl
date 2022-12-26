struct InstanceProperties {
  model: mat4x4<f32>,
  reserved: vec4<f32>,
}

struct Storage {
  data: array<InstanceProperties>,
}

@group(0) @binding(1) var<storage> store: Storage;
@group(0) @binding(2) var mySampler: sampler;
@group(0) @binding(3) var atlas: texture_2d_array<f32>;

@fragment
fn main(
  @location(0)                    uv:           vec2<f32>,
  @location(1)  @interpolate(perspective)                  normal:       vec3<f32>,
  @location(2)                    worldPos:     vec3<f32>,
  @location(3) @interpolate(flat) textureLayer: i32,
  @location(4) @interpolate(flat) instanceSlot: u32,
  @location(5) @interpolate(flat) texBounds: vec4<f32>,
) -> @location(0) vec4<f32> {
  let lightPos = vec3<f32>(-20.0, 25.0, 5.0);
  let lightDir = normalize(lightPos - worldPos);
  let lightColour = vec3<f32>(1.0, 1.0, 1.0);
  let lightDiffuse = max(dot(lightDir, normal), 0.0);
  let texWidth  = texBounds.z - texBounds.x;
  let texHeight = texBounds.w - texBounds.y;
  let uv2 = vec2(uv.x * texWidth + texBounds.x, uv.y * texHeight + texBounds.y);
  let ru = dpdx(uv2);
  let rv = dpdy(uv2);

  let u = fract(uv.x) * texWidth + texBounds.x;
  let v = fract(uv.y) * texHeight + texBounds.y;
  let texColour = textureSampleGrad(atlas, mySampler, vec2(u,v), textureLayer, ru, rv);
  return texColour;
  //return vec4(texColour.rgb * lightDiffuse, texColour.a); 
  //let newColour = vec4(colour.rgb, colour.a * r);
  //return newColour;
}
