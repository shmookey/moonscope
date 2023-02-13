/** instance.ts -- Instance allocator for WebGPU
 * 
 * Note: this was one of the earlier modules I wrote for this project and while
 * it is reasonably close to correct, some of the language and design is not
 * consistent with the rest of the project. At some point this module will be
 * renamed "model manager" to better reflect its purpose.
 * 
 * This module manages buffers for instance data, which comprise a large buffer
 * of uniform data (the "storage buffer") visible to shaders with a storage
 * buffer, and a secondary "instance buffer" which contains indexes into the
 * storage buffer, which are sent to the vertex shader as instance attributes.
 * The functions in this module manage the process of adding and updating
 * mesh and instance records in such a way as to facilitate minimising draw
 * calls and maximising the number of instances per draw call.
 *
 * Before instances for a model can be added to the buffer, the model must be
 * registered, which allocates a region of the instance buffer for the model.
 * In the current implementation, the size of this region cannot be changed and
 * represents the maximum number of instances for that mesh that can be stored
 * in the buffer. Since instance buffer records are a single 32-bit integer, it
 * is generally safe to pick generous values for these allocations.
 * 
 * The total capacity of the buffers is also set at time of creation and, in
 * the current implementation, cannot be changed. 
 * 
 * Instances in the storage buffer are not stored contiguously and can be added
 * and removed with minimal overhead. The instance buffer, however, is stored
 * contiguously and so removals require all subsequent instances to be moved
 * down in the buffer.
 * 
 * Indices in the storage and index buffers may be reused and are not
 * guaranteed to be static or globally unique from the perspective of the
 * application. Instance records, storage buffer indices and application
 * code are linked by instance IDs, which are unique and do not change.
 * 
 * When a model is registered, a material name may be associated with the mesh.
 * If present, the name is resolved to a material slot index which is used as
 * default material for new instances of the model. Materials are a per-
 * instance property and may be overridden by the application.
 */

import type { InstanceAllocation, InstanceAllocator, InstanceData, InstanceRecord } from "./types"
import { 
  INSTANCE_INDEX_SIZE, INSTANCE_RECORD_SIZE, INSTANCE_RECORD_OFFSET_MODELVIEW, 
  INSTANCE_RECORD_OFFSET_MATERIAL 
} from "./constants.js"

/** Initialise the instance allocator. */
export function createInstanceAllocator(device: GPUDevice, capacity: number): InstanceAllocator {
  const storageBufferSize = capacity * INSTANCE_RECORD_SIZE
  const instanceBufferSize = capacity * INSTANCE_INDEX_SIZE
  const storageBuffer = device.createBuffer({
    size:  storageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const instanceBuffer = device.createBuffer({
    size:  instanceBufferSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  const storageData = new ArrayBuffer(storageBufferSize)
  const instanceData = new ArrayBuffer(instanceBufferSize)
  return { 
    storageBuffer:    storageBuffer,
    instanceBuffer:   instanceBuffer,
    storageData:      storageData,
    instanceData:     instanceData,
    nextAllocationId: 0, 
    nextInstanceId:   0,
    nextStorageSlot:  0,
    nextInstanceSlot: 0,
    capacity:         capacity, 
    slotsAllocated:   0,
    allocations:      [],
    instances:        [],
    vacated:          [],
  }
}

/** Allocate space in the buffer. Returns the allocation ID. */
export function registerAllocation(capacity: number, allocator: InstanceAllocator): number {
  if(allocator.slotsAllocated + capacity > allocator.capacity) {
    throw new Error('Instance buffer is full')
  }
  const allocationId = allocator.nextAllocationId
  const instanceIndex = allocator.nextInstanceSlot
  const instanceOffset = instanceIndex * INSTANCE_INDEX_SIZE
  const instanceLength = capacity * INSTANCE_INDEX_SIZE
  const meshAllocation: InstanceAllocation = {
    id: allocationId, 
    instanceIndex, 
    capacity, 
    numInstances: 0,
    numActive: 0,
    slotData: new Uint32Array(allocator.instanceData, instanceOffset, instanceLength),
    slotInstances: new Uint32Array(capacity),
  }
  allocator.allocations[allocationId] = meshAllocation
  allocator.nextAllocationId++
  allocator.nextInstanceSlot += capacity
  allocator.slotsAllocated += capacity
  return allocationId
}


/** Add an instance to the buffer. Returns the instance ID.
 * 
 * If `activate` is true, the instance will be given an instance buffer slot.
 */
export function addInstance(
    allocationId: number, 
    data:         InstanceData, 
    device:       GPUDevice, 
    allocator:    InstanceAllocator,
    activate:     boolean = true): number {

  if(!(allocationId in allocator.allocations)) {
    throw new Error('Invalid allocation ID')
  }
  const allocation = allocator.allocations[allocationId]
  if(allocation.numInstances >= allocation.capacity) {
    throw new Error('Allocation is full')
  }
  
  let storageSlot = null
  if(allocator.vacated.length > 0) {
    storageSlot = allocator.vacated.pop()
  } else {
    storageSlot = allocator.nextStorageSlot
    allocator.nextStorageSlot++
  }
  const storagePointer = storageSlot * INSTANCE_RECORD_SIZE
  const instanceId = allocator.nextInstanceId
  serialiseInstanceData(data, allocator.storageData, storagePointer)

  const instance: InstanceRecord = { 
    instanceId:   instanceId, 
    allocationId: allocationId,
    instanceSlot: null, 
    storageSlot:  storageSlot,
  }
  allocator.instances[instanceId] = instance

  allocation.numInstances++
  allocator.nextInstanceId++

  if(activate) {
    activateInstance(instanceId, allocator, device)
  }

  return instanceId
}

/** Activate an instance in the buffer.
 * 
 * Places an index into the storage buffer corresponding to the instance in the
 * instance buffer for rendering.
 */
export function activateInstance(
    instanceId: number,
    allocator:  InstanceAllocator,
    device:     GPUDevice): void {
  if(!(instanceId in allocator.instances)) {
    throw new Error('Invalid instance ID')
  }
  const instance = allocator.instances[instanceId]
  if(instance.instanceSlot !== null) {
    console.warn(`Activating already active instance: ${instanceId}`)
    return
  }
  
  const allocation = allocator.allocations[instance.allocationId]
  const base = allocation.instanceIndex
  const instanceSlot = base + allocation.numActive
  allocation.slotData[instanceSlot - base] = instance.storageSlot
  allocation.slotInstances[instanceSlot - base] = instanceId
  instance.instanceSlot = instanceSlot
  allocation.numActive++
}

/** Deactivate an instance in the buffer. */
export function deactivateInstance(
    instanceId: number,
    allocator:  InstanceAllocator,
    device:     GPUDevice): void {
  if(!(instanceId in allocator.instances)) {
    throw new Error('Invalid instance ID')
  }
  const instance = allocator.instances[instanceId]
  if(instance.instanceSlot === null) {
    console.warn(`Deactivating already inactive instance: ${instanceId}`)
    return
  }
  const allocation = allocator.allocations[instance.allocationId]
  const base = allocation.instanceIndex
  const rel = instance.instanceSlot - base
  const instanceIdsAfter = allocation.slotInstances.slice(rel + 1, allocation.numActive)
  const storageSlotsAfter = allocation.slotData.slice(rel + 1, allocation.numActive)
  allocation.slotData.set(storageSlotsAfter, rel)
  allocation.slotInstances.set(instanceIdsAfter, rel)
  allocation.slotData[allocation.numActive - 1] = 0
  allocation.slotInstances[allocation.numActive - 1] = 0
  instance.instanceSlot = null
  allocation.numActive--
}

/** Update an instance. */
export function updateInstanceData(
    instanceId:   number, 
    allocator:    InstanceAllocator,
    device:       GPUDevice,
    data?:        InstanceData): void {
  
  if(!(instanceId in allocator.instances)) {
    throw new Error('Invalid instance ID')
  }
  const instance = allocator.instances[instanceId]
  const storagePointer = instance.storageSlot * INSTANCE_RECORD_SIZE
  if(data)
    serialiseInstanceData(data, allocator.storageData, storagePointer)

}

/** Sync the instance and storage buffers with the GPU. */
export function syncInstanceBuffers(allocator: InstanceAllocator, device: GPUDevice): void {
  device.queue.writeBuffer(allocator.storageBuffer, 0, allocator.storageData)
  device.queue.writeBuffer(allocator.instanceBuffer, 0, allocator.instanceData)
}

const serialiseInstanceData_buffer = new ArrayBuffer(INSTANCE_RECORD_SIZE)

/** Serialise instance data.
 * 
 * This is a helper function for serialising instance data into an ArrayBuffer.
 * If an output buffer is not provided, a temporary one will be used. Its
 * contents may be overwritten on the next call.
 * 
 * TODO: eliminate allocations
 * 
 * @param data   Instance data to serialise.
 * @param out    Output buffer.
 * @param offset Offset into the output buffer.
 * @returns The output buffer.
 */
export function serialiseInstanceData(
    data:   InstanceData, 
    out:    ArrayBuffer = serialiseInstanceData_buffer,
    offset: number      = 0): ArrayBuffer {

  const view = new DataView(out, offset + INSTANCE_RECORD_OFFSET_MATERIAL)
  const arr = new Float32Array(out, offset, INSTANCE_RECORD_SIZE / 4)
  arr.set(data.modelView)
  view.setUint32(0, data.materialId, true)
  return out
}
