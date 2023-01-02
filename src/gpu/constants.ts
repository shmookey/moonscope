export const VERTEX_SIZE  = 64 // Byte length of storable vertex attributes
export const INDEX_SIZE = 4 // Byte length of vertex indices
export const INSTANCE_BLOCK_SIZE = 4*4*4 + 4*4  // model matrix + texture bounds
export const INSTANCE_BLOCK_FLOATS = INSTANCE_BLOCK_SIZE / 4
export const INSTANCE_INDEX_SIZE = 4
export const UNIFORM_BUFFER_SIZE = 2 * 4*4*4   // view + projection matrices
export const UNIFORM_BUFFER_FLOATS = UNIFORM_BUFFER_SIZE / 4

