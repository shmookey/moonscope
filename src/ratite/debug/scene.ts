/** Scene graph inspector. */

import { vec4, glMatrix, vec3 } from 'gl-matrix'
import type { BoundingVolume, Mat4, Node, Vec3 } from '../types'
import { InspectorAgent, createPropMatrixRow, createPropRow, createPropTableLabelRow, createPropVec3Row, createViewPropRow } from './common.js'
import { createElement } from './common.js'
import { getTransformedBoundingVolume, isNullBoundingVolume } from '../common.js'
import { InspectorState } from './ui.js'
glMatrix.setMatrixArrayType(Array)

/** Scene inspector state. */
export interface SceneInspectorState {
  selectedNode:   Node | null,
  selectedNodeId: number | null,
  elements:       SceneInspectorElements,
  active:         boolean,
  agent:          InspectorAgent,
  propsActive:    boolean, // Is the properties panel active?
  nodes:          Node[], // All nodes indexed by id
  listItems:      Map<number, HTMLElement>, // All list items indexed by node id
  context:        InspectorState,
}

/** Scene inspector elements. */
export interface SceneInspectorElements {
  parent:     HTMLElement,  // Outer container
  container:  HTMLElement,  // Inner container
  list:       HTMLElement,  // Node list
  properties: HTMLElement,  // Node properties
  propTable:  HTMLElement,  // Node properties table
}

const sceneInspectorHTML = `
  <div class="ri-scene-inspector-list ri-entity-list"></div>
  <div class="ri-scene-inspector-properties ri-properties-pane">
    <div class="ri-properties-pane-header">Node properties</div>
    <div class="ri-scene-inspector-properties-table ri-properties-table">
    </div>
  </div>
`

/** Create the scene graph viewer. */
export function createSceneInspector(parentElement: HTMLElement, agent: InspectorAgent, context: InspectorState): SceneInspectorState {
  const container = createElement('div', 'ri-scene-inspector')
  container.innerHTML = sceneInspectorHTML
  const state: SceneInspectorState = {
    selectedNode:   null,
    selectedNodeId: null,
    active:         false,
    propsActive:    false,
    agent:          agent,
    nodes:          [],
    listItems:      new Map(),
    context:        context,
    elements: {
      parent:       parentElement,
      container:    container,
      list:         container.querySelector('.ri-scene-inspector-list')             as HTMLElement,
      properties:   container.querySelector('.ri-scene-inspector-properties')       as HTMLElement,
      propTable:    container.querySelector('.ri-scene-inspector-properties-table') as HTMLElement,
    },
  }
  state.elements.properties.remove()
  return state
}

/** Inspect a node. */
export function inspectNode(node: Node, state: SceneInspectorState): void {
  if(!state.propsActive) {
    state.elements.container.append(state.elements.properties)
    state.propsActive = true
  }
  if(state.selectedNode)
    state.listItems[state.selectedNode.id].classList.remove('ri-selected')
  state.listItems[node.id].classList.add('ri-selected')
  state.selectedNode = node
  state.selectedNodeId = node.id


  const table = state.elements.propTable
  table.innerHTML = '' // Clear the table
  const name = createPropRow('name', node.name ?? '(unnamed)')
  const nodeId = createPropRow('id', `${node.id}`)
  const type = createPropRow('type', node.nodeType)
  const cullableElement = createPropRow('cullable', node.cullable ? 'yes' : 'no')
  table.append(nodeId, name, type, cullableElement)
  switch(node.nodeType) {
  case 'model':
    const modelName = createPropRow('model', node.modelName, node.modelName)
    const material = createPropRow('material', node.material, node.material)
    const instanceIdElement = createPropRow('instance-id', `${node.instanceId}`)
    const drawCallIdElement = createPropRow('draw-call-id', `${node.drawCallId}`)
    table.append(modelName, material, instanceIdElement, drawCallIdElement)
    break
  case 'light':
    const lightType = createPropRow('light-type', lightTypeNames.get(node.lightSource.type))
    const makeShadows = createPropRow('make-shadows', node.makeShadows ? 'yes' : 'no')
    const lightView = createViewPropRow('view', node.view, state.context)
    table.append(lightType, makeShadows, lightView)
    break
  case 'camera':
    const cameraView = createViewPropRow('view', node.view, state.context)
    table.append(cameraView)
    break
  }

  const worldSpaceLabel = createPropTableLabelRow('World space')
  const inFrustum = createPropRow('in-frustum', node._inFrustum ? 'yes' : 'no')
  const worldOriginPosition = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], node._worldTransform).slice(0,3) as Vec3
  const bv = node._boundingVolume
  const boundingSize = [bv.max[0] - bv.min[0], bv.max[1] - bv.min[1], bv.max[2] - bv.min[2]] as Vec3
  const boundingCentre = isNullBoundingVolume(bv) ? [0,0,0] as Vec3 : [bv.min[0] + boundingSize[0] / 2, bv.min[1] + boundingSize[1] / 2, bv.min[2] + boundingSize[2] / 2] as Vec3
  const worldOrigin = createPropVec3Row('origin', worldOriginPosition)
  const centre = createPropVec3Row('centre', boundingCentre)
  const size = createPropVec3Row('size', boundingSize)

  const cameraSpaceLabel = createPropTableLabelRow('Camera space')
  const cameraOriginPosition = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], node._modelView).slice(0,3) as Vec3
  const cameraOrigin = createPropVec3Row('origin', cameraOriginPosition)
  const centredBV = {min: vec3.sub(vec3.create(), bv.min, worldOriginPosition), max: vec3.sub(vec3.create(), bv.max, worldOriginPosition)} as BoundingVolume
  const cameraBV = getTransformedBoundingVolume(centredBV, node._modelView)
  const cameraBVSize = [cameraBV.max[0] - cameraBV.min[0], cameraBV.max[1] - cameraBV.min[1], cameraBV.max[2] - cameraBV.min[2]] as Vec3
  const cameraBVCentre = isNullBoundingVolume(bv) ? [0,0,0] as Vec3 : [
    cameraBV.min[0] + cameraBVSize[0] / 2, 
    cameraBV.min[1] + cameraBVSize[1] / 2, 
    cameraBV.min[2] + cameraBVSize[2] / 2] as Vec3
  const cameraBVCentreElement = createPropVec3Row('centre', cameraBVCentre)
  const cameraBVSizeElement = createPropVec3Row('size', cameraBVSize)
 
  
  const matricesLabel = createPropTableLabelRow('Matrices')
  const localTransformElement = createPropMatrixRow('local-transform', node.transform)
  const worldTransform = createPropMatrixRow('world-transform', node._worldTransform)
  const modelView = createPropMatrixRow('model-view', node._modelView)
  
  //const boundingVolume = createPropMatrixRow('bounding-volume', node._boundingVolume)

  table.append(
    worldSpaceLabel, worldOrigin, centre, size, 
    cameraSpaceLabel, inFrustum, cameraOrigin,// cameraBVCentreElement, cameraBVSizeElement,
    matricesLabel, localTransformElement, worldTransform, modelView)
}


/** Create an inline node property element. */
function createInlineNodeProp(propName: string, propValue: string, linkTo: string | null = null): HTMLElement {
  const el = createElement('div', 'ri-node-prop')
  el.classList.add(`ri-node-prop-${propName}`)
  const label = createElement('label', 'ri-node-prop-label', `${propName}: `)
  let value = null
  if(linkTo === null) {
    value = createElement('span', 'ri-node-prop-value', propValue) as HTMLSpanElement
  } else {
    value = createElement('a', 'ri-node-prop-value', propValue) as HTMLAnchorElement
    value.href = '#'
  }
  el.append(label, value)
  return el
}

/** Show the scene graph viewer. */
export async function showSceneInspector(state: SceneInspectorState): Promise<void> {
  if(!state.active) {
    state.elements.parent.append(state.elements.container)
    state.active = true
  }
  await updateSceneInspector(state)
}

/** Hide the scene graph viewer. */
export function hideSceneInspector(state: SceneInspectorState): void {
  if(!state.active) return
  state.elements.container.remove()
  state.active = false
}

/** Update the scene graph viewer. */
export async function updateSceneInspector(state: SceneInspectorState): Promise<void> {
  const node = await state.agent.getSceneGraph()
  state.nodes.length = 0
  state.elements.list.innerHTML = ''
  const e = createNodeElement(node, 0, state)
  
  //state.elements.tree.append(e)
  if(state.selectedNodeId !== null) {
    const node = state.nodes[state.selectedNodeId]
    state.selectedNode = node
    if(node)
      inspectNode(node, state)
    if(state.listItems[state.selectedNodeId])
      state.listItems[state.selectedNodeId].classList.add('ri-selected')
  }

}

/** Create a node element. */
export function createNodeElement(node: Node, level: number, state: SceneInspectorState): HTMLElement {
  const container = createElement('div', 'ri-scene-node')
  container.classList.add('ri-entity-list-item')
  container.style.paddingLeft = `${level * 20}px`
  const props = createElement('div', 'ri-node-properties')
  const name = node.name ?
    createElement('div', 'ri-node-name', node.name) :
    createElement('div', 'ri-node-name-unnamed', `(${node.nodeType})`)
  name.classList.add('ri-node-prop')
  if(node.hidden) {
    container.classList.add('ri-node-hidden')
    name.innerText += ' (hidden)'
  }
  const nodeId = createElement('span', 'ri-node-id', `#${node.id}`)
  const type = createElement('div', 'ri-node-type', nodeTypeSymbols.get(node.nodeType))
  props.append(type, nodeId, name)
  switch(node.nodeType) {
  case 'model':
    const modelName = createInlineNodeProp('model', node.modelName, node.modelName)
    const material = createInlineNodeProp('material', node.material, node.material)
    props.append(modelName, material)
    break
  case 'light':
    const lightType = createInlineNodeProp('light-type', lightTypeNames.get(node.lightSource.type))
    const makeShadows = createInlineNodeProp('cast-shadows', node.makeShadows ? 'yes' : 'no')
    //const lightView = createInlineNodeProp('view', node.view.name, node.view.name)
    props.append(lightType, makeShadows) //, lightView)
    break
  case 'camera':
    const cameraView = createInlineNodeProp('view', node.view.name, node.view.name)
    props.append(cameraView)
    break
  }
  state.elements.list.append(container)
  node.children.forEach(x => createNodeElement(x, level+1, state))
  container.append(props)
  state.listItems[node.id] = container
  

  container.addEventListener('click', ev => {
    inspectNode(node, state)
    ev.stopPropagation()
   })
   state.nodes[node.id] = node
  return container
}

const nodeTypeSymbols = new Map<string, string>([
  ['transform', '📐'],
  ['model',     '📦'],
  ['light',     '💡'],
  ['camera',    '📷'],
])

const lightTypeNames = new Map<string, string>([
  ['point',       'point'],
  ['directional', 'directional'],
  ['spot',        'spot'],
])

