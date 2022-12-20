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
  srcType?: string,             // 'image' or 'svg'
}

export type MeshResource = {
  id:            number,         // Mesh resource ID
  name:          string,         // Human-readable name
  vertexCount:   number,         // Number of vertices in mesh
  vertexPointer: number,         // Byte offset location in vertex buffer
  vertexBuffer:  GPUBuffer,      // Vertex buffer
}

export type MeshResourceDescriptor = {
  id:          number,          // Mesh resource ID
  name:        string,          // Human-readable name
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
  meshes:        MeshResource[],         // Mesh resources
  textures:      TextureResource[],      // Texture resources
}

/** Storage type for geometry (mesh) data.
 * 
 * All geometry data is stored in a single vertex buffer. Vertices must be the
 * same size, but not necessarily the same format. New meshes are added to the
 * end of the buffer, unless a prior removal has left a sufficiently large gap.
 */
export type MeshStore = {
  vertexBuffer:     GPUBuffer,              // Vertex buffer
  vertexSize:       number,                 // Size of each vertex in bytes
  capacity:         number,                 // Maximum number of vertices
  vertexCount:      number,                 // Number of vertices in buffer
  meshes:           MeshResource[],         // Mesh resources
  nextMeshId:       number,                 // Next available mesh ID
  nextVertexOffset: number,                 // Next available vertex offset
  vacancies:        [number, number][],     // Vacant regions in buffer
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
  mipLevels:   number,           // Number of mip levels
}

/** A texture stored in a region of an atlas.
 * Textures are stored in the centre of a region twice the dimensions of the
 * texture itself to prevent bleeding when mipmapping is enabled.
 */
export type SubTexture = {
  id:        number, // Texture ID in atlas
  label?:    string, // Label for debugging
  x:         number, // X offset in atlas
  y:         number, // Y offset in atlas
  width:     number, // Width in atlas (must be power of 2)
  height:    number, // Height in atlas (must be power of 2)
  layer:     number, // Layer in atlas
  region:    Region, // Texture region in atlas
}
export type Region = [number, number, number, number]  // x, y, width, height

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

/** Camera type.
 * 
 * Changes mark the camera as "dirty" so that the renderer knows to propagate
 * it to whatever buffers need a copy.
 */
export type Camera = {
  projection: Mat4,
  isDirty: boolean, 
  position: Vec3,
  orientation: Quat,
}

/** First-person camera.
 * 
 * Does not hold projection information and can not be used directly to render.
 * Instead, the first-person camera may be applied to a "view" camera to produce
 * a renderable view.
 */
export type FirstPersonCamera = {
  position: Vec3,
  roll: number,
  pitch: number,
  yaw: number,
}

/** Model record.
 * 
 * Links a mesh resource to an instance data allocation and draw call.
 */
export type Model = {
  id: number,             // Model ID
  name: string,           // Human-readable name for convenient lookup
  meshId: number,         // ID of mesh resource
  allocationId: number,   // ID of instance allocation
  drawCallId: number,     // ID of draw call
}
