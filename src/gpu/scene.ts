import type {GPUContext} from "./gpu.js"
import type {Camera, CameraNode, DrawCallDescriptor, FirstPersonCamera, Mat4, ModelNode, Node, Renderer, Scene, SceneGraph, TransformNode, View, ViewDescriptor} from "./types"
import * as Skybox from './skybox.js'
import {createCamera, createFirstPersonCamera, getCameraViewMatrix} from './camera.js'
import { mat4 } from 'gl-matrix'
import {activateInstance, addInstance, deactivateInstance, registerAllocation, updateInstanceData} from "./instance.js"
import {getMeshByName} from "./mesh.js"
import {INSTANCE_BLOCK_SIZE} from "./constants.js"

const defaultTransform: Mat4 = mat4.create() as Mat4
const defaultInstancecData = new Float32Array(INSTANCE_BLOCK_SIZE/4)
defaultInstancecData.set(defaultTransform)

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
    label:     'root',
    transform: defaultTransform,
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
    mat4.perspectiveZO(
      view.projection,
      descriptor.fovy,
      descriptor.aspect,
      descriptor.near,
      descriptor.far,
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
    defaultInstancecData, 
    device, 
    instanceAllocator,
    false,
  )
  
  const node: ModelNode = {
    nodeType:   'model',
    parent:     null,
    root:       null,
    transform:  defaultTransform,
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
    transform:  defaultTransform,
    children:   [],
    view:       view,
  }
  sceneGraph.nodes.push(node)
  if(view)
    view.camera = node
  return node
}


/** Register a model with the scene graph. */
export function registerSceneGraphModel(
    name: string,
    meshName: string,
    maxInstances: number,
    sceneGraph: SceneGraph): void {

  const { instanceAllocator, meshStore, mainBindGroup, mainPipeline } = sceneGraph.renderer
  const allocationId = registerAllocation(maxInstances, instanceAllocator)
  const allocation = instanceAllocator.allocations[allocationId]
  const mesh = getMeshByName(meshName, meshStore)
  const drawCallId = sceneGraph.nextDrawCallId
  const model = { 
    id: 0, 
    name, 
    meshId: mesh.id, 
    allocationId,
    drawCallId,
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
    pipeline:        mainPipeline,
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

  mat4.mul(transform, node.transform, transform) // transform is now model matrix

  if(node.nodeType === 'model') { 
    const { instanceAllocator, device } = sceneGraph.renderer
    updateInstanceData(transform, node.instanceId, instanceAllocator, device)
    activateInstance(node.instanceId, instanceAllocator, device)
    const drawCall = sceneGraph.drawCalls[node.drawCallId]
    drawCall.instanceCount++
  } else if(node.nodeType === 'camera' && node.view) {
    mat4.invert(node.view.viewMatrix, transform)
  }

  node.root = node.parent.root

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
  mat4.mul(transform, node.transform, transform) // transform is now model matrix
  if(node.nodeType === 'model') {
    const { instanceAllocator, device } = sceneGraph.renderer
    updateInstanceData(transform, node.instanceId, instanceAllocator, device)
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

export function renderSceneGraph() {
}
