export type Renderable = {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  instanceCount: number;
  instanceBuffer?: GPUBuffer;
  uniformBuffer?: GPUBuffer;
  uniformBindGroup?: GPUBindGroup;
  uniformData?: any;
  outputTexture?: GPUTexture;
}

export type Vec2 = Float32Array | [number,number, number]
export type Vec3 = Float32Array | [number,number, number]
export type Vec4 = Float32Array
export type Mat4 = Float32Array
export type Quat = Float32Array

/** Standard vertex format.
 * Type: float32
 * Size: 9 floats / 36 bytes
 */
export type Vertex = [
  number,  // x
  number,  // y
  number,  // z
  number,  // w
  number,  // u
  number,  // v
  number,  // l (atlas layer)
  number,  // nx
  number,  // ny
  number,  // nz
  number,  // umin
  number,  // vmin
  number,  // usize
  number,  // vsize
]

export type Mesh = {
  label: string,
  vertexCount: number,
  vertices: Vertex[]
}

/** Extended vertex format. Used for offline storage.
 * Includes texture ID which is later used to remap the texture coordinates.
 * Type: float32
 * Size: 10 floats / 40 bytes
 */
export type XVertex = [
  number,  // x
  number,  // y
  number,  // z
  number,  // w
  number,  // u
  number,  // v
  number,  // nx
  number,  // ny
  number,  // nz
  number,  // texture ID
]

/** Extended mesh format. Used for offline storage. */
export type XMesh = {
  id: number,
  label: string,
  vertexCount: number,
  vertices: XVertex[],
}


export type TextureResource = {
  id:       number,             // Texture resource ID
  label?:   string,             // Human-readable name for debugging
  size:     [number, number],   // Width, height
  texture:  SubTexture,         // Sub-texture in texture atlas
}

export type TextureResourceDescriptor = {
  id:       number,             // Texture resource ID
  label?:   string,             // Human-readable name for debugging
  size:     [number, number],   // Width, height
  src?:     string,             // Path to image file
}

export type MeshResource = {
  id:            number,         // Mesh resource ID
  label?:        string,         // Human-readable name for debugging
  vertexCount:   number,         // Number of vertices in mesh
  vertexPointer: number,         // Byte offset location in vertex buffer
  vertexBuffer:  GPUBuffer,      // Vertex buffer
}

export type MeshResourceDescriptor = {
  id:          number,          // Mesh resource ID
  label?:      string,          // Human-readable name for debugging
  vertexCount: number,          // Number of vertices in mesh
  src?:        string,          // Path to file containing mesh data
  srcType?:    string,          // 'json' or 'bin'
  vertices?:   XVertex[],       // Optionally, vertex data can be provided directly
}

export type ResourceBundleDescriptor = {
  label?:   string,                      // Human-readable name for debugging
  meshes:   MeshResourceDescriptor[],    // Mesh resources
  textures: TextureResourceDescriptor[], // Texture resources
}

export type ResourceBundle = {
  label?:        string,                 // Human-readable name for debugging
  vertexBuffer:  GPUBuffer,              // Vertex buffer
  atlas:         Atlas,                  // Texture atlas
  meshes:        MeshResource[],         // Mesh resources
  textures:      TextureResource[],      // Texture resources
}

/** Texture atlas. 
 * 
 * Represents a 3D texture that is used to store multiple 2D textures. Sub-
 * textures must be aligned to the nearest power of 2 coordinates.
 * 
 * LIMITATIONS
 * In the current implementation:
 *   - The layer size of the atlas must be square, with a power of 2 size.
 *   - Sub-textures must be square, with a power of 2 size.
*/
export type Atlas = {
  label?:      string,           // Human-readable name for debugging
  texture:     GPUTexture,       // Texture object
  layerSize:   [number, number], // Texel dimensions of each layer
  layerCount:  number,           // Number of layers
  subTextures: SubTexture[],     // Sub-textures in atlas
  format:      GPUTextureFormat, // Texture format
}

/** A texture that is a sub-region of an atlas. */
export type SubTexture = {
  id:        number, // Texture ID in atlas
  label?:    string, // Label for debugging
  x:         number, // X offset in atlas
  y:         number, // Y offset in atlas
  width:     number, // Width in atlas (must be power of 2)
  height:    number, // Height in atlas (must be power of 2)
  layer:     number, // Layer in atlas
}

/** Describes rendering work to be done.
 * May be combined to optimise the number of draw calls.
 */
export type DrawCallDescriptor = {
  id:              number,
  label?:          string,
  vertexBuffer:    GPUBuffer,
  vertexPointer:   number,
  vertexCount:     number,
  instanceBuffer:  GPUBuffer,
  instancePointer: number,
  instanceCount:   number,
  bindGroup:       GPUBindGroup,
}

/** A renderable inhabitant of a Scene. */
export type Entity = {
  name:            string,
  meshId:          number, // ID of mesh resource
  instanceId:      number, // Byte offset location in instance buffer
}

/** State object for the instance allocator. */
export type InstanceAllocator = {
  storageBuffer:       GPUBuffer,            // Storage buffer object
  instanceBuffer:      GPUBuffer,            // Instance buffer object
  nextAllocationId:    number,               // Next allocation ID to be assigned
  nextInstanceId:      number,               // Next instance ID to be assigned
  nextStorageSlot:     number,               // Position in storage buffer for next instance, after vacated slots
  nextInstanceSlot:    number,               // Position in instance buffer for next allocation
  capacity:            number,               // Number of instance slots
  slotsAllocated:      number,               // Number of slots allocated to meshes
  allocations:         InstanceAllocation[], // Allocation records
  instances:           InstanceRecord[],     // Instance records
  vacated:             number[],             // Pointers to vacated storage buffer slots
}

export type InstanceAllocation = {
  id:            number,        // Allocation ID
  instanceIndex: number,        // Start index in instance buffer
  capacity:      number,        // Number of instance slots
  numInstances:  number,        // Current instance count
}

/** Instance attributes. */
export type InstanceRecord = {
  instanceId:      number,       // Instance ID
  allocationId:    number,       // ID of mesh allocation
  instanceSlot:    number,       // Position in instance buffer
  storageSlot:     number,       // Uniform index for shaders
}
