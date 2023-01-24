// Values defined in `doc/Shader interface.txt`

// Vertex attributes
export const VERTEX_SIZE                      =  64  // Byte length of storable vertex attributes
export const INDEX_SIZE                       =   4  // Byte length of vertex indices

// Instance buffer
export const INSTANCE_INDEX_SIZE              =   4  // Byte length of instance slot index
export const INSTANCE_RECORD_SIZE             =  80  // Aligned byte length of instance data
export const INSTANCE_RECORD_FLOATS           =  20  // Number of floats in instance data
export const INSTANCE_RECORD_OFFSET_MODELVIEW =   0  // Byte offset of modelview matrix
export const INSTANCE_RECORD_OFFSET_MATERIAL  =  64  // Byte offset of material id

// Uniform buffer
export const UNIFORM_BUFFER_SIZE              = 132  // Byte length of uniform buffer
export const UNIFORM_BUFFER_FLOATS            =  33  // Number of floats in uniform buffer
export const UNIFORM_BUFFER_OFFSET_VIEW       =   0  // Byte offset of view matrix
export const UNIFORM_BUFFER_OFFSET_PROJECTION =  64  // Byte offset of projection matrix

// Light source records
export const LIGHT_BUFFER_OFFSET_COUNT        =   0  // Byte offset of light source count in light source data
export const LIGHT_BUFFER_OFFSET_RECORDS      =  16  // Byte offset of records in light source data
export const LIGHT_RECORD_SIZE                = 128  // Aligned byte length of light source record
export const LIGHT_RECORD_OFFSET_TYPE         =   0  // Byte offset of light source type
export const LIGHT_RECORD_OFFSET_POSITION     =  16  // Byte offset of light source position
export const LIGHT_RECORD_OFFSET_DIRECTION    =  32  // Byte offset of light source direction
export const LIGHT_RECORD_OFFSET_ATTENUATION  =  48  // Byte offset of light source attenuation
export const LIGHT_RECORD_OFFSET_AMBIENT      =  64  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_DIFFUSE      =  80  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_SPECULAR     =  96  // Byte offset of light source colour
export const LIGHT_RECORD_OFFSET_CONE         = 112  // Byte offset of light source cone
export const LIGHT_SOURCE_TYPE                = {point: 0, directional: 1, spot: 2}

// Material records
export const MATERIAL_RECORD_SIZE             =  96  // Byte length of material record uniform
export const MATERIAL_RECORD_OFFSET_AMBIENT   =   0  // Byte offset of material ambient colour
export const MATERIAL_RECORD_OFFSET_DIFFUSE   =  16  // Byte offset of material diffuse colour
export const MATERIAL_RECORD_OFFSET_SPECULAR  =  32  // Byte offset of material specular colour
export const MATERIAL_RECORD_OFFSET_EMISSIVE  =  48  // Byte offset of material emissive colour
export const MATERIAL_RECORD_OFFSET_TEXTURES  =  64  // Byte offset of material textures
export const MATERIAL_RECORD_OFFSET_SHININESS =  80  // Byte offset of material shininess

