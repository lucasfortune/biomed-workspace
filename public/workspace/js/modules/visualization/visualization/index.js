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
    disposeMeshes,
    setMeshVisibility,
    setMeshOpacity,
    getMeshBoundingBox,
    centerMeshGroup
} from './meshLoader.js';

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
    createClassMaterial
} from './utils.js';
