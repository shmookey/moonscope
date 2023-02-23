import type {
  CameraNode, DrawCallDescriptor, GPUContext, LightSourceNode,
  LightSourceNodeDescriptor, Mat4, Model, ModelNode, Node, NodeDescriptor,
  Quat, Renderer, Scene, SceneGraph, SceneGraphDescriptor, TransformDescriptor,
  TransformNode, Vec2, Vec3, Vec4, View, ProjectionDescriptor, DirtyFlag, MeshResource, BoundingVolume, MetaMaterial, ViewType
} from "./types"
import * as Skybox from './skybox.js'
import {createCamera, createFirstPersonCamera} from './camera.js'
import {mat4, quat, glMatrix, vec4, vec3} from 'gl-matrix'
import {activateInstance, addInstance, deactivateAllInstances, deactivateInstance, registerAllocation, setInstanceTransform, syncInstanceBuffers, updateInstanceData} from "./instance.js"
import {getMeshById, getMeshByName} from "./mesh.js"
import {DirtyFlags, INITIAL_DIRTY_FLAGS, UNIFORM_BUFFER_OFFSET_PROJECTION, UNIFORM_BUFFER_OFFSET_VIEW} from "./constants.js"
import {createBoundingVolume, expandBoundingVolume, frustumTest, identityMatrix, latLonToUnitVec, resetBoundingVolume, transformedBoundingVolume} from "./common.js"
import {createGeometryBindGroup, createMaterialsBindGroup, createMainUniformBuffer} from "./pipeline.js"
import {activateLightSource, applyLightSourceDescriptor, applyLightSourceTransformMatrix, createLightingState, createLightSource, deactivateLightSource, updateLightingBuffer} from "./lighting.js"
import { useMaterialByName } from "./material.js"
import { calculateDirectionalLightMatrices, calculateLightProjection, createShadowMap, getShadowMap, updateShadowMap } from "./shadow.js"
import { RatiteError } from "./error.js"
const { PI } = Math
glMatrix.setMatrixArrayType(Array)

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
  let nextNodeID = 0
  const uniformBuffer = createMainUniformBuffer(renderer.device)
  const uniformData = new ArrayBuffer(uniformBuffer.size)
  const lightingState = createLightingState(lightSourceCapacity, renderer.device)
  const geometryBindGroup = createGeometryBindGroup(
    uniformBuffer,
    renderer.instanceAllocator.storageBuffer,
    lightingState.buffer,
    renderer.pipelineLayouts,
    renderer.device)
  const materialsBindGroup = createMaterialsBindGroup(
      renderer.materials.buffer,
      renderer.atlas,
      renderer.mainSampler,
      renderer.pipelineLayouts,
      renderer.device)
  const rootNode: TransformNode = {
    id:              nextNodeID++,
    nodeType:        'transform',
    name:            'root',
    transform:       mat4.create() as Mat4,
    parent:          null,
    root:            null,
    children:        [],
    hidden:          false,
    dirty:           INITIAL_DIRTY_FLAGS,
    cullable:        false,
    _worldTransform: mat4.create() as Mat4,
    _modelView:      mat4.create() as Mat4,
    _inFrustum:      true,
    _boundingVolume: {
      min: vec3.create() as Vec3,
      max: vec3.create() as Vec3,
    },
  }
  rootNode.root = rootNode
  return {
    label:              label,
    renderer:           renderer,
    nextNodeId:         nextNodeID,
    root:               rootNode,
    nodes:              [],
    forwardDrawCalls:   [],
    depthPassDrawCalls: [],
    models:             {},
    nextDrawCallId:     0,
    views:              {},
    uniformBuffer:      uniformBuffer,
    uniformData:        uniformData,
    uniformFloats:      new Float32Array(uniformData),
    uniformView:        new DataView(uniformData),
    lightingState:      lightingState,
    geometryBindGroup:  geometryBindGroup,
    materialsBindGroup: materialsBindGroup,
    activeView:         null,
    activeCamera:       null,
    geometricNodes:     [],
  }
}

/** Create a scene from a descriptor. */
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
        modelDescriptor.metaMaterial,
        modelDescriptor.maxInstances,
        sceneGraph)
  }
  if(descriptor.views) {
    for(let viewDescriptor of descriptor.views) {
      const frustumTest = 'frustumTest' in viewDescriptor ? viewDescriptor.frustumTest : true
      const view = createSceneView(
        viewDescriptor.name, 
        viewDescriptor.type,
        frustumTest,
        sceneGraph,
        viewDescriptor.projection, 
      )
      //if(viewDescriptor.active === true) {
      //  if(sceneGraph.activeView)
      //    throw new RatiteError('InvalidArgument', `Descriptor for scene graph ${sceneGraph.label} has multiple active views.`)
      //  sceneGraph.activeView = view
      //  view.active = true
      //}
    }
  }
  if(descriptor.root) {
    const root = createNodeFromDescriptor(descriptor.root, sceneGraph)
    attachNode(root, sceneGraph.root, sceneGraph)
    sceneGraph.root = root
    root.name       = 'root'
    root.root       = root
    root.parent     = null
  }
  if(descriptor.defaultCamera) {
    const node = getNodeByName(descriptor.defaultCamera, sceneGraph)
    if(!node)
      throw new RatiteError('NotFound', `Descriptor for scene graph ${sceneGraph.label} specifies default camera ${descriptor.defaultCamera} which does not exist.`)
    if(node.nodeType != 'camera')
      throw new RatiteError('InvalidArgument', `Descriptor for scene graph ${sceneGraph.label} specifies default camera ${descriptor.defaultCamera} which is not a camera node.`)
    setSceneCamera(node.view, sceneGraph)
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
  if('hidden' in descriptor)
    setNodeHidden(descriptor.hidden, node, sceneGraph)
  if('cullable' in descriptor)
    node.cullable = descriptor.cullable
  return node
}

/** Hide or un-hide a node.
 * 
 * A hidden node and its children are not drawn and their state is not updated
 * during the scene graph update. Hidden light sources are disabled and do not
 * participate in lighting calculations.
 */
export function setNodeHidden(isHidden: boolean, node: Node, sceneGraph: SceneGraph): void {
  if(node.hidden === isHidden) return
  node.hidden = isHidden
  if(node.root)
    _updateLightActivation(!isHidden, node, sceneGraph)
}

/** Internal recursive helper function for `setNodeHidden` and others.
 * 
 * This function just activates and deactivates light sources. Model visibility
 * is determined separately in the scene graph update.
 */
function _updateLightActivation(activate: boolean, node: Node, scene: SceneGraph): void {
  if(node.nodeType === 'light') {
    if(activate)
      activateLightSource(node.lightSource.id, scene.lightingState)
    else
      deactivateLightSource(node.lightSource.id, scene.lightingState)
  }
  for(let child of node.children)
    _updateLightActivation(activate, child, scene)
}

/** Set the transform of a node, overwriting any previous transform. */
export function setTransform(transform: TransformDescriptor, node: Node): void {
  computeMatrix(transform, node.transform)
  setDirty(DirtyFlags.ALL, node)
} 

/** Set the translation component of a node's transform matrix. */
export function setTranslation(translation: Vec3, node: Node): void {
  node.transform[12] = translation[0]
  node.transform[13] = translation[1]
  node.transform[14] = translation[2]
  setDirty(DirtyFlags.ALL, node)
}

const applyTransform_tempMat4: Mat4 = mat4.create() as Mat4

/** Apply a transformation `A` to a node's existing transform matrix `B` by the matrix multiplication `B*A`. */
export function applyTransform(transform: TransformDescriptor, node: Node): void {
  const initial = node.transform
  const matrix = computeMatrix(transform, applyTransform_tempMat4)
  mat4.multiply(node.transform, initial, matrix)
  setDirty(DirtyFlags.ALL, node)
}

const applyPreTransform_tempMat4: Mat4 = mat4.create() as Mat4

/** Apply a transformation `A` to a node's existing transform matrix `B` by the matrix multiplication `A*B`. */
export function applyPreTransform(transform: TransformDescriptor, node: Node): void {
  const initial = node.transform
  const matrix = computeMatrix(transform, applyPreTransform_tempMat4)
  mat4.multiply(node.transform, matrix, initial)
  setDirty(DirtyFlags.ALL, node)
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
    if('rotateQuat' in transform && 'rotateEuler' in transform)
      throw new RatiteError('InvalidArgument', 'Transform descriptors must not specify both a quaternion and euler rotation.')
    const rotation: Vec4 = transform.rotateQuat ?? 
      ('rotateEuler' in transform ? quat.fromEuler([0,0,0,0], ...transform.rotateEuler) as Quat : [0,0,0,1])

    return mat4.fromRotationTranslationScale(out, 
      rotation, 
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
    // TODO: clone light source
    break
  }
  const clone = createNodeFromDescriptor(descriptor, sceneGraph)
  for(let child of node.children) {
    attachNode(cloneNode(child, sceneGraph), clone, sceneGraph)
  }
  setDirty(DirtyFlags.ALL, clone)
  return clone
}


/** Create a view. */
export function createSceneView(
    name:                  string, 
    type:                  ViewType,
    frustumTest:           boolean,
    sceneGraph:            SceneGraph,
    projectionDescriptor?: ProjectionDescriptor, 
    ): View {
  if(name in sceneGraph.views) {
    throw new Error(`View ${name} already exists.`)
  }
  const view: View = {
    name:         name,
    type:         type,
    projection:   mat4.create() as Mat4,
    viewMatrix:   mat4.create() as Mat4,
    node:         null,
    shadowMapId:  null,
    //active:       false,
    frustumTest:  frustumTest,
    frustumNodes: [],
  }
  if(!projectionDescriptor) {
    // TODO: worth getting this from the light source now?
  } else if(projectionDescriptor.type === 'perspective') {
    const aspect = projectionDescriptor.aspect == 'auto' 
                 ? sceneGraph.renderer.context.aspect
                 : projectionDescriptor.aspect
    const far: number = projectionDescriptor.far === 'Infinity' ? Infinity : projectionDescriptor.far
    mat4.perspectiveZO(
      view.projection,
      projectionDescriptor.fovy * PI/180,
      aspect,
      projectionDescriptor.near,
      far,
    )
  } else if(projectionDescriptor.type === 'orthographic') {
    mat4.ortho(
      view.projection,
      projectionDescriptor.left,
      projectionDescriptor.right,
      projectionDescriptor.bottom,
      projectionDescriptor.top,
      projectionDescriptor.near,
      projectionDescriptor.far,
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

  const { instanceAllocator, meshStore, materials } = sceneGraph.renderer
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
    instanceAllocator,
    false,
  )
  
  const node: ModelNode = {
    nodeType:        'model',
    id:              sceneGraph.nextNodeId++,
    parent:          null,
    root:            null,
    transform:       mat4.create() as Mat4,
    children:        [],
    instanceId:      instanceId,
    modelName:       modelName,
    drawCallId:      model.drawCallId,
    hidden:          false,
    material:        materialName,
    _instanceData:   instanceData,
    dirty:           INITIAL_DIRTY_FLAGS,
    cullable:        true,
    _worldTransform: mat4.create() as Mat4,
    _modelView:      mat4.create() as Mat4,
    _inFrustum:      true,
    _boundingVolume: {
      min: vec3.create() as Vec3,
      max: vec3.create() as Vec3,
    },

  }
  sceneGraph.nodes.push(node)
  return node
}

/** Create a camera node. */
export function createCameraNode(viewName: string | null, sceneGraph: SceneGraph): Node {
  let view: View | null = null
  if(viewName !== null) {
    if(!(viewName in sceneGraph.views)) {
      throw new Error(`View ${viewName} does not exist.`)
    }
    view = sceneGraph.views[viewName]
    if(view.node !== null) {
      throw new Error(`View ${viewName} is already in use.`)
    }
  }
  const node: CameraNode = {
    nodeType:        'camera',
    id:              sceneGraph.nextNodeId++,
    parent:          null,
    root:            null,
    transform:       mat4.create() as Mat4,
    children:        [],
    view:            view,
    hidden:          false,
    dirty:           INITIAL_DIRTY_FLAGS,
    cullable:        true,
    _worldTransform: mat4.create() as Mat4,
    _modelView:      mat4.create() as Mat4,
    _inFrustum:      true,
    _boundingVolume: {
      min: vec3.create() as Vec3,
      max: vec3.create() as Vec3,
    },
  }
  sceneGraph.nodes.push(node)
  if(view)
    view.node = node
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

  let view: View | null = null
  let viewName = descriptor.view
  if(viewName) {
    if(!(viewName in sceneGraph.views)) {
      throw new RatiteError('NotFound', `View ${viewName} does not exist.`)
    }
    view = sceneGraph.views[viewName]
    if(view.node !== null) {
      throw new RatiteError('ResourceBusy', `View ${viewName} is already in use.`)
    }
  }

  const node: LightSourceNode = {
    nodeType:        'light',
    id:              sceneGraph.nextNodeId++,
    parent:          null,
    root:            null,
    transform:       mat4.create() as Mat4,
    children:        [],
    lightSource:     lightSource,
    hidden:          false,
    makeShadows:     descriptor.makeShadows || false,
    view:            view,
    dirty:           INITIAL_DIRTY_FLAGS,
    cullable:        true,
    _worldTransform: mat4.create() as Mat4,
    _modelView:      mat4.create() as Mat4,
    _inFrustum:      true,
    _boundingVolume: {
      min: vec3.create() as Vec3,
      max: vec3.create() as Vec3,
    },
  }

  sceneGraph.nodes.push(node)
  if(view) {
    view.node = node
  }
  if(descriptor.makeShadows && view) {
    const shadowMap = createShadowMap(lightSource, sceneGraph.renderer.shadowMapper)
    view.shadowMapId = shadowMap.id
    calculateLightProjection(lightSource, view.projection)
  }
  return node
}

/** Create a transform node. */
export function createTransformNode(sceneGraph: SceneGraph): Node {
  const node: TransformNode = {
    nodeType:        'transform',
    id:              sceneGraph.nextNodeId++,
    parent:          null,
    root:            null,
    transform:       mat4.create() as Mat4,
    children:        [],
    hidden:          false,
    dirty:           INITIAL_DIRTY_FLAGS,
    cullable:        true,
    _worldTransform: mat4.create() as Mat4,
    _modelView:      mat4.create() as Mat4,
    _inFrustum:      true,
    _boundingVolume: {
      min: vec3.create() as Vec3,
      max: vec3.create() as Vec3,
    },
  }
  sceneGraph.nodes.push(node)
  return node
}

/** Register a model with the scene graph. */
export function registerSceneGraphModel(
    name:             string,
    meshName:         string,
    pipelineName:     string,
    metaMaterialName: string,
    maxInstances:     number,
    sceneGraph:       SceneGraph): void {

  const { instanceAllocator, meshStore } = sceneGraph.renderer
  const allocationId = registerAllocation(maxInstances, instanceAllocator)
  const allocation = instanceAllocator.allocations[allocationId]
  const mesh = getMeshByName(meshName, meshStore)
  const drawCallId = sceneGraph.nextDrawCallId
  const metaMaterial = sceneGraph.renderer.metaMaterials.metaMaterials.get(metaMaterialName)
  if(!metaMaterial)
    throw new RatiteError('NotFound', `Invalid meta-material: ${metaMaterialName}`)
  const model: Model = { 
    id: 0, 
    name, 
    meshId: mesh.id, 
    allocationId,
    drawCallId,
    pipelineName,
    metaMaterial,
  }
  const forwardDrawCall: DrawCallDescriptor = {
    id:              drawCallId,
    label:           `SceneGraph[${sceneGraph.label}]::DrawCall#${drawCallId}[${name}]`,
    vertexBuffer:    meshStore.vertexBuffer,
    vertexPointer:   mesh.vertexPointer,
    vertexCount:     mesh.vertexCount,
    instanceBuffer:  instanceAllocator.instanceBuffer,
    instancePointer: allocation.instanceIndex * 4,
    instanceCount:   0,
    pipeline:        metaMaterial.pipelines.forward,
    indexPointer:    mesh.indexPointer,
    indexBuffer:     meshStore.indexBuffer,
    indexOffset:     mesh.indexOffset,
    indexCount:      mesh.indexCount,
    bindGroups: [
      sceneGraph.geometryBindGroup, 
      sceneGraph.materialsBindGroup,
      sceneGraph.renderer.shadowMapper.bindGroup,
    ],
    metaMaterial:    metaMaterial,
  }
  
  sceneGraph.nextDrawCallId++
  sceneGraph.models[name] = model
  sceneGraph.forwardDrawCalls.push(forwardDrawCall)
}

/** Attach a node to a parent node.
 * 
 * The attachment process is as follows:
 * 1. Set the node's parent property to the parent.
 * 2. Add the node to the parent's children list.
 * 3. Mark the node as dirty.
 * 4. If the parent's root property is null, return.
 * 5. Recursively update the root for the node subtree.
 * 6. If any ancestor node is hidden, return.
 * 7. Recursively activate lights in the node subtree.
 */
export function attachNode(
  node:       Node,
  parent:     Node,
  sceneGraph: SceneGraph): void {

  if(node.root)
    throw new Error('Node is already attached.')
  
  node.parent = parent
  parent.children.push(node)

  setDirty(DirtyFlags.ALL, node)

  if(!parent.root)
    return

  walkSubtree(n => n.root = parent.root, node)

  if(!isNodeVisible(node))
    return

  _updateLightActivation(true, node, sceneGraph)
}

/** Detach a node from its parent.
 * 
 * If the node is attached to the scene graph, the whole node subtree has its
 * root property reset to null. If the node is visible, the whole node subtree
 * is deactivated for drawing. The enitre subtree is marked dirty.
 */
export function detachNode(node: Node, sceneGraph: SceneGraph): void {
  if(!node.parent)
    throw new Error('Node is not attached to a parent node.')

  setDirty(DirtyFlags.ALL, node, false)

  const parent = node.parent
  // Remove parent/child relationship
  const index = parent.children.indexOf(node)
  if(index === -1)
    throw new Error('Scene graph integrity error: node is not a child of its parent.')
  parent.children.splice(index, 1)
  node.parent = null
  
  if(!node.root)
    return
  
  if(isNodeVisible(node))
    _updateLightActivation(false, node, sceneGraph)

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
 * A node is visible if it is attached to the scene, its `hidden` property is
 * false, and all of its ancestors are visible.
 */
export function isNodeVisible(node: Node): boolean {
  if(!node.root) return false
  for(let ancestor = node; ancestor; ancestor = ancestor.parent)
    if(ancestor.hidden) return false
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

/** Prepare for rendering a framem.
 * 
 * Updates world-space transforms, bounding volumes, performs frustum tests for
 * the currently active camera, and updates draw call lists.
 */
export function prepareFrame(scene: SceneGraph): void {
  updateWorldTransforms(scene.root, scene)
  updateBoundingVolumes(scene.root, scene)
  updateFrustumTests(scene.root, scene)
  updateDrawCalls(scene)
}

/** Prepare for rendering a forward pass of the current frame. */
export function prepareForwardRender(scene: SceneGraph): void {
  const view = scene.activeView
  updateModelViews(scene.root, scene)
  scene.uniformFloats.set(view.viewMatrix, UNIFORM_BUFFER_OFFSET_VIEW / 4)
  scene.uniformFloats.set(view.projection, UNIFORM_BUFFER_OFFSET_PROJECTION / 4)
  scene.renderer.device.queue.writeBuffer(scene.uniformBuffer, 0, scene.uniformData)
  syncInstanceBuffers(scene.renderer.instanceAllocator, scene.renderer.device)
  updateLightingBuffer(scene.lightingState)
}

/** Prepare for rendering a depth (shadow) pass for the current frame.
 * 
 * The active view must have a shadow map attached.
 */
export function prepareShadowRender(scene: SceneGraph): void {
  const view = scene.activeView
  if(view.shadowMapId === null)
    throw new RatiteError('InvalidOperation', 'No shadow map attached to active view.')

  
  
  //const lightWorldPos = getNodePosition(view.node, scene)
  const shadowMap = getShadowMap(view.shadowMapId, scene.renderer.shadowMapper)
  const light = shadowMap.lightSource
  if(light.type === 'directional') {
    const region = getShadowCasterBounds(scene.activeCamera, scene)
    //mat4.lookAt(view.viewMatrix, lightWorldPos, [0,0,0], [0,1,0]) as Mat4
    calculateDirectionalLightMatrices(region, light.direction, view.viewMatrix, view.projection)
  }
  updateModelViews(scene.root, scene)
  const cameraViewMatrix = scene.activeCamera.viewMatrix.slice() as Mat4

  mat4.invert(cameraViewMatrix, cameraViewMatrix)
  mat4.mul(shadowMap._matrix, view.viewMatrix, cameraViewMatrix)
  mat4.mul(shadowMap._matrix, view.projection, shadowMap._matrix)

  updateShadowMap(shadowMap, scene.renderer.shadowMapper)

  scene.uniformFloats.set(view.viewMatrix, UNIFORM_BUFFER_OFFSET_VIEW / 4)
  scene.uniformFloats.set(view.projection, UNIFORM_BUFFER_OFFSET_PROJECTION / 4)
  
  scene.renderer.device.queue.writeBuffer(scene.uniformBuffer, 0, scene.uniformData)
  syncInstanceBuffers(scene.renderer.instanceAllocator, scene.renderer.device)
  updateLightingBuffer(scene.lightingState)
}

/** Set the scene's active view. */
export function setSceneView(view: View, sceneGraph: SceneGraph): void {
  if(view === sceneGraph.activeView)
    return
  //sceneGraph.activeView.active = false
  sceneGraph.activeView = view
  //view.active = true
  setDirty(DirtyFlags.MODEL_VIEW_MATRIX, sceneGraph.root)
}

/** Set the camera view for the scene.
 * 
 * This does not make the camera the active view for rendering. To do that,
 * use `setSceneView()`.
 */
export function setSceneCamera(view: View, scene: SceneGraph): void {
  if(view.node.nodeType !== 'camera')
    throw new RatiteError('InvalidArgument', 'Node is not a camera.')
  scene.activeCamera = view
}

/** Calculate the model matrix for a node. */
export function getModelMatrix(node: Node, scene: SceneGraph): Mat4 {
  if(isDirty(DirtyFlags.WORLD_TRANSFORM, node)) {
    console.warn('Early world transform update triggered by getModelMatrix()')
    updateWorldTransforms(node, scene)
  }
  return node._worldTransform
}

/** Calculate the view matrix for a view. */
export function getViewMatrix(view: View, scene: SceneGraph): Mat4 {
  if(!view.node)
    throw new Error('View is not attached to a camera or light node.')
  const cameraModelMatrix = getModelMatrix(view.node, scene)
  mat4.invert(cameraModelMatrix, cameraModelMatrix)
  return cameraModelMatrix
}

/** Calculate the model-view matrix for a node. */
export function getModelViewMatrix(node: Node, view: View, scene: SceneGraph, out: Mat4 = mat4.create() as Mat4): Mat4 {
  const modelMatrix = getModelMatrix(node, scene)
  const viewMatrix = getViewMatrix(view, scene)
  mat4.multiply(out, viewMatrix, modelMatrix)
  return out 
}

/** Calculate the position of a node in world space. */
export function getNodePosition(node: Node, scene: SceneGraph): Vec3 {
  const modelMatrix = getModelMatrix(node, scene)
  return [modelMatrix[12], modelMatrix[13], modelMatrix[14]]
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

/** Clear a dirty flag on a node. */
export function clearDirty(flag: DirtyFlag, node: Node): void {
  node.dirty &= ~flag
}

/** Set a dirty flag on a node.
 * 
 * This will also set the dirty flag on all ancestors and optionally on all
 * descendants. It will also optionally set other dirty flags, according to the
 * following rules:
 * 
 *   1. If the world transform is dirty, the model-view matrix is dirty.
 *   2. If the model-view matrix is dirty, the frustum test result is dirty.
 */
export function setDirty(flag: DirtyFlag, node: Node, propagate: boolean = true): void {
  node.dirty |= flag | (flag & DirtyFlags.WORLD_TRANSFORM) << 1
  //node.dirty |= flag | (flag & DirtyFlags.MODEL_VIEW_MATRIX) << 2 // TODO: this is not correct
  if(propagate)
    for(const child of node.children)
      setDirty(flag, child)
  let ancestor = node.parent
  while(ancestor) {
    ancestor.dirty |= flag
    ancestor = ancestor.parent
  }
}

/** Check if a node has a dirty flag set. */
export function isDirty(flag: DirtyFlag, node: Node): boolean {
  return (node.dirty & flag) === flag
}

/** Get the topmost ancestor of a node.
 * 
 * For nodes attached to the scene graph, this is the scene root.
 */
export function getRoot(node: Node): Node {
  if(node.root)
    return node.root
  else if(!node.parent)
    return node
  else
    return getRoot(node.parent)
}

/** Get the mesh of a model node. */
export function getMesh(node: ModelNode, scene: SceneGraph): MeshResource {
  const model = getModel(node, scene)
  const mesh = getMeshById(model.meshId, scene.renderer.meshStore)
  if(!mesh)
    throw new RatiteError('NotFound', `Mesh ${model.meshId} not found`)
  return mesh
}

/** Get the model of a model node. */
export function getModel(node: ModelNode, scene: SceneGraph): Model {
  const model = scene.models[node.modelName]
  if(!model)
    throw new RatiteError('NotFound', `Model ${node.modelName} not found`)
  return model
}

/** Get the meta-material of a model node. */
export function getNodeMetaMaterial(node: ModelNode, scene: SceneGraph): MetaMaterial {
  const model = getModel(node, scene)
  return model.metaMaterial
}

/** Calculate the bounding volume of visible shadow casters for a view.
 * 
 * Assumes that the bounding volumes of all nodes are up to date, since they
 * are being taken from the frustum nodes.
 */
export function getShadowCasterBounds(
    view:  View,
    scene: SceneGraph, 
    out:   BoundingVolume = createBoundingVolume()): BoundingVolume {

  // Reset the bounding volume
  resetBoundingVolume(out)

  // Add the bounding volume of each shadow caster
  for(const node of view.frustumNodes) {
    const metaMaterial = getNodeMetaMaterial(node, scene)
    if(!metaMaterial.castShadows)
      continue
    expandBoundingVolume(out, node._boundingVolume)
  }

  return out
}


/** Update dirty world transform matrices.
 * 
 * Calling this function updates the world transform matrices for the entire
 * tree starting at the topmost ancestor of the node, excluding hidden nodes
 * and nodes not marked as dirty.
 * 
 * If a camera or light node attached to a view is updated, the view matrix for
 * it will be updated. If the node is attached to the active view, the model-
 * view matrix will be marked as dirty for all nodes.
 */
export function updateWorldTransforms(node: Node, scene: SceneGraph): void {
  const root = getRoot(node)
  _updateWorldTransforms(root, identityMatrix, scene)
}

/** Internal helper function for updateWorldTransforms. */
function _updateWorldTransforms(node: Node, current: Mat4, scene: SceneGraph): void {
  if(!isDirty(DirtyFlags.WORLD_TRANSFORM, node) || node.hidden)
    return
  mat4.multiply(node._worldTransform, current, node.transform)
  for(const child of node.children)
    _updateWorldTransforms(child, node._worldTransform, scene)
  clearDirty(DirtyFlags.WORLD_TRANSFORM, node)

  if((node.nodeType === 'camera' || node.nodeType === 'light') && node.view) {
    mat4.invert(node.view.viewMatrix, node._worldTransform)
    if(scene.activeView === node.view)
      setDirty(DirtyFlags.MODEL_VIEW_MATRIX, node.root)
  }
}

/** Update dirty bounding volumes.
 * 
 * Calling this function updates the bounding volumes for the entire tree
 * starting at the topmost ancestor of the node, excluding hidden nodes and
 * nodes not marked as dirty.
 * 
 * The tree should be updated for world transforms before calling this
 * function, otherwise a world transform update will be triggered.
 */
export function updateBoundingVolumes(node: Node, scene: SceneGraph): void {
  const root = getRoot(node)
  if(isDirty(DirtyFlags.WORLD_TRANSFORM, root)) {
    console.warn('Early world transform update triggered by updateBoundingVolume()')
    updateWorldTransforms(root, scene)
  }
  _updateBoundingVolumes(root, scene)
}

/** Internal helper function for updateBoundingVolumes. */
function _updateBoundingVolumes(node: Node, scene: SceneGraph): void {
  if(!isDirty(DirtyFlags.BOUNDING_VOLUME, node) || node.hidden)
    return
  
  if(node.nodeType === 'model') {
    const mesh = getMesh(node, scene)
    transformedBoundingVolume(mesh.boundingVolume, node._worldTransform, node._boundingVolume)
  } else {
    resetBoundingVolume(node._boundingVolume)
  }

  for(const child of node.children) {
    _updateBoundingVolumes(child, scene)
    expandBoundingVolume(node._boundingVolume, child._boundingVolume)
  }

  clearDirty(DirtyFlags.BOUNDING_VOLUME, node)
}

/** Update model view matrices.
 * 
 * For models and lights, their respective subsystems will be updated.
 */
export function updateModelViews(root: Node, scene: SceneGraph): void {
  if(!scene.activeView)
    throw new RatiteError('InvalidOperation', 'No active view')
  if(!isDirty(DirtyFlags.MODEL_VIEW_MATRIX, root))
    return
  if(isDirty(DirtyFlags.WORLD_TRANSFORM, root)) {
    console.warn('Early world transform update triggered by setModelViewMatrices()')
    updateWorldTransforms(root, scene)
  }
  _updateModelViews(scene.activeView.viewMatrix, root, scene)
}

/** Internal helper function for setModelViewMatrices. */
function _updateModelViews(viewMatrix: Mat4, node: Node, scene: SceneGraph): void {
  if(!isDirty(DirtyFlags.MODEL_VIEW_MATRIX, node) || node.hidden)
    return
  mat4.mul(node._modelView, viewMatrix, node._worldTransform)

  switch(node.nodeType) {
  case 'model':
    setInstanceTransform(node._modelView, node.instanceId, scene.renderer.instanceAllocator)
    break
  case 'light':
    applyLightSourceTransformMatrix(node._modelView, node.lightSource.id, scene.lightingState)
    break
  }

  for(const child of node.children) {
    _updateModelViews(viewMatrix, child, scene)
  }
  clearDirty(DirtyFlags.MODEL_VIEW_MATRIX, node)
}

const tmpMat4_updateFrustumTests = mat4.create() as Mat4

/** Update frustum test results.
 * 
 * Frustum testing checks if the bounding box of a node intersects the view
 * frustum. If a node is outside the frustum, it and all its children will be
 * marked for culling. The frustum test is skipped for hidden nodes and nodes
 * not marked as dirty.
 * 
 * The scene's frustumModelNodes list is cleared and then populated with all of
 * the model nodes that are inside the frustum.
 */
export function updateFrustumTests(root: Node, scene: SceneGraph): void {
  if(!scene.activeView)
    throw new RatiteError('InvalidOperation', 'No active view')
  if(!isDirty(DirtyFlags.FRUSTUM_TEST, root))
    return
  if(isDirty(DirtyFlags.BOUNDING_VOLUME, root)) {
    console.warn('Early bounding volume update triggered by updateFrustumTests()')
    updateWorldTransforms(root, scene)
    updateBoundingVolumes(root, scene)
  }
  // Calculate the view-projection matrix
  mat4.mul(tmpMat4_updateFrustumTests, scene.activeCamera.projection, scene.activeCamera.viewMatrix)
  // Clear the frustum nodes list
  scene.activeView.frustumNodes.length = 0
  _updateFrustumTests(tmpMat4_updateFrustumTests, root, scene)
}

/** Internal helper function for updateFrustumTests. */
function _updateFrustumTests(viewProjection: Mat4, node: Node, scene: SceneGraph): void {
  if(!isDirty(DirtyFlags.FRUSTUM_TEST, node) || node.hidden)
    return
  node._inFrustum = node.cullable ? frustumTest(node._boundingVolume, viewProjection) : true
  if(!node._inFrustum) {
    frustumCull(node)
    return
  }
  if(node.nodeType === 'model')
    scene.activeView.frustumNodes.push(node)
  for(const child of node.children)
    _updateFrustumTests(viewProjection, child, scene)
  clearDirty(DirtyFlags.FRUSTUM_TEST, node)
}
  
/** Mark a node and all its children as outside the frustum. */
function frustumCull(node: Node): void {
  node._inFrustum = false
  for(const child of node.children)
    frustumCull(child)
  clearDirty(DirtyFlags.FRUSTUM_TEST, node)
}

/** Update draw calls for instances currently in the active view frustum. */
export function updateDrawCalls(scene: SceneGraph): void {
  // Clear the active instances and lights
  deactivateAllInstances(scene.renderer.instanceAllocator)
  // Clear the draw call instance counts
  for(const drawCall of scene.forwardDrawCalls)
    drawCall.instanceCount = 0
  // Activate the instances for the models in the frustum
  for(const node of scene.activeView.frustumNodes) {
    activateInstance(node.instanceId, scene.renderer.instanceAllocator)
    scene.forwardDrawCalls[node.drawCallId].instanceCount++
  }
}

