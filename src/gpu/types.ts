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
  number,  // 0 x
  number,  // 1 y
  number,  // 2 z 
  number,  // 3 w
  number,  // 4 u
  number,  // 5 v
  number,  // 6 nx
  number,  // 7 ny
  number,  // 8 nz
  number,  // 9 texture ID
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
}

export type MeshResourceDescriptor = {
  id:          number,          // Mesh resource ID
  name:        string,          // Human-readable name
  vertexCount: number,          // Number of vertices in mesh
  src?:        string,          // Path to file containing mesh data
  srcType?:    string,          // 'json' or 'bin'
  vertices?:   XVertex[],       // Optionally, vertex data can be provided directly
  texRemap?: TextureRemapping, // Texture IDs remapping
}

export type TextureRemapping = {
  [texId: number]: number
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
  pipeline:        GPURenderPipeline,
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
  numActive:     number,        // Number of instances that have been assigned instance buffer slots
  slotData:      Uint32Array,   // Contents of instance buffer controlled by this allocation
  slotInstances: Uint32Array,   // Instance IDs of instances in this allocation currently active at each slot
}

/** Instance attributes. */
export type InstanceRecord = {
  instanceId:      number,        // Instance ID
  allocationId:    number,        // ID of mesh allocation
  instanceSlot:    number | null, // Position in instance buffer, if active, otherwise null
  storageSlot:     number,        // Uniform index for shaders
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


export type Scene = {
  skybox: SkyboxState,
  nodes: Node[],
  cameras: Camera[],
  firstPersonCamera: FirstPersonCamera,
}

export type SkyboxState = {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  uniformBindGroup?: GPUBindGroup;
  texture: GPUTexture;
}


//
//    SCENE GRAPH
//


/** Scene graph backend.
 * 
 * A SceneGraph is a tree of nodes representing visible objects, light sources,
 * cameras and coordinate reference frames, each of which may have a transform
 * matrix applied cumulatively to its children. The purpose of a scene graph is
 * to provide a spatial representation of a scene, wherein objects are rendered
 * from the perspective of cameras and illuminated by light sources (which, for
 * the purpose of shadow mapping, are also a kind of camera).
 * 
 * For basic information on scene graphs and their usage, see the documentation
 * for the `Scene` type, which is a higher-level abstraction containing only
 * the logical structure of the scene. The `SceneGraph` type is a lower-level
 * representation of the scene graph which is used by the renderer. It maps the
 * objects in the scene graph to the GPU resources and draw calls that are used
 * to render them.
 * 
 * Whereas a `Scene` object may be considered to contain "pure data" and may be
 * manipulated without restriction at little cost and without side effects, a
 * `SceneGraph` should only be modified by functions in the scene graph module;
 * these functions generally entail relatively costly GPU operations which are
 * issued immediately (though not necessarily synchronously). Since many common
 * use cases involve frequent manipulation of the scene graph, and it is often
 * difficult to predict where individual updates could be batched from within
 * the process that generates them, it may be more convenient to use a `Scene`-
 * diffing algorithm to determine a final, minimal set of changes to the scene
 * graph and then apply them to the `SceneGraph` all at once and at an opportune
 * moment. This is especially the case where an "update loop" is running more
 * frequently than the rendering loop, as is often the case in games.
 * 
 * Object nodes are associated with a model to be rendered. The model must be
 * registered with the SceneGraph with `registerModel()` before it can be used
 * to create nodes. Registering a model allocates space in the instance buffer
 * for instances (nodes) of the model, and creates a draw call descriptor for
 * rendering it. The draw call descriptor is initialised with an instance count
 * of zero, and is updated as nodes are attached to the tree. A node may only
 * be attached to one parent at a time, and its resources become invalid after
 * it is destroyed.
 * 
 * The SceneGraph implementation is responsible for ordering draw calls so that
 * objects are rendered correctly and without unnecessary and costly changes to
 * the GPU state.
 */
export type SceneGraph = {
  label?:         string,
  root:           Node,
  nodes:          Node[],
  drawCalls:      DrawCallDescriptor[],
  models:         { [name: string]: Model },
  renderer:       Renderer,
  nextDrawCallId: number,
  views:          { [name: string]: View }, // Named view objects, connect to cameras
}

/** Scene node. */
export type Node = ModelNode 
                 | TransformNode
                 | CameraNode
                 | LightSourceNode

/** Base node type. */
export interface BaseNode {
  label?:    string,
  nodeType:  'model' | 'transform' | 'camera' | 'light',
  transform: Mat4,
  parent:    Node | null,
  root:      Node | null,
  children:  Node[],
}

export interface LightSourceNode extends BaseNode {
  nodeType:  'light',
  intensity: number,
}

/** Model node, a type of leaf node. */
export interface ModelNode extends BaseNode {
  nodeType:   'model',
  instanceId: number,
  modelName:  string,
  drawCallId: number,
}

/** Transform node. */
export interface TransformNode extends BaseNode {
  nodeType: 'transform',
}

/** Camera node.
 * 
 * Writes a view matrix to a registered view object.
 */
export interface CameraNode extends BaseNode {
  nodeType:   'camera',
  view:       View | null,
}


/** Scene view.
 * 
 * Stores view/projection matrices and may be connected to a camera node.
 */
export type View = {
  name:       string,
  projection: Mat4,
  viewMatrix: Mat4,
  camera:     CameraNode | null,
}


/** Scene view descriptor. */
export type ViewDescriptor = 
  PerspectiveViewDescriptor |
  OrthographicViewDescriptor

/** Perspective camera node descriptor. */
export interface PerspectiveViewDescriptor {
  type:   'perspective',
  fovy:   number,
  aspect: number,
  near:   number,
  far:    number,
}

/** Orthographic camera node descriptor. */
export interface OrthographicViewDescriptor {
  type:   'orthographic',
  left:   number,
  right:  number,
  bottom: number,
  top:    number,
  near:   number,
  far:    number,
}


//
//    RENDERER
//


/** Renderer state. 
 * 
 * The purpose of a renderer is to rasterize a scene and produce an image. The
 * renderer maintains pipeline objects and GPU buffers for geometry, textures, 
 * instance and uniform data. A renderer instance is associated with a single
 * GPU device and pipeline layout, and consequently a consistent vertex format,
 * shdder interface, texture format, instance and uniform data layout.
 * 
 * A renderer also maintains a collection of models, which associate a mesh
 * resource with instance data and a draw call descriptor. 
 * 
 * A renderer may contain data for multiple scenes, but a scene is associated
 * with a single renderer.
 */
export type Renderer = {
  viewMatrix: Mat4,
  uniformData: Float32Array,
  mainBindGroup: GPUBindGroup,
  mainBindGroupLayout: GPUBindGroupLayout,
  mainUniformBuffer: GPUBuffer,
  mainSampler: GPUSampler,
  mainPipeline: GPURenderPipeline,
  pipelineLayout: GPUPipelineLayout,
  atlas: Atlas,
  bundle: ResourceBundle,
  instanceAllocator: InstanceAllocator,
  meshStore: MeshStore,
  drawCalls: DrawCallDescriptor[],
  models: Model[],
  nextModelId: number,
  nextDrawCallId: number,
  device: GPUDevice,
  depthTexture: GPUTexture,
  depthTextureView: GPUTextureView,
  outputSize: [number, number],
}