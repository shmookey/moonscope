export type InputState = {
  captured: boolean,
  sceneElement: HTMLElement,
}

export function createInputController(sceneElement: HTMLElement): InputState {
  const state = {
    captured: false,
    sceneElement
  }

  sceneElement.addEventListener('click', ev => {
    switch(ev.button) {
    case 0:
      break
    default:
      console.log(ev.button)
      break
    }
  })

  sceneElement.addEventListener('keydown', ev => {
    switch(ev.code) {
    case 'Escape':
      break
    default:
      console.log(ev.code)
      break
    }
  })

  return state
}