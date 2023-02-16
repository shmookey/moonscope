/** Sky shader. */

struct VertexOutput {
  @builtin(position)              Position:     vec4<f32>, 
  @location(0)                    viewPos:      vec3<f32>,
  @location(1)                    uv:           vec2<f32>,
  @location(2)                    localPos:     vec3<f32>,
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct InstanceProperties {
  modelView: mat4x4<f32>,
  reserved:  vec4<f32>,
}

struct InstanceData {
  data: array<InstanceProperties>,
}

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(1) var<storage> instanceData: InstanceData;

@vertex
fn vertex_main(
  @location(0) position:      vec4<f32>,
  @location(1) uv:            vec2<f32>,
  @location(2) normal:        vec3<f32>,
  @location(3) tangent:       vec3<f32>,
  @location(4) bitangent:     vec3<f32>,
  @location(5) textures:      vec4<u32>,
  @location(6) instanceSlot:  u32,
) -> VertexOutput {
  var output: VertexOutput;
  var modelView       = instanceData.data[instanceSlot].modelView;
  modelView[3][0]     = 0.0;
  modelView[3][1]     = 0.0;
  modelView[3][2]     = 0.0;
  modelView[3][3]     = 1.0;
  let camSpacePos     = modelView * position;
  output.Position     = uniforms.projection  * camSpacePos;
  output.viewPos      = camSpacePos.xyz;
  output.uv           = uv;
  output.localPos     = normalize(position.xyz);
  return output;
}

// Colour at bluest point of sky
const SKY_COLOUR = vec3<f32>(0x00, 0x00, 0x64) / 255;

// Colour at midpoint of sky
const MID_COLOUR = vec3<f32>(0x33, 0x99, 0xff) / 255;

// Colour at whitest point of sky
const SUN_COLOUR = vec3<f32>(0x20, 0x20, 0x00) / 255;

fn cube2sphere(pos: vec3<f32>) -> vec3<f32> {
  let x2 = pos.x*pos.x;
	let y2 = pos.y*pos.y;
	let z2 = pos.z*pos.z;
	let a  = (x2 / 2.0);
	let b  = (y2 / 2.0);
	let c  = (z2 / 2.0);
	let sx =  pow(1.0 - b - c + ( (y2 * z2) / 3.0 ), 2 ) * pos.x / 2;
	let sy =  pow(1.0 - c - a + ( (x2 * z2) / 3.0 ), 2 ) * pos.y / 2;
	let sz =  pow(1.0 - a - b + ( (x2 * y2) / 3.0 ), 2 ) * pos.z / 2;
  return vec3<f32>(sx, sy, sz);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let pos = cube2sphere(input.localPos);
  let horiz = length(pos.xz);
  let alt = acos(horiz) / 1.5707963267948966192313216916398;
  //let alt = acos(pos.y);
  let height = alt / 1.5707963267948966192313216916398;
  //let height = 1 - horiz;
  let colour = mix(SUN_COLOUR, SKY_COLOUR, smoothstep(0.3, 0.8, height));
  return vec4(pow(colour, vec3(1/2.2)), 1.0);
}

