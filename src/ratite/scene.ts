import type {
  CameraNode, DrawCallDescriptor, GPUContext, LightSourceNode,
  LightSourceNodeDescriptor, Mat4, Model, ModelNode, Node, NodeDescriptor,
  Quat, Renderer, Scene, SceneGraph, SceneGraphDescriptor, TransformDescriptor,
  TransformNode, Vec2, Vec3, Vec4, View, ViewDescriptor
} from "./types"
import * as Skybox from './skybox.js'
import {createCamera, createFirstPersonCamera} from './camera.js'
import {mat4, quat, glMatrix} from 'gl-matrix'
import {activateInstance, addInstance, deactivateInstance, registerAllocation, serialiseInstanceData, updateInstanceData} from "./instance.js"
import {getMeshById, getMeshByName} from "./mesh.js"
import {INSTANCE_RECORD_SIZE, UNIFORM_BUFFER_OFFSET_PROJECTION, UNIFORM_BUFFER_OFFSET_VIEW} from "./constants.js"
import {arraySet, latLonToUnitVec} from "./common.js"
import {createBindGroup, createMainUniformBuffer} from "./pipeline.js"
import {activateLightSource, applyLightSourceDescriptor, createLightingState, createLightSource, deactivateLightSource} from "./lighting.js"
import { useMaterialByName } from "./material.js"
const { PI } = Math
glMatrix.setMatrixArrayType(Array)

const instanceDataBuffer = new ArrayBuffer(INSTANCE_RECORD_SIZE)
const instanceDataBufferF32 = new Float32Array(instanceDataBuffer)
let sceneGraphCount = 0

/** Create a scene. */
export async function createScene(
  uniformBuffer: GPUBuffer,
  gpu:           GPUContext): Promise<Scene> {

  const skybox = await Skybox.createSkybox(uniformBuffer, gpu)
  const defaultCamera = createCamera(gpu.aspect)
  const firstPersonCamera = createFirstPersonCamera()
  
  return {
    cameras: [defaultCamera],
    nodes: [],
    skybox,
    firstPersonCamera,
  }
}

/** Create a scene graph. */
export function createSceneGraph(
    renderer:            Renderer,
    lightSourceCapacity: number = 16,
    label?:              string): SceneGraph {

  if(!label)
    label = `scene-graph-${sceneGraphCount++}`

  const uniformBuffer = createMainUniformBuffer(renderer.device)
  const uniformData = new ArrayBuffer(uniformBuffer.size)
  const lightingState = createLightingState(lightSourceCapacity, renderer.device)
  const bindGroup = createBindGroup(
    label,
    renderer.bindGroupLayout,
    uniformBuffer,
    lightingState.buffer,
    renderer.materials.buffer,
    renderer.instanceAllocator.storageBuffer,
    renderer.atlas,
    renderer.mainSampler,
    renderer.device)
  const rootNode: TransformNode = {
    nodeType:  'transform',
    name:      'root',
    transform: mat4.create() as Mat4,
    parent:    null,
    root:      null,
    children:  [],
    visible:   true,
  }
  rootNode.root = rootNode
  return {
    renderer:       renderer,
    root:           rootNode,
    nodes:          [],
    drawCalls:      [],
    models:         {},
    nextDrawCallId: 0,
    views:          {},
    uniformBuffer:  uniformBuffer,
    uniformData:    uniformData,
    uniformFloats:  new Float32Array(uniformData),
    uniformView:    new DataView(uniformData),
    bindGroup:      bindGroup,
    lightingState:  lightingState,
  }
}


export function createSceneGraphFromDescriptor(
    descriptor: SceneGraphDescriptor, 
    renderer:   Renderer): SceneGraph {

  const sceneGraph = createSceneGraph(renderer)
  sceneGraph.label = descriptor.name
  if(descriptor.models) {
    for(let modelDescriptor of descriptor.models)
      registerSceneGraphModel(
        modelDescriptor.name,
        modelDescriptor.mesh,
        modelDescriptor.pipeline,
        modelDescriptor.maxInstances,
        sceneGraph)
  }
  if(descriptor.views) {
    for(let viewDescriptor of descriptor.views)
      createSceneView(
        viewDescriptor.name, 
        viewDescriptor.projection, 
        sceneGraph)
  }
  if(descriptor.root) {
    const root = createNodeFromDescriptor(descriptor.root, sceneGraph)
    attachNode(root, sceneGraph.root, sceneGraph)
    sceneGraph.root = root
    root.name = 'root'
    root.root = root
    root.parent = null
  }
  return sceneGraph
}

export function createNodeFromDescriptor(
    descriptor: NodeDescriptor, 
    sceneGraph: SceneGraph): Node {
  let node: Node = null
  if(descriptor.type == 'model') {
    node = createModelNode(descriptor.modelName, sceneGraph, descriptor.material) 
  } else if(descriptor.type == 'camera') {
    node = createCameraNode(descriptor.view, sceneGraph)
  } else if(descriptor.type == 'transform') {
    node = createTransformNode(sceneGraph)
  } else if(descriptor.type == 'light') {
    node = createLightSourceNode(descriptor, sceneGraph)
  }
  node.name = descriptor.name
  if(descriptor.transform)
    setTransform(descriptor.transform, node)
  if(descriptor.children) {
    for(let childDescriptor of descriptor.children) {
      const child = createNodeFromDescriptor(childDescriptor, sceneGraph)
      attachNode(child, node, sceneGraph)
    }
  }
  if('visible' in descriptor)
    setNodeVisibility(descriptor.visible, node, sceneGraph)
  return node
}

/** Set the visibility of a node.
 * 
 * All models in the node's subtree are affected, but the `visible` property of
 * descendant nodes is not changed. Rather, they are added and removed from the
 * scene graph's draw call list as needed. Light sources (not implemented yet)
 * will be updated by writing to the global uniform buffer.
 */
export function setNodeVisibility(visible: boolean, node: Node, sceneGraph: SceneGraph): void {
  // TODO: don't needlessly show and then hide newly created invisible nodes

  if(node.visible === visible) return
  node.visible = false
  if(!node.root) return

  if(visible) {
    activateNode(node, sceneGraph)
  } else {
    activateNode(node, sceneGraph)
  }
}

/** Deactivate a node and all its visible descendants for drawing.
 *  
 * This is used by `attachNode`, `detachNode` and `setNodeVisibility` to update
 * draw calls and the lighting buffer when the effective visibility of a node
 * changes. It should not be used elsewhere, as this will lead to inconsistent
 * state the next time that one of these functions is called.
 */
function deactivateNode(node: Node, sceneGraph: SceneGraph): void {
  if(!node.visible) return

  switch(node.nodeType) {
  case 'model':
    const { instanceAllocator, device } = sceneGraph.renderer
    const drawCall = sceneGraph.drawCalls[node.drawCallId]
    deactivateInstance(node.instanceId, instanceAllocator, device)
    drawCall.instanceCount--
    break
  case 'light':
    deactivateLightSource(node.lightSource.id, sceneGraph.lightingState)
    break
  default:
    break
  }
  
  for(let child of node.children)
    deactivateNode(child, sceneGraph)
}

/** Activate a node and all its visible descendants for drawing.
 *  
 * This is used by `attachNode`, `detachNode` and `setNodeVisibility` to update
 * draw calls and the lighting buffer when the effective visibility of a node
 * changes. It should not be used elsewhere, as this will lead to inconsistent
 * state the next time that one of these functions is called.
 */
function activateNode(node: Node, sceneGraph: SceneGraph): void {
  if(!node.visible) return

  switch(node.nodeType) {
  case 'model':
    const { instanceAllocator, device } = sceneGraph.renderer
    const drawCall = sceneGraph.drawCalls[node.drawCallId]
    activateInstance(node.instanceId, instanceAllocator, device)
    drawCall.instanceCount++
    break
  case 'light': 
    activateLightSource(node.lightSource.id, sceneGraph.lightingState)
    break
  default:
    break
  }
  
  for(let child of node.children)
    activateNode(child, sceneGraph)
}


/** Set the transform of a node, overwriting any previous transform. */
export function setTransform(transform: TransformDescriptor, node: Node): void {
  computeMatrix(transform, node.transform)
}

/** Set the translation component of a node's transform matrix. */
export function setTranslation(translation: Vec3, node: Node): void {
  node.transform[12] = translation[0]
  node.transform[13] = translation[1]
  node.transform[14] = translation[2]
}

const applyTransform_tempMat4: Mat4 = mat4.create() as Mat4

/** Apply a transformation `A` to a node's existing transform matrix `B` by the matrix multiplication `B*A`. */
export function applyTransform(transform: TransformDescriptor, node: Node): void {
  const initial = node.transform
  const matrix = computeMatrix(transform, applyTransform_tempMat4)
  mat4.multiply(node.transform, initial, matrix)
}

const applyPreTransform_tempMat4: Mat4 = mat4.create() as Mat4

/** Apply a transformation `A` to a node's existing transform matrix `B` by the matrix multiplication `A*B`. */
export function applyPreTransform(transform: TransformDescriptor, node: Node): void {
  const initial = node.transform
  const matrix = computeMatrix(transform, applyTransform_tempMat4)
  mat4.multiply(node.transform, matrix, initial)
}

const computeMatrix_tempQuat: Quat = quat.create() as Quat
const computeMatrix_tempMat4: Mat4 = mat4.create() as Mat4

/** Get a transfom matrix for a TransformDescriptor. */
export function computeMatrix(transform: TransformDescriptor, out: Mat4): Mat4 {
  switch(transform.type) {
  case 'matrix':
     for(let i = 0; i < 16; i++) 
       out[i] = transform.matrix[i]
     return out
  case 'trs':
    return mat4.fromRotationTranslationScale(out, 
      transform.rotation    ?? [0, 0, 0, 1], 
      transform.translation ?? [0, 0, 0], 
      transform.scale       ?? [1, 1, 1]
    ) as Mat4
  case 'globe':
    mat4.fromTranslation(out, [0, transform.radius, 0])
    quat.rotationTo(computeMatrix_tempQuat, 
      [0,1,0], 
      latLonToUnitVec(transform.coords.map(x => x*PI/180) as Vec2)
    )
    mat4.fromQuat(computeMatrix_tempMat4, computeMatrix_tempQuat)
    return mat4.mul(out, computeMatrix_tempMat4, out) as Mat4
  }
}

/** Clone a node.
 * 
 * The node and all its descendants are copied and the new structure is created
 * in a detached state. Camera nodes are cloned with a null view.
 */
export function cloneNode(node: Node, sceneGraph: SceneGraph): Node {
  const descriptor: any = {
    name: node.name,
    type: node.nodeType,
    transform: {
      type:   'matrix',
      matrix: mat4.clone(node.transform) as Mat4,
    },
  }
  switch(node.nodeType) {
  case 'model':
    descriptor.modelName = node.modelName
    break
  case 'camera':
    descriptor.view = null
    break
  case 'transform':
    break
  case 'light':
    break
  }
  const clone = createNodeFromDescriptor(descriptor, sceneGraph)
  for(let child of node.children) {
    attachNode(cloneNode(child, sceneGraph), clone, sceneGraph)
  }
  return clone
}


/** Create a view. */
export function createSceneView(
    name:       string, 
    descriptor: ViewDescriptor, 
    sceneGraph: SceneGraph): View {
  if(name in sceneGraph.views) {
    throw new Error(`View ${name} already exists.`)
  }
  const view: View = {
    name:       name,
    projection: mat4.create() as Mat4,
    viewMatrix: mat4.create() as Mat4,
    camera:     null,
  }
  if(descriptor.type === 'perspective') {
    const aspect = descriptor.aspect == 'auto' 
                 ? sceneGraph.renderer.context.aspect
                 : descriptor.aspect
    const far: number = descriptor.far === 'Infinity' ? Infinity : descriptor.far
    mat4.perspectiveZO(
      view.projection,
      descriptor.fovy * PI/180,
      aspect,
      descriptor.near,
      far,
    )
  } else if(descriptor.type === 'orthographic') {
    mat4.ortho(
      view.projection,
      descriptor.left,
      descriptor.right,
      descriptor.bottom,
      descriptor.top,
      descriptor.near,
      descriptor.far,
    )
  }
  sceneGraph.views[name] = view
  return view
}

/** Create a model node. */
export function createModelNode(
  modelName:     string,
  sceneGraph:    SceneGraph,
  materialName?: string): ModelNode {

  if(!(modelName in sceneGraph.models)) {
    throw new Error(`Model ${modelName} does not exist.`)
  }

  const { device, instanceAllocator, meshStore, materials } = sceneGraph.renderer
  const model = sceneGraph.models[modelName]
  const mesh = getMeshById(model.meshId, meshStore)
  if(!materialName) 
    materialName = mesh.material
  const materialSlot = useMaterialByName(materialName, materials)
  const instanceData = {
    modelView:  mat4.create() as Mat4, 
    materialId: materialSlot,
  }
  const instanceId = addInstance(
    model.allocationId,  
    instanceData,
    device, 
    instanceAllocator,
    false,
  )
  
  const node: ModelNode = {
    nodeType:      'model',
    parent:        null,
    root:          null,
    transform:     mat4.create() as Mat4,
    children:      [],
    instanceId:    instanceId,
    modelName:     modelName,
    drawCallId:    model.drawCallId,
    visible:       true,
    material:      materialName,
    _instanceData: instanceData
  }
  sceneGraph.nodes.push(node)
  return node
}

/** Create a camera node. */
export function createCameraNode(viewName: string | null, sceneGraph: SceneGraph): Node {
  let view = null
  if(viewName !== null) {
    if(!(viewName in sceneGraph.views)) {
      throw new Error(`View ${viewName} does not exist.`)
    }
    view = sceneGraph.views[viewName]
    if(view.camera !== null) {
      throw new Error(`View ${viewName} already has a camera.`)
    }
  }
  const node: CameraNode = {
    nodeType:   'camera',
    parent:     null,
    root:       null,
    transform:  mat4.create() as Mat4,
    children:   [],
    view:       view,
    visible:    true,
  }
  sceneGraph.nodes.push(node)
  if(view)
    view.camera = node
  return node
}

/** Create a light source node. */
export function createLightSourceNode(
    descriptor: LightSourceNodeDescriptor,
    sceneGraph: SceneGraph): Node {

  const lightSource = createLightSource(sceneGraph.lightingState, {
    ...descriptor,
    type: descriptor.lightType,
  })

  const node: LightSourceNode = {
    nodeType:    'light',
    parent:      null,
    root:        null,
    transform:   mat4.create() as Mat4,
    children:    [],
    lightSource: lightSource,
    visible:     true,
  }

  sceneGraph.nodes.push(node)
  return node
}

/** Create a transform node. */
export function createTransformNode(sceneGraph: SceneGraph): Node {
  const node: TransformNode = {
    nodeType:   'transform',
    parent:     null,
    root:       null,
    transform:  mat4.create() as Mat4,
    children:   [],
    visible:    true,
  }
  sceneGraph.nodes.push(node)
  return node
}

/** Register a model with the scene graph. */
export function registerSceneGraphModel(
    name:         string,
    meshName:     string,
    pipelineName: string,
    maxInstances: number,
    sceneGraph:   SceneGraph): void {

  const { instanceAllocator, meshStore } = sceneGraph.renderer
  const allocationId = registerAllocation(maxInstances, instanceAllocator)
  const allocation = instanceAllocator.allocations[allocationId]
  const mesh = getMeshByName(meshName, meshStore)
  const drawCallId = sceneGraph.nextDrawCallId
  const pipeline = sceneGraph.renderer.pipelines[pipelineName]
  const model: Model = { 
    id: 0, 
    name, 
    meshId: mesh.id, 
    allocationId,
    drawCallId,
    pipelineName,
  }
  const drawCall: DrawCallDescriptor = {
    id:              drawCallId,
    label:           `SceneGraph[${sceneGraph.label}]::DrawCall#${drawCallId}[${name}]`,
    vertexBuffer:    meshStore.vertexBuffer,
    vertexPointer:   mesh.vertexPointer,
    vertexCount:     mesh.vertexCount,
    instanceBuffer:  instanceAllocator.instanceBuffer,
    instancePointer: allocation.instanceIndex * 4,
    instanceCount:   0,
    bindGroup:       sceneGraph.bindGroup,
    pipeline:        pipeline,
    indexPointer:    mesh.indexPointer,
    indexBuffer:     meshStore.indexBuffer,
    indexOffset:     mesh.indexOffset,
    indexCount:      mesh.indexCount,
  }
  
  
  sceneGraph.nextDrawCallId++
  sceneGraph.models[name] = model
  sceneGraph.drawCalls.push(drawCall)
}

/** Attach a node to a parent node.
 * 
 * The attachment process is as follows:
 * 1. Set the node's parent property to the parent.
 * 2. Add the node to the parent's children list.
 * 3. If the parent's root property is null, return.
 * 4. Recursively update the root for the node subtree.
 * 5. If any ancestor node is hidden, return.
 * 6. Recursively activate the node subtree for drawing. 
 */
export function attachNode(
  node: Node,
  parent: Node,
  sceneGraph: SceneGraph): void {

  if(node.root)
    throw new Error('Node is already attached.')
  
  node.parent = parent
  parent.children.push(node)

  if(!parent.root)
    return

  walkSubtree(n => n.root = parent.root, node)

  if(!isNodeVisible(node))
    return

  activateNode(node, sceneGraph)
}

/** Detach a node from its parent.
 * 
 * If the node is attached to the scene graph, the whole node subtree has its
 * root property reset to null. If the node is visible, the whole node subtree
 * is deactivated for drawing.
 */
export function detachNode(node: Node, sceneGraph: SceneGraph): void {
  if(!node.parent)
    throw new Error('Node is not attached to a parent node.')

  // Remove parent/child relationship
  const index = node.parent.children.indexOf(node)
  if(index === -1)
    throw new Error('Scene graph integrity error: node is not a child of its parent.')
  node.parent.children.splice(index, 1)
  node.parent = null

  if(!node.root)
    return
  
  if(isNodeVisible(node))
    deactivateNode(node, sceneGraph)

  walkSubtree(n => n.root = null, node)
}


/** Call a function on a node and all of its children. */
function walkSubtree(fn: (node: Node) => void, node: Node): void {
  fn(node)
  for(const child of node.children)
    walkSubtree(fn, child)
}

/** Is the node visible? 
 * 
 * A node is visible if it is attached to the scene, its `visible` property is
 * true, and all of its ancestors are visible.
 */
export function isNodeVisible(node: Node): boolean {
  if(!node.root) return false
  for(let ancestor = node; ancestor; ancestor = ancestor.parent)
    if(!ancestor.visible) return false
  return true
}

/** Retrieve the first matching element, or null. */
export function getNodeByName(name: string, sceneGraph: SceneGraph): Node | null {
  return getChildNodeByName(name, sceneGraph.root)
}

/** Retrieve the first matching child of a node, or null. */
export function getChildNodeByName(name: string, node: Node): Node | null {
  if(node.name === name)
    return node
  for(const child of node.children) {
    const match = getChildNodeByName(name, child)
    if(match !== null)
      return match
  }
  return null
}

/** Update GPU buffer matrices of all the visible nodes in the scene graph. */
export function updateModelViews(view: View, sceneGraph: SceneGraph): void {
  const viewMatrix = getViewMatrix(view)
  sceneGraph.uniformFloats.set(viewMatrix, UNIFORM_BUFFER_OFFSET_VIEW / 4)
  sceneGraph.uniformFloats.set(view.projection, UNIFORM_BUFFER_OFFSET_PROJECTION / 4)
  view.viewMatrix = viewMatrix
  updateModelViews_(sceneGraph.root, mat4.create() as Mat4, viewMatrix, sceneGraph)
  sceneGraph.renderer.device.queue.writeBuffer(sceneGraph.uniformBuffer, 0, sceneGraph.uniformData)
}

let updateModelViews_tempMat4: Mat4 = mat4.create() as Mat4

/** Internal recursive helper function for updateModelViews. */
function updateModelViews_(
    node:             Node, 
    currentTransform: Mat4, 
    viewMatrix:       Mat4,
    sceneGraph:       SceneGraph): void {

  if(!node.visible)
    return

  mat4.multiply(currentTransform, currentTransform, node.transform)
  
  switch(node.nodeType) {
  case 'model':
    mat4.multiply(node._instanceData.modelView, viewMatrix, currentTransform)
    if(updateModelViews_tempMat4.some(x => x > 1000000)) {
      console.warn(`WARNING: large numbers detected in modelview matrix. reprojecting...`)
      node._instanceData.modelView = checkProjection(node._instanceData.modelView, sceneGraph.views.default.projection)
    }
    const { instanceAllocator, device } = sceneGraph.renderer
    updateInstanceData(node.instanceId, instanceAllocator, device, node._instanceData)
    break
  case 'light':
    if(node.lightSource.slot === null)
      break // do nothing if the light somehow isn't active

    mat4.multiply(updateModelViews_tempMat4, viewMatrix, currentTransform)
    // Basically, we assume that a light starts off at the origin pointing down
    // the negative z axis, and we use the scene graph transforms to position
    // and orient it, as if it were a model. The lighting manager needs to know
    // the position and direction as vectors, however, so we extract them here.
    const position: Vec4 = [
      updateModelViews_tempMat4[12],
      updateModelViews_tempMat4[13],
      updateModelViews_tempMat4[14],
      1,
    ]
    const direction: Vec4 = [
      -updateModelViews_tempMat4[8],
      -updateModelViews_tempMat4[9],
      -updateModelViews_tempMat4[10],
      0,
    ]
    applyLightSourceDescriptor({position, direction}, node.lightSource)

    break
  }

  for(const child of node.children)
    updateModelViews_(child, mat4.clone(currentTransform) as Mat4, viewMatrix, sceneGraph)
}

/** Calculate the model matrix for a node. */
export function getModelMatrix(node: Node): Mat4 {
  if(!node.root)
    throw new Error('Node is not attached to the scene graph.')
  const modelMatrix = mat4.create() as Mat4
  let ancestor = node
  while(ancestor) {
    mat4.multiply(modelMatrix, ancestor.transform, modelMatrix)
    ancestor = ancestor.parent
  }
  return modelMatrix
}

/** Calculate the view matrix for a view. */
export function getViewMatrix(view: View): Mat4 {
  if(!view.camera)
    throw new Error('View has no camera.')
  const cameraModelMatrix = getModelMatrix(view.camera)
  mat4.invert(cameraModelMatrix, cameraModelMatrix)
  return cameraModelMatrix
}

export function checkProjection(modelView: Mat4, projection: Mat4): Mat4 {
  //const cube = [
  //  [-1,-1,-1, 1],
  //  [-1,-1, 1, 1],
  //  [-1, 1,-1, 1],
  //  [-1, 1, 1, 1],
  //  [ 1,-1,-1, 1],
  //  [ 1,-1, 1, 1],
  //  [ 1, 1,-1, 1],
  //  [ 1, 1, 1, 1],
  //]
  const projected = mat4.create()
  mat4.mul(projected, projection, modelView)

  //console.log('projection', projection)
  //console.log('projected matrix', projected)
  //console.log('original modelview', modelView)

  //for(let v of cube) {
  //  vec4.transformMat4(v as Vec4, v as Vec4, projected)
  //}

  //console.log('original projected cube vertices', cube.map(v => [...v]))

  //for(let v of cube) {
  //  v[0] /= v[3]
  //  v[1] /= v[3]
  //  v[2] /= v[3]
  //  v[3] /= v[3]
  //}

  //console.log('projected cube vertices after w-divide', cube.map(v => [...v]))

  const [iproj, shrunk] = [mat4.create(), mat4.clone(projected)]
  mat4.invert(iproj, projection)
  mat4.multiplyScalar(shrunk, projected, 0.0001)

  //console.log('inverted projection', iproj)
  //console.log('shrunk projected matrix', shrunk)

  const unproj = mat4.create()
  mat4.mul(unproj, iproj, shrunk)

  //console.log('unprojected shrunk matrix', mat4.clone(unproj))

  unproj[11] = 0
  unproj[15] = 1

  return unproj as Mat4
}

