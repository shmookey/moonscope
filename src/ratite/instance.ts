/** instance.ts -- Instance allocator for WebGPU
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
 */

import type { InstanceAllocation, InstanceAllocator, InstanceRecord } from "./types"
import { INSTANCE_INDEX_SIZE, INSTANCE_BLOCK_SIZE } from "./constants.js"

/** Initialise the instance allocator. */
export function createInstanceAllocator(device: GPUDevice, capacity: number): InstanceAllocator {
  const storageBuffer = device.createBuffer({
    size: capacity * INSTANCE_BLOCK_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const instanceBuffer = device.createBuffer({
    size: capacity * INSTANCE_INDEX_SIZE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  return { 
    storageBuffer,
    instanceBuffer,
    nextAllocationId: 0, 
    nextInstanceId: 0,
    nextStorageSlot: 0,
    nextInstanceSlot: 0,
    capacity, 
    slotsAllocated: 0,
    allocations: [],
    instances: [],
    vacated: [],
  }
}

/** Allocate space in the buffer. Returns the allocation ID. */
export function registerAllocation(capacity: number, allocator: InstanceAllocator): number {
  if(allocator.slotsAllocated + capacity > allocator.capacity) {
    throw new Error('Instance buffer is full')
  }
  const allocationId = allocator.nextAllocationId
  const instanceIndex = allocator.nextInstanceSlot
  const meshAllocation: InstanceAllocation = {
    id: allocationId, 
    instanceIndex, 
    capacity, 
    numInstances: 0,
    numActive: 0,
    slotData: new Uint32Array(capacity),
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
    data: ArrayBuffer | null, 
    device: GPUDevice, 
    allocator: InstanceAllocator,
    activate: boolean = true): number {

  if(data !== null && data.byteLength !== INSTANCE_BLOCK_SIZE) {
    throw new Error('Invalid instance data size')
  }
  if(!(allocationId in allocator.allocations)) {
    throw new Error('Invalid allocation ID')
  }
  const allocation = allocator.allocations[allocationId]
  if(allocation.numInstances >= allocation.capacity) {
    throw new Error('Allocation is full')
  }
  
  const instanceId = allocator.nextInstanceId
  
  let storageSlot = null
  if(allocator.vacated.length > 0) {
    storageSlot = allocator.vacated.pop()
  } else {
    storageSlot = allocator.nextStorageSlot
    allocator.nextStorageSlot++
  }

  const instance: InstanceRecord = { 
    instanceId, 
    allocationId, 
    instanceSlot: null, 
    storageSlot 
  }
  allocator.instances[instanceId] = instance

  const storagePointer = storageSlot * INSTANCE_BLOCK_SIZE

  if(data !== null)
    device.queue.writeBuffer(allocator.storageBuffer, storagePointer, data)

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
    allocator: InstanceAllocator,
    device: GPUDevice): void {
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
  const instancePointer = instanceSlot * INSTANCE_INDEX_SIZE
  device.queue.writeBuffer(allocator.instanceBuffer, instancePointer, new Uint32Array([instance.storageSlot]))
  allocation.slotData[instanceSlot - base] = instance.storageSlot
  allocation.slotInstances[instanceSlot - base] = instanceId
  instance.instanceSlot = instanceSlot
  allocation.numActive++
}

/** Deactivate an instance in the buffer. */
export function deactivateInstance(
    instanceId: number,
    allocator: InstanceAllocator,
    device: GPUDevice): void {
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
  const instancePointer = instance.instanceSlot * INSTANCE_INDEX_SIZE
  const changedRegion = allocation.slotData.slice(rel, allocation.numActive)
  device.queue.writeBuffer(allocator.instanceBuffer, instancePointer, changedRegion)
  instance.instanceSlot = null
  allocation.numActive--
}

/** Update an instance in the buffer. */
export function updateInstanceData(
    instanceData: ArrayBuffer, 
    instanceId: number, 
    allocator: InstanceAllocator,
    device: GPUDevice, 
    offset: number = 0): void {
  
  if(instanceData.byteLength + offset > INSTANCE_BLOCK_SIZE) {
    throw new Error('Invalid instance data size or offset')
  }
  if(!(instanceId in allocator.instances)) {
    throw new Error('Invalid instance ID')
  }
  const instance = allocator.instances[instanceId]
  const { storageBuffer } = allocator
  device.queue.writeBuffer(
    storageBuffer, 
    instance.storageSlot * INSTANCE_BLOCK_SIZE + offset, 
    instanceData)

}

