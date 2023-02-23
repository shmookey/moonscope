/** Ratite debug inspector UI */

import type { Node } from '../types.js'
import type { InspectorAgent } from './common'
import type { SceneInspectorState } from './scene.js'
import { createSceneInspector, showSceneInspector, hideSceneInspector } from './scene.js'
import { createElement } from './common.js'
import { ViewInspectorState, createViewInspector, hideViewInspector, showViewInspector } from './views.js'

/** Inspector state. */
export type InspectorState = {
  selectedSidebarItem: string,              // The currently selected sidebar item.
  elements:            InspectorElements,   // The inspector UI elements.
  agent:               InspectorAgent,      // The inspector agent.
  active:              boolean,             // Whether the inspector is active and visible.
  sceneInspector:      SceneInspectorState, // The scene inspector state.
  viewInspector:       ViewInspectorState,  // The view inspector state.
  autoRefresh:         number | null,       // The auto refresh interval ID, or null if not auto refreshing.
}

/** Inspector UI elements. */
export type InspectorElements = {
  container:   HTMLDivElement,    // The inspector container element.
  content:     HTMLDivElement,    // The inspector content element.
  titleBar: {
    title:     HTMLSpanElement,   // The inspector title element.
    buttons: {
      refresh: HTMLButtonElement, // The inspector refresh button element.
      close:   HTMLButtonElement, // The inspector close button element.
    },
  },
  sideBar: {
    scene:     HTMLDivElement,    // The scene sidebar item element.
    materials: HTMLDivElement,    // The materials sidebar item element.
    atlas:     HTMLDivElement,    // The atlas sidebar item element.
    shaders:   HTMLDivElement,    // The shaders sidebar item element.
    buffers:   HTMLDivElement,    // The buffers sidebar item element.
    lights:    HTMLDivElement,    // The lights sidebar item element.
    cameras:   HTMLDivElement,    // The cameras sidebar item element.
    meshes:    HTMLDivElement,    // The meshes sidebar item element.
    models:    HTMLDivElement,    // The models sidebar item element.
    shadows:   HTMLDivElement,    // The shadows sidebar item element.
    instances: HTMLDivElement,    // The instances sidebar item element.
    views:     HTMLDivElement,    // The views sidebar item element.
  }
}

const debuggerInnerHTML: string = `
<div class="ri-title-bar">
  <div class="ri-title">Inspector: <span class="ri-title-section"></span></div>
  <div class="ri-title-buttons">
    <button class="ri-refresh">⟳</button>
    <button class="ri-close">x</button>
  </div>
</div>
<div class="ri-sidebar">
  <div class="ri-sidebar-item ri-sidebar-item-scene ri-sidebar-item-selected">Scene</div>
  <div class="ri-sidebar-item ri-sidebar-item-materials">Materials</div>
  <div class="ri-sidebar-item ri-sidebar-item-atlas">Atlas</div>
  <div class="ri-sidebar-item ri-sidebar-item-shaders">Shaders</div>
  <div class="ri-sidebar-item ri-sidebar-item-buffers">Buffers</div>
  <div class="ri-sidebar-item ri-sidebar-item-lights">Lights</div>
  <div class="ri-sidebar-item ri-sidebar-item-cameras">Cameras</div>
  <div class="ri-sidebar-item ri-sidebar-item-meshes">Meshes</div>
  <div class="ri-sidebar-item ri-sidebar-item-models">Models</div>
  <div class="ri-sidebar-item ri-sidebar-item-shadows">Shadows</div>
  <div class="ri-sidebar-item ri-sidebar-item-instances">Instances</div>
  <div class="ri-sidebar-item ri-sidebar-item-views">Views</div>
</div>
<div class="ri-content">
</div>
`

const sectionNames: Map<string, string> = new Map([
  ['scene',     'Scene graph'],
  ['materials', 'Materials'],
  ['atlas',     'Texture atlas'],
  ['shaders',   'Shader modules'],
  ['buffers',   'GPU Buffers'],
  ['lights',    'Lighting'],
  ['cameras',   'Cameras'],
  ['meshes',    'Meshes'],
  ['models',    'Models'],
  ['shadows',   'Shadow mapping'],
  ['instances', 'Instances'],
  ['views',     'Views'],
])

/** Create the debug inspector UI. */
export function createDebugInspector(agent: InspectorAgent): InspectorState {
  const container = createElement('div', 'ri-window')
  container.id = 'ratite-inspector'
  container.innerHTML = debuggerInnerHTML
  const elems = {
    container:   container                                             as HTMLDivElement,
    content:     container.querySelector('.ri-content')                as HTMLDivElement,
    titleBar: {
      container: container.querySelector('.ri-title-bar')              as HTMLDivElement,
      title:     container.querySelector('.ri-title-section')          as HTMLSpanElement,
      buttons: {
        refresh: container.querySelector('.ri-refresh')                as HTMLButtonElement,
        close:   container.querySelector('.ri-close')                  as HTMLButtonElement,
      },
    },
    sideBar: {
      scene:     container.querySelector('.ri-sidebar-item-scene')     as HTMLDivElement,
      materials: container.querySelector('.ri-sidebar-item-materials') as HTMLDivElement,
      atlas:     container.querySelector('.ri-sidebar-item-atlas')     as HTMLDivElement,
      shaders:   container.querySelector('.ri-sidebar-item-shaders')   as HTMLDivElement,
      buffers:   container.querySelector('.ri-sidebar-item-buffers')   as HTMLDivElement,
      lights:    container.querySelector('.ri-sidebar-item-lights')    as HTMLDivElement,
      cameras:   container.querySelector('.ri-sidebar-item-cameras')   as HTMLDivElement,
      meshes:    container.querySelector('.ri-sidebar-item-meshes')    as HTMLDivElement,
      models:    container.querySelector('.ri-sidebar-item-models')    as HTMLDivElement,
      shadows:   container.querySelector('.ri-sidebar-item-shadows')   as HTMLDivElement,
      instances: container.querySelector('.ri-sidebar-item-instances') as HTMLDivElement,
      views:     container.querySelector('.ri-sidebar-item-views')     as HTMLDivElement,
    }
  }
  makeDraggable(elems.container, elems.titleBar.container)

  const state: InspectorState = {
    selectedSidebarItem: null,
    elements:            elems,
    agent:               agent,
    active:              false,
    sceneInspector:      null,
    viewInspector:       null,
    autoRefresh:         null,
  }
  state.sceneInspector = createSceneInspector(elems.content, agent, state),
  state.viewInspector = createViewInspector(elems.content, agent, state),
  

  // Add event listeners.
  makeStickyButton(
    refreshInspector, 
    startAutoRefresh,
    stopAutoRefresh,
    elems.titleBar.buttons.refresh,
    state)
  elems.titleBar.buttons.close.addEventListener('click',   createButtonHandler(hideInspector,    state))
  elems.sideBar.scene.addEventListener('click',     createSidebarItemHandler('scene',     showSceneInspectorSection, state))
  elems.sideBar.materials.addEventListener('click', createSidebarItemHandler('materials', showMaterialsInspector,    state))
  elems.sideBar.atlas.addEventListener('click',     createSidebarItemHandler('atlas',     showAtlasInspector,        state))
  elems.sideBar.shaders.addEventListener('click',   createSidebarItemHandler('shaders',   showShadersInspector,      state))
  elems.sideBar.buffers.addEventListener('click',   createSidebarItemHandler('buffers',   showBuffersInspector,      state))
  elems.sideBar.lights.addEventListener('click',    createSidebarItemHandler('lights',    showLightsInspector,       state))
  elems.sideBar.cameras.addEventListener('click',   createSidebarItemHandler('cameras',   showCamerasInspector,      state))
  elems.sideBar.meshes.addEventListener('click',    createSidebarItemHandler('meshes',    showMeshesInspector,       state))
  elems.sideBar.models.addEventListener('click',    createSidebarItemHandler('models',    showModelsInspector,       state))
  elems.sideBar.shadows.addEventListener('click',   createSidebarItemHandler('shadows',   showShadowsInspector,      state))
  elems.sideBar.instances.addEventListener('click', createSidebarItemHandler('instances', showInstancesInspector,    state))
  elems.sideBar.views.addEventListener('click',     createSidebarItemHandler('views',     showViewInspectorSection,  state))

  elems.sideBar.scene.click()
  // Hide the close button for the very silly reason that I can't figure out 
  // how to align it nicely in the title bar.
  elems.titleBar.buttons.close.style.display = 'none'
  return state
}

/** Display the inspector UI. */
export function showInspector(state: InspectorState): void {
  window.document.body.appendChild(state.elements.container)
  state.active = true
  refreshInspector(state)
}

/** Hide the inspector UI. */
export function hideInspector(state: InspectorState): void {
  window.document.body.removeChild(state.elements.container)
  state.active = false
}

/** Toggle the inspector UI. */
export function toggleInspector(state: InspectorState): void {
  if (state.active) {
    hideInspector(state)
  } else {
    showInspector(state)
  }
}

/** Refresh the inspector UI. */
export async function refreshInspector(state: InspectorState): Promise<void> {
  if (state.selectedSidebarItem) {
    state.elements.sideBar[state.selectedSidebarItem].click()
  }
}

/** Start the auto-refresh timer. */
export function startAutoRefresh(state: InspectorState): void {
  if (state.autoRefresh) {
    return
  }
  state.autoRefresh = window.setInterval(() => {
    refreshInspector(state)
  }, 500)
}

/** Stop the auto-refresh timer. */
export function stopAutoRefresh(state: InspectorState): void {
  if (!state.autoRefresh) {
    return
  }
  window.clearInterval(state.autoRefresh)
  state.autoRefresh = null
}

/** Show the "scene" inspector section. */
export async function showSceneInspectorSection(state: InspectorState): Promise<void> {
  await showSceneInspector(state.sceneInspector) 
}

/** Show the "materials" inspector section. */
export async function showMaterialsInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "atlas" inspector section. */
export async function showAtlasInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "shaders" inspector section. */
export async function showShadersInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "buffers" inspector section. */
export async function showBuffersInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "lights" inspector section. */
export async function showLightsInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "cameras" inspector section. */
export async function showCamerasInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "meshes" inspector section. */
export async function showMeshesInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "models" inspector section. */
export async function showModelsInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "shadows" inspector section. */
export async function showShadowsInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "instances" inspector section. */
export async function showInstancesInspector(state: InspectorState): Promise<void> {
  state.elements.content.innerHTML = ''
}

/** Show the "views" inspector section. */
export async function showViewInspectorSection(state: InspectorState): Promise<void> {
  await showViewInspector(state.viewInspector)
}

export function closeCurrentSection(state: InspectorState): void {
  if (state.selectedSidebarItem) {
    switch(state.selectedSidebarItem) {
    case 'scene':
      hideSceneInspector(state.sceneInspector)
      break
    case 'views':
      hideViewInspector(state.viewInspector)
      break
    default:
      state.elements.content.innerHTML = ''
    }
    state.elements.sideBar[state.selectedSidebarItem].classList.remove('ri-sidebar-item-selected')
    state.selectedSidebarItem = null
  }
}

export async function openSection(name: string, state: InspectorState): Promise<void> {
  closeCurrentSection(state)
  state.elements.titleBar.title.innerText = sectionNames.get(name)
  state.elements.sideBar[name].classList.add('ri-sidebar-item-selected')
  state.selectedSidebarItem = name
  switch(name) {
  case 'scene':
    await showSceneInspector(state.sceneInspector)
    break
  case 'views':
    await showViewInspector(state.viewInspector)
    break
  default:
    state.elements.content.innerHTML = ''
  }
}

/** Create a handler for selecting a sidebar item. */
function createSidebarItemHandler(name: string, fn: (state: InspectorState) => void, state: InspectorState): (event: Event) => void {
  return (event: Event) => {
    event.stopPropagation()
    closeCurrentSection(state)
    state.elements.titleBar.title.innerText = sectionNames.get(name)
    state.elements.sideBar[name].classList.add('ri-sidebar-item-selected')
    state.selectedSidebarItem = name
    fn(state)
  }
}

/** Create a handler for clicking a button. */
function createButtonHandler(fn: (state: InspectorState) => void, state: InspectorState): (event: Event) => void {
  return (event: Event) => {
    event.stopPropagation()
    fn(state)
  }
}

/** Create a handler for clicking a sticky button.
 * 
 * A sticky button is an ordinary button when activated in the normal way, but
 * when activated by a right-click, holding control, or a long press, it becomes
 * "sticky" and remains active until clicked or tapped again.
 */
function makeStickyButton(
    onClick:   (state: InspectorState) => void, 
    onStick:   (state: InspectorState) => void,
    onUnstick: (state: InspectorState) => void,
    element:   HTMLElement,
    state:     InspectorState): void {
  let stick = false
  const handler = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
    if (event instanceof MouseEvent) {
      if(stick) {
        stick = false
        element.classList.remove('ri-sticky')
        onUnstick(state)
      } else if(event.button === 0 && !event.ctrlKey) { 
        onClick(state)
      } else if(event.button === 2 || event.ctrlKey) {
        // TODO: handle long tap
        stick = true
        element.classList.add('ri-sticky')
        onStick(state)
      }
    }
  }
  element.addEventListener('click', handler)
  element.addEventListener('contextmenu', handler)
}


function makeDraggable(moveElement: HTMLElement, dragElement: HTMLElement): void {
  // Track drag parameters.
  let dragX = 0
  let dragY = 0
  let startLeft = '0px'
  let startTop = '0px'

  function onMouseDown(ev): void {
    // Remove any existing event listeners and reset drag parameters.
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    dragElement.removeEventListener('mousedown', onMouseDown)
    dragX = 0
    dragY = 0

    // Replace any existing position with the exact pixel position.
    const style = window.getComputedStyle(moveElement)
    startLeft = style.getPropertyValue('left')
    startTop = style.getPropertyValue('top')
    moveElement.style.left = startLeft
    moveElement.style.top = startTop
    moveElement.style.position = 'fixed'

    // Start listening for mouse move and mouse up events.
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(ev): void {
    // Update drag parameters.
    dragX += ev.movementX
    dragY += ev.movementY

    // Update element position.
    moveElement.style.left = `calc(${startLeft} + ${dragX}px)`
    moveElement.style.top = `calc(${startTop} + ${dragY}px)`
  }

  function onMouseUp(ev): void {
    // Remove drag event listeners and restore mouse down listener.
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    dragElement.addEventListener('mousedown', onMouseDown)

    // Finalise element position.
    const style = window.getComputedStyle(moveElement)
    const left = style.getPropertyValue('left')
    const top = style.getPropertyValue('top')
    moveElement.style.left = left
    moveElement.style.top = top

    // Reset drag parameters
    dragX = 0
    dragY = 0
  }

  // Start listening for mouse down events.
  dragElement.addEventListener('mousedown', onMouseDown)
}
