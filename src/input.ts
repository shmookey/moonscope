export type InputState = {
  mouseCaptured: boolean,            // Is the mouse captured?
  mouseDownLeft: boolean,            // Is the left mouse button down?
  mouseDownRight: boolean,           // Is the right mouse button down?
  keyDown: {[key: string]: boolean}, // Is a key down?
  mouseMovement: [number, number],   // Captured mouse movement since last frame.
}

/** Initialize the input state. */
export function createInputState(): InputState {
  const inputState: InputState = {
    mouseCaptured: false,
    mouseDownLeft: false,
    mouseDownRight: false,
    keyDown: {},
    mouseMovement: [0, 0],
  }
  window.addEventListener('keydown', ev => {
    inputState.keyDown[ev.code] = true
  })
  window.addEventListener('keyup', ev => {
    inputState.keyDown[ev.code] = false
  })
  window.addEventListener('mousedown', ev => {
    if(ev.button == 0) {
      inputState.mouseDownLeft = true
    } else if(ev.button == 2) {
      inputState.mouseDownRight = true
    }
  })
  window.addEventListener('mouseup', ev => {
    if(ev.button == 0) {
      inputState.mouseDownLeft = false
    } else if(ev.button == 2) {
      inputState.mouseDownRight = false
    }
  })
  window.addEventListener('mousemove', ev => {
    if(inputState.mouseCaptured) {
      inputState.mouseMovement[0] += ev.movementX
      inputState.mouseMovement[1] += ev.movementY
    }
  })

  return inputState
}


