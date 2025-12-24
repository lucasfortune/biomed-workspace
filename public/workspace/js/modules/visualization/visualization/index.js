/**
 * Visualization Module Exports
 *
 * Central export point for all visualization sub-modules.
 */

// Scene setup and management
export {
    initializeScene,
    startRenderLoop,
    startRenderLoopWithId,
    stopRenderLoop,
    positionCameraForMesh,
    handleResize,
    disposeScene,
    getSceneState,
    scene,
    camera,
    renderer
} from './scene.js';

// Mesh loading
export {
    loadMeshFromJSON,
    detectMeshFormat,
    disposeMeshes,
    setMeshVisibility,
    setMeshOpacity,
    getMeshBoundingBox,
    centerMeshGroup
} from './meshLoader.js';

// Slice-based mesh creation (for VoxelSlices format)
export {
    createSliceBasedClassMeshes,
    setClassSliceRange,
    setClassVisibility,
    setClassOpacity,
    disposeSliceMeshes,
    // Original data overlay
    loadAndCreateOriginalDataPlanes,
    setOriginalDataVisibility,
    setOriginalDataOpacity,
    setOriginalDataSliceRange,
    disposeOriginalDataPlanes
} from './meshCreation.js';

// Dynamic endcap generation (clipping)
export {
    updateAccurateCapping,
    removeCappingMeshesForClass,
    removeAllCappingMeshes,
    getCappingMeshesForClass,
    setCappingOpacity,
    setCappingVisibility
} from './clipping.js';

// User interactions (mouse, keyboard, touch)
export {
    setupEnhancedControls,
    setupDoubleClickReset
} from './interactions.js';

// Utility functions
export {
    CLASS_COLORS,
    getClassColor,
    getClassColorThree,
    getClassColorHex,
    createFallbackMesh,
    createErrorFallbackMesh,
    formatBytes,
    formatNumber,
    clamp,
    lerp,
    mapRange,
    debounce,
    createClassMaterial,
    // Voxel helpers (for slice-based mesh creation)
    getVoxelValue,
    addQuadFace,
    centerAndScaleGeometry
} from './utils.js';
