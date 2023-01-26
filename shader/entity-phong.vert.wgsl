/** Entity vertex shader for Blinn-Phong lighting. 
 *
 * Uses three textures: colour, normal and specular. All three are expected to
 * be the same size.
 */

struct VertexOutput {
  @builtin(position)               Position:     vec4<f32>, // position in screen space
  @location(0)                     viewPos:      vec3<f32>, // position in view space
  @location(1)                     uvDiffuse:    vec3<f32>, // position and layer of diffuse texture
  @location(2)                     uvNormal:     vec3<f32>, // position and layer of normal texture
  @location(3)                     uvSpecular:   vec3<f32>, // position and layer of specular texture
  @location(4)                     normal:       vec3<f32>, // normal vector
  @location(5)                     tangent:      vec3<f32>, // tangent vector
  @location(6)                     bitangent:    vec3<f32>, // bitangent vector
  @location(7) @interpolate(flat)  materialSlot: u32,       // material slot
  @location(8)                     uv:           vec2<f32>, // uv coordinate (for calculating gradients)
}

struct Uniforms {
  view:       mat4x4<f32>,
  projection: mat4x4<f32>,
}

struct Material {
  ambient:    vec4<f32>,
  diffuse:    vec4<f32>,
  specular:   vec4<f32>,
  emissive:   vec4<f32>,
  textures:   vec4<u32>,
  shininess:  f32,
}

struct MaterialData {
  data: array<Material>,
}

struct InstanceProperties {
  modelView:    mat4x4<f32>,
  materialSlot: u32,
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

@group(0) @binding(0) var<uniform> uniforms:     Uniforms;
@group(0) @binding(2) var<storage> materialData: MaterialData;
@group(0) @binding(3) var<storage> instanceData: InstanceData;
@group(0) @binding(4) var<storage> atlasData:    AtlasData;

@vertex
fn main(
  @location(0) position:     vec4<f32>,
  @location(1) uv:           vec2<f32>,
  @location(2) normal:       vec3<f32>,
  @location(3) tangent:      vec3<f32>,
  @location(4) bitangent:    vec3<f32>,
  @location(5) textures:     vec4<u32>,
  @location(6) instanceSlot: u32,
) -> VertexOutput {
  var output: VertexOutput;
  let instance = instanceData.data[instanceSlot];

  // Positioning
  let modelView    = instance.modelView;
  let camSpacePos  = modelView * position;
  output.Position  = uniforms.projection  * camSpacePos;
  output.viewPos   = camSpacePos.xyz;

  // Material
  let material        = materialData.data[instance.materialSlot];
  output.materialSlot = instance.materialSlot;
  output.uvDiffuse.z  = -1;
  output.uvNormal.z   = -1;
  output.uvSpecular.z = -1;
  if(material.textures[0] != 0) { 
    let uvDiffuse    = atlasData.data[material.textures[0]]; 
    output.uvDiffuse = vec3(uv * uvDiffuse.size + uvDiffuse.position, f32(uvDiffuse.layer));
  }
  if(material.textures[1] != 0) { 
    let uvNormal    = atlasData.data[material.textures[1]]; 
    output.uvNormal = vec3(uv * uvNormal.size + uvNormal.position, f32(uvNormal.layer));
  }
  if(material.textures[2] != 0) {
    let uvSpecular    = atlasData.data[material.textures[2]]; 
    output.uvSpecular = vec3(uv * uvSpecular.size + uvSpecular.position, f32(uvSpecular.layer));
  }

  // Lighting
  output.normal    = normalize((modelView * vec4(normal,    0)).xyz);
  output.tangent   = normalize((modelView * vec4(tangent,   0)).xyz);
  output.bitangent = normalize((modelView * vec4(bitangent, 0)).xyz); 
  
  return output;
}
