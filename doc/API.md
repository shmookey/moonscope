List of API functions
=====================

## scene.js

- createScene()
- createSceneGraph()
- createSceneGraphFromDescriptor()
- createNodeFromDescriptor()
- setNodeVisibility()
- setTransform()
- applyTransform()
- applyPreTransform()
- computeMatrix()
- cloneNode()
- createSceneView()
- createModelNode()
- createCameraNode()
- createTransformNode()
- registerSceneGraphModel()
- attachNode()
- detachNode()
- isNodeVisible()
- getNodeByName()
- getChildNodeByName()
- updateModelViews()
- getModelMatrix()
- getViewMatrix()
- checkProjection()

## render.js

- createRenderer()
- renderView()
- renderFrame()
- makePipeline()

## vertex.js

- readVertices()
- writeVertices()
- Vertex()

## atlas.js

- createAtlas()
- addSubTexture()
- createSubTextureView()
- copyImageBitmapToSubTexture()
- copyImageToSubTexture()
- findSpaceInAtlas()
- findSpaceInLayer()
- getLayerAsImageBitmap()

## camera.js

- createCamera()
- createFirstPersonCamera()
- getCameraViewMatrix()
- adjustAltitude()
- adjustAzimuth()
- adjustAltAz()
- applyFirstPersonCamera()
- rotateFirstPersonCamera()
- moveFirstPersonCameraForward()
- moveFirstPersonCameraRight()
- moveFirstPersonCameraUp()
- moveFirstPersonCameraUpScale()

## instance.js

- createInstanceAllocator()
- registerAllocation()
- addInstance()
- activateInstance()
- deactivateInstance()
- updateInstanceData()

## mesh.js

- createMeshStore()
- addMesh()
- removeMesh()
- getMeshById()
- getMeshByName()
- serialiseVertices()
- serialiseMeshes()
- serialiseMeshToJSON()
- prepareVertexForJSON()

## pipeline.js

- createMainUniformBuffer()
- setViewMatrix()
- setProjectionMatrix()
- createMainBindGroupLayout()
- createMainBindGroup()
- createMainSampler()
- createMainPipelineLayout()
- createPipeline()

## resource.js

- loadResourceBundle()
- loadResourceBundleFromDescriptor()
- loadMeshResource()
- loadTextureResource()
- loadImageBitmap()
- loadImageSVG()
- loadImage()
- loadShaderResource()
- setupPipeline()
- fetchResourceBundleDescriptor()
- validateBundleDescriptor()

# skybox.js

- createSkybox()
- writeSkyboxTextures()

# builder/mesh.js

- square()
- setTextures()
- v3translateMesh()
- uniformScaleMeshPosition()
- uniformScaleMeshPositionUV()
- v3translateVertex()
- v3sub()
- v3add()
- v3mid()
- v3cross()
- v3normalize()
- triangleNormal()

# builder/objparse.js

- objToXMesh()
- parseObjFile()
- objGroupToXMesh()

# builder/polyhedron.js

- icosahedron()
- subdividedIcosahedron()
- polyhedronMesh()
- subdivideTrianglePolyhedronByCentroid()
- subdivideTrianglePolyhedronByMidpoint()
- projectToUnitSphere()

