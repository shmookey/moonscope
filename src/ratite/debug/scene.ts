/** Scene graph inspector. */

import { vec4, glMatrix } from 'gl-matrix'
import type { Mat4, Node, Vec3 } from '../types'
import { InspectorAgent } from './common'
import { createElement } from './common.js'
import { isNullBoundingVolume } from '../common.js'
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
}

/** Scene inspector elements. */
export interface SceneInspectorElements {
  parent:     HTMLElement,  // Outer container
  container:  HTMLElement,  // Inner container
  tree:       HTMLElement,  // Scene graph tree
  properties: HTMLElement,  // Node properties
  propTable:  HTMLElement,  // Node properties table
}

const sceneInspectorHTML = `
  <div class="ri-scene-inspector-tree"></div>
  <div class="ri-scene-inspector-properties">
    <div class="ri-scene-inspector-properties-header">Properties</div>
    <div class="ri-scene-inspector-properties-table">
    </div>
  </div>
`

/** Create the scene graph viewer. */
export function createSceneInspector(parentElement: HTMLElement, agent: InspectorAgent): SceneInspectorState {
  const container = createElement('div', 'ri-scene-inspector')
  container.innerHTML = sceneInspectorHTML
  const state: SceneInspectorState = {
    selectedNode:   null,
    selectedNodeId: null,
    active:         false,
    propsActive:    false,
    agent:          agent,
    nodes:          [],
    elements: {
      parent:       parentElement,
      container:    container,
      tree:         container.querySelector('.ri-scene-inspector-tree')             as HTMLElement,
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
  state.selectedNode = node
  state.selectedNodeId = node.id
  const table = state.elements.propTable
  table.innerHTML = '' // Clear the table
  const name = createNodePropRow('name', node.name ?? '(unnamed)')
  const nodeId = createNodePropRow('id', `#${node.id}`)
  const type = createNodePropRow('type', node.nodeType)
  table.append(nodeId, name, type, nodeId)
  switch(node.nodeType) {
  case 'model':
    const modelName = createNodePropRow('model', node.modelName, node.modelName)
    const material = createNodePropRow('material', node.material, node.material)
    table.append(modelName, material)
    break
  case 'light':
    const lightType = createNodePropRow('light-type', lightTypeNames.get(node.lightSource.type))
    const makeShadows = createNodePropRow('cast-shadows', node.makeShadows ? 'yes' : 'no')
    const lightView = createNodePropRow('view', node.view.name, node.view.name)
    table.append(lightType, makeShadows, lightView)
  case 'camera':
    const cameraView = createNodePropRow('view', node.view.name, node.view.name)
    table.append(cameraView)
    break
  }
  const inFrustum = createNodePropRow('in-frustum', node._inFrustum ? 'yes' : 'no')
  const originPosition = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], node._worldTransform).slice(0,3) as Vec3
  const bv = node._boundingVolume
  const boundingSize = [bv.max[0] - bv.min[0], bv.max[1] - bv.min[1], bv.max[2] - bv.min[2]] as Vec3
  const boundingCentre = isNullBoundingVolume(bv) ? [0,0,0] as Vec3 : [bv.min[0] + boundingSize[0] / 2, bv.min[1] + boundingSize[1] / 2, bv.min[2] + boundingSize[2] / 2] as Vec3
  const origin = createNodePropVec3Row('origin', originPosition)
  const centre = createNodePropVec3Row('centre', boundingCentre)
  const size = createNodePropVec3Row('size', boundingSize)
  const worldTransform = createNodePropMatrixRow('world-transform', node._worldTransform)
  const modelView = createNodePropMatrixRow('model-view', node._modelView)
  //const boundingVolume = createNodePropMatrixRow('bounding-volume', node._boundingVolume)

  table.append(origin, centre, size, inFrustum, worldTransform, modelView)
}

/** Create a node property table row. */
function createNodePropRow(propName: string, propValue: string, linkTo: string | null = null): HTMLElement {
  const row = createElement('div', 'ri-node-prop-table-row')
  const label = createElement('label', 'ri-node-prop-table-label', `${propName}`)
  let value = null
  if(linkTo === null) {
    value = createElement('span', 'ri-node-prop-table-value', propValue) as HTMLSpanElement
  } else {
    value = createElement('a', 'ri-node-prop-table-value', propValue) as HTMLAnchorElement
    value.href = '#'
  }
  row.append(label, value)
  return row
}

/** Create a node property table row for a matrix property. */
function createNodePropMatrixRow(propName: string, propValue: Mat4): HTMLElement {
  const row = createElement('div', 'ri-node-prop-table-row')
  const label = createElement('label', 'ri-node-prop-table-label', `${propName}`)
  const value = createElement('span', 'ri-node-prop-table-value') as HTMLSpanElement
  const matEl = createMatrixElement4x4(propValue)
  value.append(matEl)
  row.append(label, value)
  return row
}

/** Create a node property table row for a 3-vector property. */
function createNodePropVec3Row(propName: string, propValue: Vec3): HTMLElement {
  const row = createElement('div', 'ri-node-prop-table-row')
  const label = createElement('label', 'ri-node-prop-table-label', `${propName}`)
  const value = createElement('span', 'ri-node-prop-table-value') as HTMLSpanElement
  const vecEl = propValue.every(x => !isNaN(x)) ? createVec3Element(propValue) : createElement('span', 'ri-node-prop-table-value', '(invalid)')
  value.append(vecEl)
  row.append(label, value)
  return row
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
export function showSceneInspector(state: SceneInspectorState): void {
  if(!state.active) {
    state.elements.parent.append(state.elements.container)
    state.active = true
  }
  updateSceneInspector(state)
}

/** Hide the scene graph viewer. */
export function hideSceneInspector(state: SceneInspectorState): void {
  if(!state.active) return
  state.elements.container.remove()
  state.active = false
}

/** Update the scene graph viewer. */
export async function updateSceneInspector(state: SceneInspectorState): Promise<void> {
  const node = await state.agent.send({ type: 'getState' }) as Node
  state.nodes.length = 0
  const e = createNodeElement(node, state)
  state.elements.tree.innerHTML = ''
  state.elements.tree.append(e)
  if(state.selectedNodeId !== null) {
    const node = state.nodes[state.selectedNodeId]
    state.selectedNode = node
    if(node)
      inspectNode(node, state)
  }
}

/** Create a node element. */
export function createNodeElement(node: Node, state: SceneInspectorState): HTMLElement {
  const container = createElement('div', 'ri-scene-node')

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
    const lightView = createInlineNodeProp('view', node.view.name, node.view.name)
    props.append(lightType, makeShadows, lightView)
  case 'camera':
    const cameraView = createInlineNodeProp('view', node.view.name, node.view.name)
    props.append(cameraView)
    break
  }
  const children = createElement('div', 'ri-node-children')
  const childElements = node.children.map(x => createNodeElement(x, state))
  children.append(...childElements)
  container.append(props, children)

  container.addEventListener('click', ev => {
    inspectNode(node, state)
    ev.stopPropagation()
   })
   state.nodes[node.id] = node
  return container
}

/** Create a 4x4 matrix element. */
function createMatrixElement4x4(m: Mat4): HTMLElement {
  const el = createElement('div', 'ri-matrix-4x4')
  const cells = m.map(x => createElement('div', 'ri-matrix-cell', formatNumber(x, 2)))
  el.append(...cells)
  return el
}

/** Create a 3-vector element. */
function createVec3Element(v: Vec3): HTMLElement {
  const el = createElement('div', 'ri-vector-3')
  const cells = v.map(x => createElement('div', 'ri-vector-cell', formatNumber(x, 2)))
  el.append(...cells)
  return el
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

/** Format a number as a string with a fixed number of decimal places.
 * 
 * Integers do not receive a decimal point and trailing zeros. Instead, a single
 * space replaces the decimal point and figure spaces are used to pad the
 * integer to the desired number of decimal places.
 */
function formatNumber(n: number, decimalPlaces: number): string {
  const s = isFinite(n) ? n.toFixed(decimalPlaces) : '∞.00'
  const [intPart, fracPart] = s.split('.')
  if(Array.from(fracPart).every(x => x === '0')) {
    return `${intPart} ${' '.repeat(decimalPlaces)}`
  } else {
    return s
  }
}