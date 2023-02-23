/** View inspector */

import { vec4, glMatrix, vec3, mat4 } from 'gl-matrix'
import type { Vec3, View, ViewSet } from "../types"
import { InspectorAgent, createNodeListPropRow, createNodePropRow, createPropImageRowAsync, createPropMatrixRow, createPropRow, createPropTableLabelRow, createPropVec3Row } from "./common.js"
import { createElement } from "./common.js"
import { InspectorState } from './ui'
glMatrix.setMatrixArrayType(Array)

/** View inspector state. */
export interface ViewInspectorState {
  selectedView:     View | null,
  selectedViewName: string | null,
  elements:         ViewInspectorElements,
  active:           boolean,
  agent:            InspectorAgent,
  propsActive:      boolean, // Is the properties panel active?
  views:            ViewSet, // All views indexed by id
  listItems:        Map<string, HTMLElement>, // All list items indexed by view name
  context:          InspectorState,
}

/** View inspector elements. */
export interface ViewInspectorElements {
  parent:     HTMLElement,  // Outer container
  container:  HTMLElement,  // Inner container
  list:       HTMLElement,  // View list
  properties: HTMLElement,  // View properties
  propTable:  HTMLElement,  // View properties table
}

const viewInspectorHTML = `
  <div class="ri-view-inspector-list ri-entity-list"></div>
  <div class="ri-view-inspector-properties ri-properties-pane">
    <div class="ri-properties-pane-header">View properties</div>
    <div class="ri-view-inspector-properties-table ri-properties-table">
    </div>
  </div>
`

/** Create the view inspector. */
export function createViewInspector(parentElement: HTMLElement, agent: InspectorAgent, context: InspectorState): ViewInspectorState {
  const container = createElement('div', 'ri-view-inspector')
  container.classList.add('ri-section')
  container.innerHTML = viewInspectorHTML
  const state: ViewInspectorState = {
    selectedView:     null,
    selectedViewName: null,
    active:           false,
    propsActive:      false,
    agent:            agent,
    views:            {},
    listItems:        new Map(),
    context:          context,
    elements: {
      parent:         parentElement,
      container:      container,
      list:           container.querySelector('.ri-view-inspector-list')             as HTMLElement,
      properties:     container.querySelector('.ri-view-inspector-properties')       as HTMLElement,
      propTable:      container.querySelector('.ri-view-inspector-properties-table') as HTMLElement,
    },
  }
  state.elements.properties.remove()
  return state
}

/** Show the view inspector. */
export async function showViewInspector(state: ViewInspectorState): Promise<void> {
  if(!state.active) {
    state.elements.parent.append(state.elements.container)
    state.active = true
  }
  await updateViewInspector(state)
}

/** Hide the view inspector. */
export function hideViewInspector(state: ViewInspectorState): void {
  if(!state.active) return
  state.elements.container.remove()
  state.active = false
}

/** Update the view inspector. */
export async function updateViewInspector(state: ViewInspectorState): Promise<void> {
  const views = await state.agent.getViews()
  state.views = {}

  state.elements.list.innerHTML = '<div class="ri-entity-list-header">Views</div>'
  for(const view of views) {
    const e = createListItem(view, state)
    state.elements.list.append(e)
    state.views[view.name] = view
    state.listItems.set(view.name, e)
  }

  if(state.selectedViewName !== null) {
    const view = state.views[state.selectedViewName]
    state.selectedView = view
    if(state.listItems.has(view.name))
      state.listItems.get(view.name).classList.add('ri-selected')
    if(view)
      inspectView(view, state)
  }
}

/** Inspect a view. */
export function inspectView(view: View, state: ViewInspectorState): void {
  if(!state.propsActive) {
    state.elements.container.append(state.elements.properties)
    state.propsActive = true
  }
  if(state.selectedViewName !== null && state.listItems.has(state.selectedViewName)) {
    state.listItems.get(state.selectedViewName).classList.remove('ri-selected')
  }
  state.selectedView = view
  state.selectedViewName = view.name
  state.listItems.get(state.selectedViewName).classList.add('ri-selected')

  const table = state.elements.propTable
  table.innerHTML = '' // Clear the table

  const nameElement = createPropRow('name', view.name ?? '(unnamed)')
  const typeElement = createPropRow('type', view.type)
  const nodeElement = createNodePropRow('node', view.node, state.context)
  const frustumTestElement = createPropRow('frustum-test', view.frustumTest ? `yes (${view.frustumNodes.length} visible)` : 'no')
  const matricesLabel = createPropTableLabelRow('Matrices')
  const viewMatrixElement = createPropMatrixRow('view-matrix', view.viewMatrix)
  const projectionMatrixElement = createPropMatrixRow('projection-matrix', view.projection)

  const invViewMatrix = mat4.invert(mat4.create(), view.viewMatrix)
  const eyePosition = vec4.transformMat4(
    vec4.create(), 
    [0, 0, 0, 1], 
    invViewMatrix
  ).slice(0,3) as Vec3
  const lookDirection = vec4.transformMat4(
    vec4.create(), 
    [0, 0, -1, 0], 
    invViewMatrix
  ).slice(0,3) as Vec3

  const eyePositionElement = createPropVec3Row('eye-position', eyePosition)
  const lookDirectionElement = createPropVec3Row('look-direction', lookDirection)

  table.append(
    nameElement, 
    typeElement,
    frustumTestElement,
    nodeElement,
    eyePositionElement,
    lookDirectionElement,
    matricesLabel,
    viewMatrixElement,
    projectionMatrixElement,
  )

  if(view.type === 'light') {
    const shadowMappingLabel = createPropTableLabelRow('Shadow mapping')
    const shadowMapIdElement = createPropRow('shadow-map-id', `${view.shadowMapId ?? '(none)'}`)
    const imagePromise = state.agent.getShadowMapImage(view.shadowMapId)
    const imageElement = createPropImageRowAsync('depth-map', imagePromise)
    table.append(shadowMappingLabel, shadowMapIdElement, imageElement)
  }

  if(view.frustumTest) {
    const frustumNodesLabel = createPropTableLabelRow(`Frustum nodes (${view.frustumNodes.length})`)
    const frustumNodesElement = createNodeListPropRow('frustum-nodes', view.frustumNodes, state.context)
    table.append(frustumNodesLabel, frustumNodesElement)
  }

}

/** Create a list item for a view. */
function createListItem(view: View, state: ViewInspectorState): HTMLElement {
  const e = createElement('div', 'ri-entity-list-item')
  const sym = viewTypeSymbols.get(view.type)
  e.textContent = `${sym} ${view.name}`
  e.addEventListener('click', ev => {
    inspectView(view, state)
    ev.stopPropagation()
  })
  return e
}

const viewTypeSymbols = new Map<string, string>([
  ['light',     '💡'],
  ['camera',    '📷'],
])
