
/** Agent for communicating between the inspector and the worker.
 * 
 * This is a hack until worker support is moved out of the application and into
 * Ratite itself.
 */
export type InspectorAgent = {
  send: (message: any) => Promise<any>, // Send a request to the worker.
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
