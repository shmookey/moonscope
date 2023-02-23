import type { Query, QueryType, ShadowMapInfo } from "../../types"
import type { Node, Mat4, Vec3, ViewSet, LightSource, View } from "../types"
import { inspectNode } from "./scene.js"
import { InspectorState, closeCurrentSection, openSection, showSceneInspectorSection, showViewInspectorSection } from "./ui.js"
import { inspectView } from "./views.js"

/** Agent for communicating between the inspector and the worker.
 * 
 * This is a hack until worker support is moved out of the application and into
 * Ratite itself.
 */
export type InspectorAgent = {
  send: (message: any) => Promise<any>,          // Send a request to the worker.
  query: (query: Query) => Promise<any>, // Query the worker.
  getSceneGraph: () => Promise<Node>,            // Get the scene graph root node.
  getViews:      () => Promise<View[]>,          // Get the scene views.
  getShadowMaps: () => Promise<ShadowMapInfo[]>, // Get the shadow maps.
  getShadowMapImage: (shadowMapId: number) => Promise<ImageBitmap>, // Get a shadow map image.
  getLights:     () => Promise<LightSource[]>,   // Get the light sources.
}


/** Create an element with a given class name and optionally text content. */
export function createElement(tagName: string, className: string, textContent: string = null): HTMLElement {
  const element = document.createElement(tagName)
  element.classList.add(className)
  if (textContent) {
    element.textContent = textContent
  }
  return element
}

/** Create a label property table row. */
export function createPropTableLabelRow(label: string): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  const labelElement = createElement('label', 'ri-prop-table-section-label', label)
  row.append(labelElement)
  return row
}


/** Create a property table row. */
export function createPropRow(propName: string, propValue: string, linkTo: string | null = null): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  let value = null
  if(linkTo === null) {
    value = createElement('span', 'ri-prop-table-value', propValue) as HTMLSpanElement
  } else {
    value = createElement('a', 'ri-prop-table-value', propValue) as HTMLAnchorElement
    value.href = '#'
  }
  row.append(label, value)
  return row
}

/** Create a property table row referencing a node. */
export function createNodePropRow(propName: string, node: Node, state: InspectorState): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  row.classList.add('ri-prop-table-row-node')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const valText = `${node.name ?? '(unnamed)'} (#${node.id})`
  let value = createElement('a', 'ri-prop-table-value', valText) as HTMLAnchorElement
  value.href = '#'
  value.classList.add('ri-node-link')
  value.addEventListener('click', async ev => {
    await openSection('scene', state)
    inspectNode(node, state.sceneInspector)
    ev.stopPropagation()
    ev.preventDefault()
  })
  row.append(label, value)
  return row
}

/** Create a property table row referencing a list of nodes. */
export function createNodeListPropRow(propName: string, nodes: Node[], state: InspectorState): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  row.classList.add('ri-prop-table-row-node')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  let value = createElement('div', 'ri-prop-table-value') as HTMLDivElement
  value.classList.add('ri-prop-value-list')
  const items = []
  for(let node of nodes) {
    const valText = `${node.name ?? '(unnamed)'} (#${node.id})`
    let item = createElement('a', 'ri-prop-value-list-item', valText) as HTMLAnchorElement
    item.classList.add('ri-node-link')
    item.href = '#'
    item.addEventListener('click', async ev => {
      await openSection('scene', state)
      inspectNode(node, state.sceneInspector)
      ev.stopPropagation()
      ev.preventDefault()
    })
    items.push(item)
  }
  value.append(...items)
  row.append(label, value)
  return row
}


/** Create a property table row referencing a view. */
export function createViewPropRow(propName: string, view: View, state: InspectorState): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  row.classList.add('ri-prop-table-row-view')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const valText = view.name ?? '(unnamed)'
  let value = createElement('a', 'ri-prop-table-value', valText) as HTMLAnchorElement
  value.href = '#'
  value.addEventListener('click', async ev => {
    await openSection('views', state)
    inspectView(view, state.viewInspector)
    ev.stopPropagation()
    ev.preventDefault()
  })
  row.append(label, value)
  return row
}


/** Create a property table row for a matrix property. */
export function createPropMatrixRow(propName: string, propValue: Mat4): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const value = createElement('span', 'ri-prop-table-value') as HTMLSpanElement
  const matEl = createMatrixElement4x4(propValue)
  value.append(matEl)
  row.append(label, value)
  return row
}

/** Create a property table row for an image property. */
export function createPropImageRow(propName: string, image: ImageBitmap): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  row.classList.add('ri-prop-table-row-image')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const value = createElement('div', 'ri-prop-table-value ri-prop-image') as HTMLCanvasElement
  const canvas = createImageElement(image)
  value.append(canvas)
  row.append(label, value)
  return row
}

/** Create a property table row for a promised image property. */
export function createPropImageRowAsync(propName: string, imagePromise: Promise<ImageBitmap>): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  row.classList.add('ri-prop-table-row-image')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const value = createElement('div', 'ri-prop-table-value') as HTMLDivElement
  value.classList.add('ri-prop-image')
  imagePromise.then(image => {
    const canvas = createImageElement(image)
    value.append(canvas)
  })
  row.append(label, value)
  return row
}

/** Create a property table row for a 3-vector property. */
export function createPropVec3Row(propName: string, propValue: Vec3): HTMLElement {
  const row = createElement('div', 'ri-prop-table-row')
  const label = createElement('label', 'ri-prop-table-label', `${propName}`)
  const value = createElement('span', 'ri-prop-table-value') as HTMLSpanElement
  const vecEl = propValue.every(x => !isNaN(x)) ? createVec3Element(propValue) : createElement('span', 'ri-prop-table-value', '(invalid)')
  value.append(vecEl)
  row.append(label, value)
  return row
}

/** Create a 4x4 matrix element. */
export function createMatrixElement4x4(m: Mat4): HTMLElement {
  const el = createElement('div', 'ri-matrix-4x4')
  const cells = m.map(x => createElement('div', 'ri-matrix-cell', formatNumber(x, 2)))
  el.append(...cells)
  return el
}

/** Create a 3-vector element. */
export function createVec3Element(v: Vec3): HTMLElement {
  const el = createElement('div', 'ri-vector-3')
  const cells = v.map(x => createElement('div', 'ri-vector-cell', formatNumber(x, 2)))
  el.append(...cells)
  return el
}

/** Create a canvas image element. */
export function createImageElement(img: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return canvas
}

/** Format a number as a string with a fixed number of decimal places.
 * 
 * Integers do not receive a decimal point and trailing zeros. Instead, a single
 * space replaces the decimal point and figure spaces are used to pad the
 * integer to the desired number of decimal places.
 */
export function formatNumber(n: number, decimalPlaces: number): string {
  const s = isFinite(n) ? n.toFixed(decimalPlaces) : '∞.00'
  const [intPart, fracPart] = s.split('.')
  if(Array.from(fracPart).every(x => x === '0')) {
    return `${intPart} ${' '.repeat(decimalPlaces)}`
  } else {
    return s
  }
}