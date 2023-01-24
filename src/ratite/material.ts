/** Materials manager.
 * 
 * The `Material` type directly represents the shader-side structure of the
 * same name - that is, it does not model the different types of materials
 * with different object structures.
 * 
 * The material manager can load an arbitrary number of materials, with an
 * "active" subset stored in a GPU buffer. Meshes are associated with materials
 * on the shader side by their slot index, which is determined when the
 * material is activated (not when it is first created). Typically, a mesh will
 * be represented / stored using a material name (or some other form of handle)
 * which is resolved to a slot index by the instance manager, or equivalent.
 * The instance manager obtains the index by calling `useMaterial()`, which
 * activates the material if it is not already active and increments the usage
 * count for that material. An active material can only be deactivated when its
 * usage count is zero. The `releaseMaterial()` function decrements the usage
 * count for a material, and optionally deactivates it if the usage count
 * reaches zero.
 * 
 * It is possible that a user of this library may hold a reference for an
 * active Material object, in which case the slot index could be obtained
 * directly from the Material object. This is not recommended, since it
 * circumvents the usage count mechanism and could lead to unexpected
 * behaviour.
 * 
 * Material properties may be changed at any time, but the changes to an active
 * material will not be synchronised with the GPU buffer automatically. The
 * `updateMaterial()` function will update the GPU buffer for a single material
 * if it is active, and `updateMaterials()` will update the whole buffer.
 * 
 * The materials manager uses a texture manager or "atlas" to resolves texture
 * names in material descriptors to texture slots for shaders. Name resolution
 * is performed at the time the descriptor is applied and not subsequently
 * tracked. A future update to the texture atlas implementation will afford
 * textures the same reference-count protections as materials. A material's
 * textures may be updated by name with `applyTexturesDescriptor()` or by
 * calling `applyMaterialDescriptor()` with only the `textures` property set.
 * Only the textures that are specified in the descriptor will be updated, a
 * null value clears the texture slot (sets it to zero).
 * 
 * As the material manager must look up textures by name, it must be
 * initialised after the texture manager, and materials should only be added
 * after any textures they depend on have been registered with it. It is not
 * necessary for the texture data to be loaded, only that the texture names
 * have been associated with a texture ID.
 */

import type { 
  Atlas, Material, MaterialDescriptor, MaterialState, 
  MaterialTexturesDescriptor 
} from './types'
import {
  MATERIAL_RECORD_SIZE,
  MATERIAL_RECORD_OFFSET_AMBIENT,
  MATERIAL_RECORD_OFFSET_DIFFUSE,
  MATERIAL_RECORD_OFFSET_SPECULAR,
  MATERIAL_RECORD_OFFSET_EMISSIVE,
  MATERIAL_RECORD_OFFSET_TEXTURES,
  MATERIAL_RECORD_OFFSET_SHININESS,
} from './constants.js'
import { getSubTextureByName } from './atlas.js'


/** Initialise the materials manager. */
export function createMaterialState(bufferCapacity: number, atlas: Atlas, device: GPUDevice): MaterialState {
  const byteLength = bufferCapacity * MATERIAL_RECORD_SIZE
  const buffer = device.createBuffer({
    size:  byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  return {
    device,
    buffer,
    bufferCapacity,
    atlas,
    bufferData:     new ArrayBuffer(byteLength),
    bufferUsage:    0,
    slots:          new Array(bufferCapacity).fill(null),
    materials:      [],
    nextMaterialID: 0,
  }
}

/** Create a material.
 * 
 * The newly created material must be activated before it can be used.
 */
export function createMaterial(state: MaterialState, descriptor?: MaterialDescriptor): Material {
  const material: Material = {
    id:        state.nextMaterialID++,
    name:      descriptor?.name,
    slot:      null,
    ambient:   [0, 0, 0, 1],
    diffuse:   [1, 1, 1, 1],
    specular:  [1, 1, 1, 1],
    emissive:  [0, 0, 0, 1],
    shininess: 0,
    textures:  [null, null, null, null],
    usage:     0
  }
  state.materials[material.id] = material
  if(descriptor)
    applyMaterialDescriptor(material.id, descriptor, state)
  return material
}

/** Apply a material descriptor to a material. */
export function applyMaterialDescriptor(id: number, descriptor: MaterialDescriptor, state: MaterialState): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  material.name      = descriptor.name      ?? material.name
  material.ambient   = descriptor.ambient   ?? material.ambient
  material.diffuse   = descriptor.diffuse   ?? material.diffuse
  material.specular  = descriptor.specular  ?? material.specular
  material.emissive  = descriptor.emissive  ?? material.emissive
  material.shininess = descriptor.shininess ?? material.shininess
  if(material.textures)
    applyTexturesDescriptor(id, descriptor.textures, state)
}

/** Apply a textures descriptor to a material.
 * 
 * Only the textures that are specified in the descriptor will be updated, a
 * null value clears the texture slot (sets it to zero). If a texture name is
 * not found in the texture atlas, an error is thrown.
 */
export function applyTexturesDescriptor(id: number, descriptor: MaterialTexturesDescriptor, state: MaterialState): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  if('colour' in descriptor) {
    if(descriptor.colour === null)
      material.textures[0] = null
    else {
      const texture = getSubTextureByName(descriptor.colour, state.atlas)
      if(texture === null)
        throw new Error(`No such texture: ${descriptor.colour}`)
      material.textures[0] = texture.id
    }
  }
  if('normal' in descriptor) {
    if(descriptor.normal === null)
      material.textures[1] = null
    else {
      const texture = getSubTextureByName(descriptor.normal, state.atlas)
      if(texture === null)
        throw new Error(`No such texture: ${descriptor.normal}`)
      material.textures[1] = texture.id
    }
  }
  if('specular' in descriptor) {
    if(descriptor.specular === null)
      material.textures[2] = null
    else {
      const texture = getSubTextureByName(descriptor.specular, state.atlas)
      if(texture === null)
        throw new Error(`No such texture: ${descriptor.specular}`)
      material.textures[2] = texture.id
    }
  }
  if('emissive' in descriptor) {
    if(descriptor.emissive === null)
      material.textures[3] = null
    else {
      const texture = getSubTextureByName(descriptor.emissive, state.atlas)
      if(texture === null)
        throw new Error(`No such texture: ${descriptor.emissive}`)
      material.textures[3] = texture.id
    }
  }
}

/** Activate a material. */
export function activateMaterial(id: number, state: MaterialState): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)
  if (state.bufferUsage >= state.bufferCapacity)
    throw new Error('Materials buffer is full')  

  const material = state.materials[id]

  if (material.slot !== null)
    return // already active

  const slot = state.slots.findIndex(s => s === null)
  material.slot = slot
  state.bufferUsage++
  state.slots[slot] = material
  updateMaterial(material.id, state)
}

/** Deactivate a material. 
 * 
 * The material will not be deactivated if it is in use. The GPU buffer for
 * the slot is zero-filled after deactivation and the slot is available for
 * reuse.
 */
export function deactivateMaterial(id: number, state: MaterialState): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  if (material.slot === null)
    return // already inactive

  if (material.usage > 0)
    throw new Error('Cannot deactivate material while in use')

  const slot = material.slot
  material.slot = null
  state.slots[slot] = null

  const offset = slot * MATERIAL_RECORD_SIZE
  const array  = new Float32Array(state.bufferData, offset, MATERIAL_RECORD_SIZE/4)
  array.fill(0)
  state.device.queue.writeBuffer(
    state.buffer,
    offset,
    state.bufferData,
    offset,
    MATERIAL_RECORD_SIZE
  )
}

/** Update the GPU buffer for a single material.
 * 
 * The material must be active. Updating an inactive material will have no
 * effect.
 */
export function updateMaterial(id: number, state: MaterialState): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  if (material.slot === null)
    return // inactive

  const offset = material.slot * MATERIAL_RECORD_SIZE
  const array  = new Float32Array(state.bufferData, offset, MATERIAL_RECORD_SIZE/4)
  const view = new DataView(state.bufferData, offset, MATERIAL_RECORD_SIZE)
  array.set(material.ambient,   MATERIAL_RECORD_OFFSET_AMBIENT/4)
  array.set(material.diffuse,   MATERIAL_RECORD_OFFSET_DIFFUSE/4)
  array.set(material.specular,  MATERIAL_RECORD_OFFSET_SPECULAR/4)
  array.set(material.emissive,  MATERIAL_RECORD_OFFSET_EMISSIVE/4)
  for(let i = 0; i < 4; i++)
    view.setUint32(MATERIAL_RECORD_OFFSET_TEXTURES + i*4, material.textures[i] ?? 0, true)
  array[MATERIAL_RECORD_OFFSET_SHININESS/4] = material.shininess

  state.device.queue.writeBuffer(
    state.buffer,
    offset,
    state.bufferData,
    offset,
    MATERIAL_RECORD_SIZE
  )
}

/** Update the GPU buffer for all active materials.
 * 
 * TODO: no allocations here
 */
export function updateMaterials(state: MaterialState): void {
  const array = new Float32Array(state.bufferData)
  const view = new DataView(state.bufferData)
  for (const material of state.materials) {
    if (material.slot === null)
      continue // inactive
    const offset = material.slot * MATERIAL_RECORD_SIZE/4
    array.set(material.ambient,   offset + MATERIAL_RECORD_OFFSET_AMBIENT/4)
    array.set(material.diffuse,   offset + MATERIAL_RECORD_OFFSET_DIFFUSE/4)
    array.set(material.specular,  offset + MATERIAL_RECORD_OFFSET_SPECULAR/4)
    array.set(material.emissive,  offset + MATERIAL_RECORD_OFFSET_EMISSIVE/4)
    for(let i = 0; i < 4; i++)
      view.setUint32(offset + MATERIAL_RECORD_OFFSET_TEXTURES + i*4, material.textures[i] ?? 0, true)
    array[offset + MATERIAL_RECORD_OFFSET_SHININESS/4] = material.shininess
  }
  state.device.queue.writeBuffer(
    state.buffer,
    0,
    state.bufferData,
    0,
    state.bufferData.byteLength,
  )
}

/** Request the use of a material and returns the material slot index.
 * 
 * If the material is not active, it will be activated if the buffer has room,
 * otherwise an error will be thrown. 
 */
export function useMaterial(id: number, state: MaterialState): number {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  if (material.slot === null)
    activateMaterial(id, state)

  material.usage++

  return material.slot
}

/** Request the use of a material by name and returns the material slot index.
 * 
 * If the material is not active, it will be activated if the buffer has room,
 * otherwise an error will be thrown. 
 */
export function useMaterialByName(name: string, state: MaterialState): number {
  const material = state.materials.find(m => m.name === name)
  if (!material)
    throw new Error(`Invalid material name: ${name}`)
  return useMaterial(material.id, state)
}

/** Release a material from use.
 * 
 * Optionally, the material can be deactivated if it is no longer in use.
 */
export function releaseMaterial(id: number, state: MaterialState, deactivate = true): void {
  if(!(id in state.materials))
    throw new Error(`Invalid material ID: ${id}`)

  const material = state.materials[id]

  if(material.slot === null)
    throw new Error('Cannot release inactive material')

  if(material.usage < 1)
    throw new Error('Cannot release material not in use')

  material.usage--
  if (material.usage === 0 && deactivate)
    deactivateMaterial(id, state)
}

/** Release a material from use by name. */
export function releaseMaterialByName(name: string, state: MaterialState, deactivate = true): void {
  const material = state.materials.find(m => m.name === name)
  if (!material)
    throw new Error(`Invalid material name: ${name}`)
  releaseMaterial(material.id, state, deactivate)
}

