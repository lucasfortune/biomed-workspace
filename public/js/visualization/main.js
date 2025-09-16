// main.js - Main entry point and coordination module
// This file orchestrates the initialization and coordinates between all modules

// Import functions from other modules
import { initializeScene, startRenderLoop, positionCameraForMesh } from './scene.js';
import { loadSegmentationData, createSeparateClassMeshes } from './meshCreation.js';
import { setupVisualizationControls } from './uiControls.js';
import { setupEnhancedControls } from './interactions.js';
import { createFallbackMesh, createErrorFallbackMesh } from './utils.js';

// Global variables that need to be shared across modules
export let scene, camera, renderer;
export let meshGroup, segmentationMesh, classMeshes = {};
export let availableClasses = [], visibleClasses = [];
export let segmentationData = null;
export let sliceDirection = 'z';
export let classControlStates = {};

/**
 * Main initialization function for the 3D visualization
 * This is the entry point that coordinates all other modules
 */
export async function initialize3DVisualization() {
    console.log('=== ENHANCED 3D VISUALIZATION INIT ===');
    
    const container = document.getElementById('threejsContainer');
    if (!container) {
        console.error('3D container not found!');
        return;
    }
    
    try {
        // Initialize Three.js scene
        const sceneComponents = initializeScene(container);
        scene = sceneComponents.scene;
        camera = sceneComponents.camera;
        renderer = sceneComponents.renderer;
        
        // Try to load segmentation data
        if (window.inferenceResult && window.inferenceResult.visualization_path) {
            console.log('Loading segmentation data for surface mesh creation...');
            console.log('Visualization path:', window.inferenceResult.visualization_path);
            
            // Load the segmentation data
            segmentationData = await loadSegmentationData(window.inferenceResult.visualization_path);
            console.log('Segmentation data loaded successfully');
            
            // Create separate meshes for each class
            console.log('Creating separate class meshes...');
            const meshResult = createSeparateClassMeshes(segmentationData, scene);
            
            if (meshResult && meshResult.meshGroup && meshResult.meshGroup.children.length > 0) {
                console.log('Separate class meshes created successfully');
                
                // Update global variables from mesh creation result
                meshGroup = meshResult.meshGroup;
                classMeshes = meshResult.classMeshes;
                availableClasses = meshResult.availableClasses;
                visibleClasses = meshResult.visibleClasses;
                segmentationMesh = meshGroup;
                
                // Detailed debugging output
                logMeshDebugInfo();
                
                // Position camera optimally for the mesh
                positionCameraForMesh(meshGroup);
                
            } else {
                console.warn('No meshes were created from segmentation data');
                createFallbackMeshes();
            }
            
        } else {
            console.log('No visualization data available, creating placeholder');
            createFallbackMeshes();
        }
        
        // Setup all controls and interactions
        setupAllControls();
        
        // Start render loop
        startRenderLoop();
        
        console.log('=== 3D VISUALIZATION INITIALIZATION COMPLETE ===');
        
    } catch (error) {
        console.error('3D visualization failed:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Error fallback
        createErrorFallbackMeshes();
        
        // Still setup basic controls so the interface works
        setupAllControls();
        startRenderLoop();
    }
}

/**
 * Log detailed mesh debug information
 */
function logMeshDebugInfo() {
    console.log('=== DETAILED MESH DEBUG ===');
    console.log('Mesh group exists:', !!meshGroup);
    console.log('Number of class meshes:', Object.keys(classMeshes).length);
    console.log('Available classes:', availableClasses);
    
    // Debug each class mesh
    Object.keys(classMeshes).forEach(classValue => {
        const mesh = classMeshes[classValue];
        console.log(`Class ${classValue}:`, {
            vertices: mesh.geometry.attributes.position.count,
            visible: mesh.visible,
            material: mesh.material.type,
            opacity: mesh.material.opacity
        });
    });
}

/**
 * Create fallback meshes when no data is available
 */
function createFallbackMeshes() {
    const fallbackResult = createFallbackMesh(scene);
    
    availableClasses = fallbackResult.availableClasses;
    visibleClasses = fallbackResult.visibleClasses;
    classMeshes = fallbackResult.classMeshes;
    meshGroup = fallbackResult.meshGroup;
    segmentationMesh = fallbackResult.segmentationMesh;
}

/**
 * Create error fallback meshes when something goes wrong
 */
function createErrorFallbackMeshes() {
    const errorResult = createErrorFallbackMesh(scene);
    
    availableClasses = errorResult.availableClasses;
    visibleClasses = errorResult.visibleClasses;
    classMeshes = errorResult.classMeshes;
    meshGroup = errorResult.meshGroup;
    segmentationMesh = errorResult.segmentationMesh;
}

/**
 * Setup all controls and interactions
 */
function setupAllControls() {
    // Setup visualization controls (UI panels)
    setupVisualizationControls(availableClasses, classMeshes, classControlStates);
    
    // Setup enhanced controls for mesh interaction (mouse, keyboard)
    if (renderer && meshGroup) {
        setupEnhancedControls(renderer, meshGroup, classControlStates);
    }
}

/**
 * Reset the entire visualization to default state
 */
export function resetView() {
    console.log('Resetting view to defaults');
    
    // Reset individual class controls instead of shared ones
    availableClasses.forEach(classValue => {
        // Reset state
        classControlStates[classValue] = {
            visible: true,
            opacity: 80,
            rangeMin: 0,
            rangeMax: 100
        };
        
        // Reset UI controls
        const checkbox = document.getElementById(`classCheckbox_${classValue}`);
        const opacitySlider = document.getElementById(`classOpacity_${classValue}`);
        const opacityValue = document.getElementById(`classOpacityValue_${classValue}`);
        const rangeMin = document.getElementById(`dualRangeMin_${classValue}`);
        const rangeMax = document.getElementById(`dualRangeMax_${classValue}`);
        const rangeValue = document.getElementById(`classRangeValue_${classValue}`);
        
        if (checkbox) checkbox.checked = true;
        if (opacitySlider) opacitySlider.value = 80;
        if (opacityValue) opacityValue.textContent = '80%';
        if (rangeMin) rangeMin.value = 0;
        if (rangeMax) rangeMax.value = 100;
        if (rangeValue) rangeValue.textContent = '0% - 100%';
        
        // Update dual-range fill
        const fill = document.getElementById(`dualRangeFill_${classValue}`);
        if (fill) {
            fill.style.left = '0%';
            fill.style.width = '100%';
        }
        
        // Reset panel visual state
        const panel = document.querySelector(`[data-class="${classValue}"]`);
        if (panel) {
            panel.classList.remove('disabled');
        }
    });
    
    // Reset global variables
    visibleClasses = [...availableClasses];
    
    // Reset all class meshes
    if (classMeshes) {
        Object.keys(classMeshes).forEach(classValue => {
            const classMesh = classMeshes[classValue];
            
            // Reset visibility
            classMesh.visible = true;
            
            // Reset material properties
            if (classMesh.material) {
                classMesh.material.opacity = 0.8;
                classMesh.material.transparent = true;
                // Initialize clippingPlanes if it doesn't exist, then clear it
                if (!classMesh.material.clippingPlanes) {
                    classMesh.material.clippingPlanes = [];
                } else {
                    classMesh.material.clippingPlanes = []; // Remove clipping planes
                }
                classMesh.material.needsUpdate = true;
            }
            
            // Reset rotation
            classMesh.rotation.set(0, 0, 0);
        });
    }
    
    // Reset mesh group rotation
    if (meshGroup) {
        meshGroup.rotation.set(0, 0, 0);
    }
    
    // Reset camera position
    if (camera) {
        camera.position.set(8, 6, 8);
        camera.lookAt(0, 0, 0);
    }
    
    // Disable clipping planes
    if (renderer) {
        renderer.localClippingEnabled = false;
    }
    
    // Force re-render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    
    console.log('View reset complete with individual class controls');
}

// Export global variables so other modules can access them
export function getGlobalState() {
    return {
        scene,
        camera,
        renderer,
        meshGroup,
        segmentationMesh,
        classMeshes,
        availableClasses,
        visibleClasses,
        segmentationData,
        sliceDirection,
        classControlStates
    };
}

// Allow other modules to update global state
export function updateGlobalState(updates) {
    if (updates.scene !== undefined) scene = updates.scene;
    if (updates.camera !== undefined) camera = updates.camera;
    if (updates.renderer !== undefined) renderer = updates.renderer;
    if (updates.meshGroup !== undefined) meshGroup = updates.meshGroup;
    if (updates.segmentationMesh !== undefined) segmentationMesh = updates.segmentationMesh;
    if (updates.classMeshes !== undefined) classMeshes = updates.classMeshes;
    if (updates.availableClasses !== undefined) availableClasses = updates.availableClasses;
    if (updates.visibleClasses !== undefined) visibleClasses = updates.visibleClasses;
    if (updates.segmentationData !== undefined) segmentationData = updates.segmentationData;
    if (updates.sliceDirection !== undefined) sliceDirection = updates.sliceDirection;
    if (updates.classControlStates !== undefined) classControlStates = updates.classControlStates;
}