// main.js - Main entry point and coordination module
// This file orchestrates the initialization and coordinates between all modules

// Import functions from other modules
import { initializeScene, startRenderLoop, positionCameraForMesh } from './scene.js';
import { loadSegmentationData, createSeparateClassMeshes, loadAndCreateOriginalDataPlanes } from './meshCreation.js';
import { setupVisualizationControls } from './uiControls.js';
import { setupEnhancedControls } from './interactions.js';
import { createFallbackMesh, createErrorFallbackMesh } from './utils.js';
import { removeAllCappingMeshes } from './clipping.js';

// NEW: Access utils functions from parent directory
const showLoading = window.showLoading || (() => console.log('showLoading not available'));
const hideLoading = window.hideLoading || (() => console.log('hideLoading not available'));
const updateLoadingMessage = window.updateLoadingMessage || ((t, d) => console.log('[Loading]', t, d));

// Global variables that need to be shared across modules
export let scene, camera, renderer;
export let meshGroup, segmentationMesh, classMeshes = {};
export let sliceMeshes = {};
export let originalDataPlanes = [];
export let originalDataPlaneGroup = null;
export let sliceMetadata = { sliceCount: 20, sliceDirection: 'z', visibleSliceRange: [0, 19] };
export let classSliceRanges = {}; 
export let classBoundaryMeshes = {};
export let availableClasses = [], visibleClasses = [];
export let segmentationData = null;
export let sliceDirection = 'z';
export let classControlStates = {};
export let originalDataRangeMin = 0;
export let originalDataRangeMax = 100;

/**
 * Main initialization function for the 3D visualization
 * This is the entry point that coordinates all other modules
 */
export async function initialize3DVisualization() {
    const container = document.getElementById('threejsContainer');
    if (!container) {
        console.error('3D container not found!');
        return;
    }

    // NEW: Check if already initialized to prevent retriggering
    if (processStates && processStates.visualizationInitialized) {
        console.log('3D visualization already initialized, skipping...');
        return;
    }

    // NEW: Check if we have inference results
    if (!window.inferenceResult || !window.inferenceResult.visualization_path) {
        console.log('No inference results available for 3D visualization');
        hideLoading();
        
        // Show user-friendly message
        const container = document.getElementById('threejsContainer');
        if (container) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666;">
                    <div>
                        <h3>No 3D Data Available</h3>
                        <p>Please complete inference first to generate 3D visualization data.</p>
                    </div>
                </div>
            `;
        }
        return;
    }
    
    // NEW: Show loading screen for 3D visualization
    showLoading('Loading 3D Visualization...', 'Initializing 3D scene...');

    try {
        // Initialize Three.js scene
        console.log('Initializing Three.js scene...');
        const sceneComponents = initializeScene(container);
        scene = sceneComponents.scene;
        camera = sceneComponents.camera;
        renderer = sceneComponents.renderer;

        // Try to load segmentation data
        if (window.inferenceResult && window.inferenceResult.visualization_path) {
            console.log('Loading segmentation data from:', window.inferenceResult.visualization_path);

            // Update loading message for data loading phase
            updateLoadingMessage('Loading Segmentation Data...', 'Downloading and parsing visualization data. This may take a moment for large datasets.');

            // Load the segmentation data - this can take time for large files
            segmentationData = await loadSegmentationData(window.inferenceResult.visualization_path);

            console.log('Creating 3D meshes from segmentation data...');

            // Update loading message for mesh creation phase
            updateLoadingMessage('Creating 3D Meshes...', 'Building 3D geometry from segmentation data...');
            
            // Choose between original and slice-based system
            const useSliceBasedSystem = true; // Set to true to use new slice system
            let meshResult;

            if (useSliceBasedSystem) {
                // Import the new function
                const { createSliceBasedClassMeshes } = await import('./meshCreation.js');
                meshResult = createSliceBasedClassMeshes(segmentationData, scene, 20, 'z');
            } else {
                // Use original system
                meshResult = createSeparateClassMeshes(segmentationData, scene);
            }
            
            if (meshResult && meshResult.meshGroup && meshResult.meshGroup.children.length > 0) {
                
                // Update global variables from mesh creation result
                meshGroup = meshResult.meshGroup;
                availableClasses = meshResult.availableClasses;
                visibleClasses = meshResult.visibleClasses;
                segmentationMesh = meshGroup;

                // Handle different mesh structures
                if (meshResult.sliceMeshes) {
                    // New slice-based system
                    sliceMeshes = meshResult.sliceMeshes;
                    sliceMetadata = meshResult.sliceMetadata;
                    console.log('Using slice-based mesh system');
                } else {
                    // Original system
                    classMeshes = meshResult.classMeshes;
                    console.log('Using original mesh system');
                }
                
                // Position camera optimally for the mesh
                positionCameraForMesh(meshGroup);

                // Load and create original data overlay planes
                try {
                    // Get inference ID from stored result
                    const inferenceId = window.inferenceResult?.inference_id;

                    if (inferenceId) {
                        console.log('Loading original data overlay...');

                        // Update loading message for original data loading phase
                        updateLoadingMessage('Loading Original Data Overlay...', 'Loading original image data for comparison...');

                        // Ensure UTIF.js is available for TIFF parsing
                        if (!window.UTIF) {
                            console.warn('[OriginalData] UTIF.js not loaded yet, waiting 500ms...');
                            // Give it a moment to load
                            await new Promise(resolve => setTimeout(resolve, 500));

                            if (!window.UTIF) {
                                console.error('[OriginalData] UTIF.js failed to load, original data overlay unavailable');
                                console.log('Visualization will continue without original data overlay');
                                return; // Skip overlay loading
                            } else {
                                console.log('[OriginalData] UTIF.js loaded successfully after wait');
                            }
                        } else {
                            console.log('[OriginalData] UTIF.js available, proceeding with overlay load');
                        }

                        const originalDataResult = await loadAndCreateOriginalDataPlanes(inferenceId, segmentationData);
                        
                        if (originalDataResult) {
                            // Store globally
                            originalDataPlanes = originalDataResult.planes;
                            originalDataPlaneGroup = originalDataResult.planeGroup;
                            
                            // Add to the same meshGroup so it moves with segmentation
                            meshGroup.add(originalDataPlaneGroup);
                            
                            // Start hidden (user can toggle on)
                            originalDataPlaneGroup.visible = false;
                            
                            console.log('Original data overlay loaded successfully');
                        } else {
                            console.log('Original data overlay not available for this inference');
                        }
                    } else {
                        console.log('No inference ID available, skipping original data overlay');
                    }
                } catch (error) {
                    console.warn('Could not load original data overlay:', error);
                    console.log('Visualization will continue without original data overlay');
                }
                
            } else {
                console.warn('No meshes were created from segmentation data');
                createFallbackMeshes();
            }
            
        } else {
            console.log('No visualization data available, creating placeholder');
            createFallbackMeshes();
        }
        
        console.log('Setting up visualization controls and interactions...');

        // Update loading message for final setup phase
        updateLoadingMessage('Finalizing Visualization...', 'Setting up controls and starting render loop...');

        // Setup all controls and interactions
        setupAllControls();

        // Start render loop
        startRenderLoop();

        console.log('3D visualization initialization completed successfully');

        // NEW: Hide loading screen on successful completion
        hideLoading();
        
    } catch (error) {
        console.error('3D visualization failed:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Error fallback
        createErrorFallbackMeshes();
        
        // Still setup basic controls so the interface works
        setupAllControls();
        startRenderLoop();
        
        // NEW: Hide loading screen on error
        hideLoading();
        
        // Optional: Show error message to user
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.textContent = '3D visualization failed to load completely. Using fallback display.';
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
    }
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
    
    // Import the removeCappingMeshes function if not already imported
    // (Make sure this import is at the top of the file)
    
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
    
    // Reset global slice range controls
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (sliceRangeMin) sliceRangeMin.value = 0;
    if (sliceRangeMax) sliceRangeMax.value = 100;
    if (sliceRangeValue) sliceRangeValue.textContent = '0% - 100%';
    
    // Reset global variables
    visibleClasses = [...availableClasses];
    
    // CRITICAL: Reset slice visibility to show ALL slices
    if (sliceMeshes && Object.keys(sliceMeshes).length > 0) {
        
        // Show all slices for all classes
        Object.keys(sliceMeshes).forEach(classValue => {
            if (sliceMeshes[classValue]) {
                sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
                    if (mesh) {
                        mesh.visible = true;
                        // Reset opacity
                        if (mesh.material) {
                            mesh.material.opacity = 0.8;
                            mesh.material.transparent = true;
                            mesh.material.needsUpdate = true;
                        }
                    }
                });
            }
        });
        
        // Remove all capping meshes
        removeAllCappingMeshes();
        
        // Reset slice metadata
        if (sliceMetadata) {
            updateGlobalState({
                sliceMetadata: {
                    ...sliceMetadata,
                    visibleSliceRange: [0, sliceMetadata.sliceCount - 1]
                }
            });
        }
        
    } else if (classMeshes) {
        // Original mesh system fallback
        Object.keys(classMeshes).forEach(classValue => {
            const classMesh = classMeshes[classValue];
            
            // Reset visibility
            classMesh.visible = true;
            
            // Reset material properties
            if (classMesh.material) {
                classMesh.material.opacity = 0.8;
                classMesh.material.transparent = true;
                classMesh.material.clippingPlanes = [];
                classMesh.material.needsUpdate = true;
            }
        });
        
        // Disable clipping
        if (renderer) {
            renderer.localClippingEnabled = false;
        }
    }
    
    // Reset mesh group rotation
    if (meshGroup) {
        meshGroup.rotation.set(0, 0, 0);
    }
    
    const originalDataCheckbox = document.getElementById('originalDataCheckbox');
    const originalDataOpacity = document.getElementById('originalDataOpacity');
    const originalDataOpacityValue = document.getElementById('originalDataOpacityValue');
    const originalDataRangeMin = document.getElementById('dualRangeMin_original');
    const originalDataRangeMax = document.getElementById('dualRangeMax_original');
    const originalDataRangeValue = document.getElementById('originalDataRangeValue');
    const originalDataRangeFill = document.getElementById('dualRangeFill_original');

    if (originalDataCheckbox) {
        originalDataCheckbox.checked = false;  // Default: hidden
    }

    if (originalDataOpacity) {
        originalDataOpacity.value = 30;  // Default: 30% opacity
    }

    if (originalDataOpacityValue) {
        originalDataOpacityValue.textContent = '30%';
    }

    // Reset range sliders to full range (0-100%)
    if (originalDataRangeMin) originalDataRangeMin.value = 0;
    if (originalDataRangeMax) originalDataRangeMax.value = 100;
    if (originalDataRangeValue) originalDataRangeValue.textContent = '0% - 100%';
    if (originalDataRangeFill) {
        originalDataRangeFill.style.left = '0%';
        originalDataRangeFill.style.width = '100%';
    }

    // Reset range state
    updateGlobalState({
        originalDataRangeMin: 0,
        originalDataRangeMax: 100
    });

    // Hide original data overlay
    if (originalDataPlaneGroup) {
        originalDataPlaneGroup.visible = false;
    }

    // Reset opacity to 30% and show all planes
    if (originalDataPlaneGroup && originalDataPlaneGroup.children) {
        originalDataPlaneGroup.children.forEach(plane => {
            if (plane.material) {
                plane.material.opacity = 0.3;
                plane.material.needsUpdate = true;
            }
            // Show all planes (full range)
            if (plane.userData && plane.userData.isOriginalDataPlane) {
                plane.visible = true;
            }
        });
    }

    // Reset camera position
    if (camera) {
        camera.position.set(8, 6, 8);
        camera.lookAt(0, 0, 0);
    }
    
    // Force re-render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
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
        sliceMeshes,
        sliceMetadata,
        availableClasses,
        visibleClasses,
        segmentationData,
        sliceDirection,
        classControlStates,
        originalDataPlanes,
        originalDataPlaneGroup,
        originalDataRangeMin,
        originalDataRangeMax
    };
}

/**
 * Initialize per-class slice ranges
 * @param {Array} availableClasses - Array of class numbers
 */
// In your initialize3DVisualization() or wherever you set up the classes
export function initializeClassSliceRanges(availableClasses) {
    const state = getGlobalState();
    if (!state.classSliceRanges) {
        state.classSliceRanges = {};
    }
    
    availableClasses.forEach(classValue => {
        // Initialize with current UI values or defaults
        const rangeMin = document.getElementById(`dualRangeMin_${classValue}`);
        const rangeMax = document.getElementById(`dualRangeMax_${classValue}`);
        
        const minVal = rangeMin ? parseInt(rangeMin.value) : 0;
        const maxVal = rangeMax ? parseInt(rangeMax.value) : 100;
        
        state.classSliceRanges[classValue] = { min: minVal, max: maxVal };
    });
}

// Allow other modules to update global state
export function updateGlobalState(updates) {
    if (updates.scene !== undefined) scene = updates.scene;
    if (updates.camera !== undefined) camera = updates.camera;
    if (updates.renderer !== undefined) renderer = updates.renderer;
    if (updates.meshGroup !== undefined) meshGroup = updates.meshGroup;
    if (updates.segmentationMesh !== undefined) segmentationMesh = updates.segmentationMesh;
    if (updates.classMeshes !== undefined) classMeshes = updates.classMeshes;
    if (updates.sliceMeshes !== undefined) sliceMeshes = updates.sliceMeshes;           // ADD THIS
    if (updates.sliceMetadata !== undefined) sliceMetadata = updates.sliceMetadata;     // ADD THIS
    if (updates.availableClasses !== undefined) availableClasses = updates.availableClasses;
    if (updates.visibleClasses !== undefined) visibleClasses = updates.visibleClasses;
    if (updates.segmentationData !== undefined) segmentationData = updates.segmentationData;
    if (updates.sliceDirection !== undefined) sliceDirection = updates.sliceDirection;
    if (updates.classControlStates !== undefined) classControlStates = updates.classControlStates;
    if (updates.originalDataPlanes !== undefined) originalDataPlanes = updates.originalDataPlanes;
    if (updates.originalDataPlaneGroup !== undefined) originalDataPlaneGroup = updates.originalDataPlaneGroup;
    if (updates.originalDataRangeMin !== undefined) originalDataRangeMin = updates.originalDataRangeMin;
    if (updates.originalDataRangeMax !== undefined) originalDataRangeMax = updates.originalDataRangeMax;
}