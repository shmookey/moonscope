The following is an overview of how shadow volumes will be implemented in the engine. The implementation is based on the paper "Real-Time Shadows" by Eric Lengyel.

The shadow volume is a volume that is extruded from the silhouette of the object. The silhouette is the edge of the object that is visible from the light source. The silhouette is calculated by projecting the object onto the light source's view plane. The silhouette is then extruded from the object to the light source. The extrusion is done by creating a quad for each edge of the silhouette. The quads are then connected to form a volume. The volume is then clipped to the view frustum. The volume is then rendered using stencil shadows.

