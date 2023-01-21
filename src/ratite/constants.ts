export const VERTEX_SIZE  = 64 // Byte length of storable vertex attributes
export const INDEX_SIZE = 4 // Byte length of vertex indices
export const INSTANCE_BLOCK_SIZE = 4*4*4 + 4*4  // model matrix + texture bounds
export const INSTANCE_BLOCK_FLOATS            = INSTANCE_BLOCK_SIZE / 4
export const INSTANCE_INDEX_SIZE              = 4

// Uniform buffer

export const UNIFORM_BUFFER_SIZE              = 2 * 4*4*4                 // view + projection matrices
export const UNIFORM_BUFFER_FLOATS            = UNIFORM_BUFFER_SIZE / 4
export const UNIFORM_BUFFER_OFFSET_VIEW       = 0
export const UNIFORM_BUFFER_OFFSET_PROJECTION = 64

// Light source uniforms

export const LIGHT_BUFFER_OFFSET_COUNT       =    0 // Byte offset of light source count in light source data
export const LIGHT_BUFFER_OFFSET_RECORDS     =   16 // Byte offset of records in light source data

export const LIGHT_RECORD_SIZE               = 128  // Byte length of light source record uniform
export const LIGHT_RECORD_OFFSET_TYPE        =   0  // Byte offset of light source type
export const LIGHT_RECORD_OFFSET_POSITION    =  16  // Byte offset of light source position
export const LIGHT_RECORD_OFFSET_DIRECTION   =  32  // Byte offset of light source direction
export const LIGHT_RECORD_OFFSET_ATTENUATION =  48  // Byte offset of light source attenuation
export const LIGHT_RECORD_OFFSET_AMBIENT     =  64  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_DIFFUSE     =  80  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_SPECULAR    =  96  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_CONE        = 112  // Byte offset of light source cone

export const LIGHT_SOURCE_TYPE = {point: 0, directional: 1, spot: 2} // Light source type enum

// Material uniforms

export const MATERIAL_RECORD_SIZE             = 96 // Byte length of material record uniform
export const MATERIAL_RECORD_OFFSET_AMBIENT   = 0  // Byte offset of material ambient colour
export const MATERIAL_RECORD_OFFSET_DIFFUSE   = 16 // Byte offset of material diffuse colour
export const MATERIAL_RECORD_OFFSET_SPECULAR  = 32 // Byte offset of material specular colour
export const MATERIAL_RECORD_OFFSET_EMISSIVE  = 48 // Byte offset of material emissive colour
export const MATERIAL_RECORD_OFFSET_TEXTURES  = 64 // Byte offset of material textures
export const MATERIAL_RECORD_OFFSET_SHININESS = 80 // Byte offset of material shininess

