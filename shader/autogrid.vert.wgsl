struct VertexOutput {
  @builtin(position)              Position:     vec4<f32>,
  @location(0)  @interpolate(perspective)                  uv:           vec2<f32>,
  @location(1) @interpolate(perspective)                   normal:       vec3<f32>,
  @location(2)                    worldPos:     vec3<f32>,
  @location(3) @interpolate(flat) textureLayer: i32,
  @location(4) @interpolate(flat) instanceSlot: u32,
  @location(5) @interpolate(flat) textureBounds: vec4<f32>,
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  model: mat4x4<f32>,
  reserved: vec4<f32>,
}

struct Storage {
  data: array<InstanceProperties>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage> store: Storage;

@vertex
fn main(
  @location(0) position: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) textureLayer: f32,
  @location(3) normal: vec3<f32>,
  @location(4) textureBounds: vec4<f32>,
  @location(5) instanceSlot: u32,
) -> VertexOutput {
  var model = store.data[instanceSlot].model;
  var output: VertexOutput;
  output.Position = uniforms.projection 
                  * uniforms.view
                  * model
                  * position;
  output.worldPos = (model * position).xyz;
  output.uv = uv;
  output.normal = normal;
  output.textureLayer = i32(textureLayer);
  output.instanceSlot = instanceSlot;
  output.textureBounds = textureBounds;
  return output;
}
