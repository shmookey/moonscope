import type {BaseNode, Camera, CameraNode, DrawCallDescriptor, FirstPersonCamera, GPUContext, Mat4, Model, ModelNode, Node, NodeDescriptor, Renderer, Scene, SceneGraph, SceneGraphDescriptor, TransformNode, Vec2, Vec4, View, ViewDescriptor} from "./types"
import * as Skybox from './skybox.js'
import {createCamera, createFirstPersonCamera, getCameraViewMatrix} from './camera.js'
import { mat4, vec4, quat, glMatrix } from 'gl-matrix'
import {activateInstance, addInstance, deactivateInstance, registerAllocation, updateInstanceData} from "./instance.js"
import {getMeshByName} from "./mesh.js"
import {INSTANCE_BLOCK_SIZE} from "./constants.js"
import {latLonToUnitVec} from "./common.js"
const { PI } = Math
glMatrix.setMatrixArrayType(Array)

const instanceDataBuffer = new ArrayBuffer(INSTANCE_BLOCK_SIZE)
const instanceDataBufferF32 = new Float32Array(instanceDataBuffer)

/** Create a scene. */
export async function createScene(
  uniformBuffer: GPUBuffer,
  gpu: GPUContext): Promise<Scene> {

  const skybox = await Skybox.create(uniformBuffer, gpu)
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
export function createSceneGraph(renderer: Renderer): SceneGraph {
  const rootNode: TransformNode = {
    nodeType:  'transform',
    name:      'root',
    transform: mat4.create() as Mat4,
    parent:    null,
    root:      null,
    children:  [],
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
    node = createModelNode(descriptor.modelName, sceneGraph) 
  } else if(descriptor.type == 'camera') {
    node = createCameraNode(descriptor.view, sceneGraph)
  } else if(descriptor.type == 'transform') {
    node = createTransformNode(sceneGraph)
  } else if(descriptor.type == 'light') {
    throw 'not implemented'
  }
  node.name = descriptor.name
  if(descriptor.transform) {
    const transform = descriptor.transform
    if(transform.type == 'matrix') {
      node.transform = mat4.fromValues(...transform.values) as Mat4
    } else if(transform.type == 'trs') {
      const rotation = transform.rotation ?? [0, 0, 0, 1]
      const translation = transform.translation ?? [0, 0, 0]
      const scale = transform.scale ?? [1, 1, 1]
      mat4.fromRotationTranslationScale(node.transform, rotation, translation, scale)
    } else if(transform.type == 'globe') { 
      const translation = mat4.create()
      mat4.fromTranslation(translation, [0, transform.radius, 0])
      const direction = latLonToUnitVec(transform.coords.map(x => x*PI/180) as Vec2)
      const rotation = quat.create()
      quat.rotationTo(rotation, [0,1,0], direction)
      mat4.fromQuat(node.transform, rotation)
      mat4.mul(node.transform, node.transform, translation)
    }
  }
  if(descriptor.children) {
    for(let childDescriptor of descriptor.children) {
      const child = createNodeFromDescriptor(childDescriptor, sceneGraph)
      attachNode(child, node, sceneGraph)
    }
  }
  return node
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
  modelName: string,
  sceneGraph: SceneGraph): ModelNode {

  if(!(modelName in sceneGraph.models)) {
    throw new Error(`Model ${modelName} does not exist.`)
  }

  const { device, instanceAllocator } = sceneGraph.renderer
  const model = sceneGraph.models[modelName]

  const instanceId = addInstance(
    model.allocationId, 
    instanceDataBuffer, 
    device, 
    instanceAllocator,
    false,
  )
  
  const node: ModelNode = {
    nodeType:   'model',
    parent:     null,
    root:       null,
    transform:  mat4.create() as Mat4,
    children:   [],
    instanceId: instanceId,
    modelName:  modelName,
    drawCallId: model.drawCallId,
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
  }
  sceneGraph.nodes.push(node)
  if(view)
    view.camera = node
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

  const { instanceAllocator, meshStore, mainBindGroup } = sceneGraph.renderer
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
    bindGroup:       mainBindGroup,
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
 * If the parent node is not attached to the scene graph, this function merely
 * sets the parent and root properties of the node. If the parent node is
 * attached to the scene graph, this function also updates the model matrix
 * of the node and the associated draw call. This process is applied recursively
 * to all of the node's children.
 */
export function attachNode(
  node: Node,
  parent: Node,
  sceneGraph: SceneGraph): void {

  if(node.root)
    throw new Error('Node is already attached.')
  
  node.parent = parent
  parent.children.push(node)

  if(parent.root) {
      const transform: Mat4 = mat4.create() as Mat4
      let ancestor = parent
      while(ancestor) {
        mat4.mul(transform, ancestor.transform, transform)
        ancestor = ancestor.parent
      }
      setupNewlyAttachedNode(node, transform, sceneGraph)
    }
}

/** Recursively set up a node that has just been attached to the scene graph.
 * Both `parent` and `parent.root` must be set and `root` must not be set.
 * Model nodes will have their model matrices updated and instance counts 
 * incremented in their respective draw calls. A cumulative matrix transform
 * is passed down through the traversal, including all the ancestor
 * transformations before the node to be set up.
 */
function setupNewlyAttachedNode(node: Node, transform: Mat4, sceneGraph: SceneGraph): void {
  if(node.root || !node.parent || !node.parent.root)
    throw new Error('Invalid node attachment state.')
  node.root = node.parent.root
  mat4.mul(transform, transform, node.transform) // transform is now model matrix
  
  if(node.nodeType === 'model') { 
    const { instanceAllocator, device } = sceneGraph.renderer
    activateInstance(node.instanceId, instanceAllocator, device)
    //updateInstanceData(transform, node.instanceId, instanceAllocator, device)
    const drawCall = sceneGraph.drawCalls[node.drawCallId]
    drawCall.instanceCount++
  } else if(node.nodeType === 'camera' && node.view) {
    mat4.invert(node.view.viewMatrix, transform)
  }

  

  for(const child of node.children) {
    setupNewlyAttachedNode(child, mat4.clone(transform) as Mat4, sceneGraph)
  }
}

/** Set the transform of a node.
 * 
 * If the node is attached to the scene graph and the node is a model node,
 * this function also updates the model matrix of the node. This process is
 * applied recursively to all of the node's children.
 * 
 * TODO: consider caching the model matrix of each node to avoid recomputing
 * the ancestor transforms.
 */
export function setNodeTransform(node: Node, transform: Mat4, sceneGraph: SceneGraph): void {
  node.transform = mat4.clone(transform) as Mat4
  if(node.root) {
    const modelTransform: Mat4 = mat4.create() as Mat4
    let ancestor = node.parent
    while(ancestor) {
      mat4.mul(modelTransform, ancestor.transform, modelTransform)
      ancestor = ancestor.parent
    }
    updateNodeTransform(node, modelTransform, sceneGraph)
  }
}

/** Recursively update the model matrix of an attached node and its children.
 * The transform argument is the cumulative transform matrix of all the node's
 * ancestors.
 */
function updateNodeTransform(node: Node, transform: Mat4, sceneGraph: SceneGraph): void {
  mat4.mul(transform, transform, node.transform) // transform is now model matrix
  if(node.nodeType === 'model') {
    const { instanceAllocator, device } = sceneGraph.renderer
    //updateInstanceData(transform, node.instanceId, instanceAllocator, device)
  } else if(node.nodeType === 'camera' && node.view) {
    mat4.invert(node.view.viewMatrix, transform)
  }
  for(const child of node.children) {
    updateNodeTransform(child, mat4.clone(transform) as Mat4, sceneGraph)
  }
}

/** Detach a node from its parent.
 * 
 * If the node is attached to the scene graph, this function also updates the
 * instance counts of the associated draw calls. This process is applied
 * recursively to all of the node's children.
 * 
 * TODO: this is pretty inefficient
 */
export function detachNode(node: Node, sceneGraph: SceneGraph): void {
  if(!node.parent)
    throw new Error('Node is not attached to a parent node.')

  const parent = node.parent
  const index = parent.children.indexOf(node)
  if(index === -1)
    throw new Error('Scene graph integrity error: node is not a child of its parent.')
  parent.children.splice(index, 1)
  node.parent = null
  detachNodeFromRoot(node, sceneGraph)
}

/** Recursive detach a node and its children from the scene graph, without
 * detaching them from their immediate parents. Should only be called from
 * detachNode after a node that was attached to the scene graph has been
 * detached from its parent.
 */
function detachNodeFromRoot(node: Node, sceneGraph: SceneGraph): void {
  if(!node.root)
    throw new Error('Node is not attached to the scene graph.')

  node.root = null
  if(node.nodeType === 'model') {
    const { device, instanceAllocator } = sceneGraph.renderer
    deactivateInstance(node.instanceId, instanceAllocator, device)
    const drawCall = sceneGraph.drawCalls[node.drawCallId]
    drawCall.instanceCount--
  }
  for(const child of node.children) {
    detachNodeFromRoot(child, sceneGraph)
  }
}

/** Retrieve the first matching element, or null. */
export function getNodeByName(name: string, sceneGraph: SceneGraph): Node | null {
  return getNodeByName_(name, sceneGraph.root)
}

function getNodeByName_(name: string, node: Node): Node | null {
  if(node.name === name)
    return node
  for(const child of node.children) {
    const match = getNodeByName_(name, child)
    if(match !== null)
      return match
  }
  return null
}

/** Update the modelView matrices of all the model nodes in the scene graph. */
export function updateModelViews(view: View, sceneGraph: SceneGraph): void {
  const viewMatrix = getViewMatrix(view)
  view.viewMatrix = viewMatrix
  updateModelViews_(sceneGraph.root, mat4.create() as Mat4, viewMatrix, sceneGraph)
}

/** Internal recursive helper function for updateModelViews. */
function updateModelViews_(
    node: Node, 
    currentTransform: Mat4, 
    viewMatrix: Mat4,
    sceneGraph: SceneGraph): void {
  mat4.multiply(currentTransform, currentTransform, node.transform)
  if(node.nodeType === 'model') {
    let modelViewMatrix = mat4.create() as Mat4
    mat4.multiply(modelViewMatrix, viewMatrix, currentTransform)
    if(modelViewMatrix.some(x => x > 1000000)) {
      //console.warn(`WARNING: large numbers detected in modelview matrix. reprojecting...`)
      modelViewMatrix = checkProjection(modelViewMatrix, sceneGraph.views.default.projection)
      
    }
    instanceDataBufferF32.set(modelViewMatrix)
    const { instanceAllocator, device } = sceneGraph.renderer
    updateInstanceData(instanceDataBuffer, node.instanceId, instanceAllocator, device)
  }
  for(const child of node.children) {
    updateModelViews_(child, mat4.clone(currentTransform) as Mat4, viewMatrix, sceneGraph)
  }
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

