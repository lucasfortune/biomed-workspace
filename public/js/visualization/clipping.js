// clipping.js - Clipping planes and range filtering functionality
// This file handles all clipping plane calculations and slice filtering

import { getGlobalState, updateGlobalState } from './main.js';

/**
 * Apply range filtering to a single class mesh (FIXED: uses actual mesh coordinates)
 * @param {number} classValue - The class number
 * @param {number} minPercent - Minimum percentage (0-100)
 * @param {number} maxPercent - Maximum percentage (0-100)
 */
export function applyRangeToSingleClass(classValue, minPercent, maxPercent) {
    const state = getGlobalState();
    
    // Check if we're using the new slice-based system
    if (state.sliceMeshes && state.sliceMeshes[classValue]) {
        console.log(`Applying slice range to class ${classValue}: ${minPercent}% - ${maxPercent}%`);
        applySliceRangeToSingleClass(classValue, minPercent, maxPercent);
        return;
    }
    
    // Fallback to original clipping system
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log(`Cannot apply range to class ${classValue} - mesh not available`);
        return;
    }
    
    const classMesh = state.classMeshes[classValue];
    
    // SAFETY FIX: Initialize clippingPlanes if it doesn't exist
    if (classMesh.material && !classMesh.material.clippingPlanes) {
        classMesh.material.clippingPlanes = [];
        console.log(`Initialized clippingPlanes array for class ${classValue}`);
    }
    
    // CRITICAL FIX: Calculate bounds directly from geometry vertices, not setFromObject()
    const geometry = classMesh.geometry;
    const positions = geometry.attributes.position.array;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity; 
    let minZ = Infinity, maxZ = -Infinity;
    
    // Calculate actual vertex bounds
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    
    const actualBounds = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
    };
    
    console.log(`Class ${classValue} - Using ACTUAL vertex bounds:`, {
        bounds: `X: ${minX.toFixed(3)} to ${maxX.toFixed(3)}, Y: ${minY.toFixed(3)} to ${maxY.toFixed(3)}, Z: ${minZ.toFixed(3)} to ${maxZ.toFixed(3)}`,
        size: `(${actualBounds.size.x.toFixed(3)}, ${actualBounds.size.y.toFixed(3)}, ${actualBounds.size.z.toFixed(3)})`,
        center: `(${actualBounds.center.x.toFixed(3)}, ${actualBounds.center.y.toFixed(3)}, ${actualBounds.center.z.toFixed(3)})`
    });
    
    // Get the current slice direction
    const currentDir = state.sliceDirection || 'z';
    
    // Calculate coordinates based on ACTUAL geometry bounds
    let dimension, minCoord, maxCoord;
    
    switch(currentDir) {
        case 'x':
            dimension = actualBounds.size.x;
            minCoord = actualBounds.min.x + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.x + (maxPercent / 100) * dimension;
            break;
        case 'y':
            dimension = actualBounds.size.y;
            minCoord = actualBounds.min.y + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.y + (maxPercent / 100) * dimension;
            break;
        case 'z':
        default:
            dimension = actualBounds.size.z;
            minCoord = actualBounds.min.z + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.z + (maxPercent / 100) * dimension;
            break;
    }
    
    console.log(`Applying range ${minPercent}%-${maxPercent}% to class ${classValue} in ${currentDir} direction`);
    console.log(`Coordinate range: ${minCoord.toFixed(3)} to ${maxCoord.toFixed(3)}`);
    
    // Create clipping planes
    let clippingPlanes = [];
    
    if (minPercent > 0 || maxPercent < 100) {
        switch(currentDir) {
            case 'x':
                clippingPlanes = [
                    new THREE.Plane(new THREE.Vector3(1, 0, 0), -minCoord),
                    new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxCoord)
                ];
                break;
            case 'y':
                clippingPlanes = [
                    new THREE.Plane(new THREE.Vector3(0, 1, 0), -minCoord),
                    new THREE.Plane(new THREE.Vector3(0, -1, 0), maxCoord)
                ];
                break;
            case 'z':
                clippingPlanes = [
                    new THREE.Plane(new THREE.Vector3(0, 0, 1), -minCoord),
                    new THREE.Plane(new THREE.Vector3(0, 0, -1), maxCoord)
                ];
                break;
        }
    }
    
    // Apply clipping planes to this class
    classMesh.material.clippingPlanes = clippingPlanes;
    classMesh.material.clipShadows = true;
    classMesh.material.needsUpdate = true;
    
    // Enable clipping if needed
    state.renderer.localClippingEnabled = clippingPlanes.length > 0;
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
    
    console.log(`Applied ${clippingPlanes.length} clipping planes to class ${classValue}`);
}

/**
 * Apply range to a single class using slice visibility - NEW FUNCTION FOR SLICE SYSTEM
 * @param {number} classValue - The class number
 * @param {number} minPercent - Minimum percentage (0-100)
 * @param {number} maxPercent - Maximum percentage (0-100)
 */
export function applySliceRangeToSingleClass(classValue, minPercent, maxPercent) {
    const state = getGlobalState();
    
    if (!state.sliceMeshes || !state.sliceMeshes[classValue]) {
        console.log(`No slice meshes available for class ${classValue}`);
        return;
    }
    
    const sliceCount = state.sliceMetadata.sliceCount;
    
    // Convert percentages to slice indices
    const minSlice = Math.floor(minPercent / 100 * sliceCount);
    const maxSlice = Math.ceil(maxPercent / 100 * sliceCount) - 1;
    
    console.log(`Class ${classValue} - showing slices ${minSlice} to ${maxSlice} (${minPercent}% - ${maxPercent}%)`);
    
    // Update visibility for this class only
    state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
        if (mesh) {
            const shouldBeVisible = (sliceIndex >= minSlice && sliceIndex <= maxSlice);
            mesh.visible = shouldBeVisible;
        }
    });

    // ADD THESE TWO LINES:
    console.log('About to call updateVolumeCapping from single class function...');
    updateVolumeCapping(minSlice, maxSlice, sliceCount);

    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Update slice direction indicator based on current model rotation
 * This provides visual feedback about which direction slicing will occur
 */
export function updateSliceDirectionIndicator() {
    const indicator = document.getElementById('sliceDirectionIndicator');
    const state = getGlobalState();
    
    if (!indicator || !state.meshGroup) return;
    
    const currentDir = state.sliceDirection || 'z';
    
    // Get current rotation in degrees for user-friendly display
    const rotX = (state.meshGroup.rotation.x * 180 / Math.PI).toFixed(0);
    const rotY = (state.meshGroup.rotation.y * 180 / Math.PI).toFixed(0);
    const rotZ = (state.meshGroup.rotation.z * 180 / Math.PI).toFixed(0);
    
    // Base direction names
    const directionNames = {
        'x': 'Left → Right',
        'y': 'Bottom → Top', 
        'z': 'Front → Back'
    };
    
    // Show both the base direction and current rotation
    const baseName = directionNames[currentDir];
    indicator.textContent = `${baseName} (rotated: ${rotY}°, ${rotX}°, ${rotZ}°)`;
    indicator.style.color = '#666';
    indicator.style.fontSize = '11px';
}

/**
 * Function to change slice direction
 * @param {string} direction - The new slice direction ('x', 'y', or 'z')
 */
export function setSliceDirection(direction) {
    const validDirections = ['x', 'y', 'z'];
    if (!validDirections.includes(direction.toLowerCase())) {
        console.error('Invalid slice direction. Use "x", "y", or "z"');
        return;
    }
    
    const newDirection = direction.toLowerCase();
    updateGlobalState({ sliceDirection: newDirection });
    
    console.log(`Slice direction changed to ${direction.toUpperCase()}-axis`);
    
    // Update the slice direction indicator if it exists
    const indicator = document.getElementById('sliceDirectionIndicator');
    if (indicator) {
        const directionNames = {
            'x': 'Left → Right',
            'y': 'Bottom → Top', 
            'z': 'Front → Back'
        };
        indicator.textContent = directionNames[newDirection];
    }
    
    // Re-apply current slice range with new direction
    applySliceRangeToMeshes();
}

/**
 * Apply slice-based filtering using visibility control - NEW SLICE SYSTEM
 * @param {Array} currentSliceRange - Array with [min, max] percentages
 */
export function applySliceRangeToMeshes(currentSliceRange = [0, 100]) {
    console.log('=== applySliceRangeToMeshes CALLED ===');
    console.log('currentSliceRange:', currentSliceRange);
    
    const state = getGlobalState();
    console.log('=== STATE DEBUG ===');
    console.log('state exists:', !!state);
    console.log('state.sliceMeshes exists:', !!state.sliceMeshes);
    
    if (state.sliceMeshes) {
        console.log('sliceMeshes keys:', Object.keys(state.sliceMeshes));
        console.log('sliceMeshes length:', Object.keys(state.sliceMeshes).length);
        
        // Debug the actual content of sliceMeshes
        Object.keys(state.sliceMeshes).forEach(classValue => {
            console.log(`Class ${classValue} has ${state.sliceMeshes[classValue].length} slices`);
        });
    }
    
    // Check if we're using the new slice-based system
    if (state.sliceMeshes && Object.keys(state.sliceMeshes).length > 0) {
        console.log('=== TAKING SLICE PATH ===');
        updateSliceVisibility(currentSliceRange);
        return;
    } else {
        console.log('=== TAKING FALLBACK PATH ===');
        console.log('Reason: sliceMeshes is', !state.sliceMeshes ? 'null/undefined' : 'empty');
    }
    
    // Original clipping logic for backward compatibility
    const [depth, height, width] = state.segmentationData.shape;
    
    let minCoord, maxCoord, axis, planeDimension;
    
    switch(state.sliceDirection) {
        case 'x': 
            planeDimension = width;
            axis = 'X';
            break;
        case 'y': 
            planeDimension = height;
            axis = 'Y';
            break;
        case 'z': 
            planeDimension = depth;
            axis = 'Z';
            break;
        default:
            planeDimension = depth;
            axis = 'Z';
            updateGlobalState({ sliceDirection: 'z' });
    }
    
    const halfDim = planeDimension / 2;
    const rangeSize = (currentSliceRange[1] - currentSliceRange[0]) / 100 * planeDimension;
    const rangeCenter = (currentSliceRange[0] + currentSliceRange[1]) / 2 / 100 * planeDimension - halfDim;
    
    minCoord = rangeCenter - rangeSize / 2;
    maxCoord = rangeCenter + rangeSize / 2;
    
    console.log(`Applying ${axis}-axis slice filter: ${minCoord.toFixed(2)} to ${maxCoord.toFixed(2)}`);
    
    let clippingPlanes;
    
    switch(state.sliceDirection) {
        case 'x':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -minCoord),
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxCoord)
            ];
            break;
        case 'y':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -minCoord),
                new THREE.Plane(new THREE.Vector3(0, -1, 0), maxCoord)
            ];
            break;
        case 'z':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 0, 1), -minCoord),
                new THREE.Plane(new THREE.Vector3(0, 0, -1), maxCoord)
            ];
            break;
    }
    
    Object.keys(state.classMeshes).forEach(classValue => {
        const classMesh = state.classMeshes[classValue];
        if (!classMesh.visible) return;
        
        classMesh.material.clippingPlanes = clippingPlanes;
        classMesh.material.clipShadows = true;
        classMesh.material.needsUpdate = true;
    });
    
    if (state.renderer) {
        state.renderer.localClippingEnabled = true;
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Update slice visibility based on slider values with volume capping - ENHANCED VERSION
 * @param {Array} sliceRange - [minPercent, maxPercent]
 */
export function updateSliceVisibility(sliceRange) {
    console.log('=== updateSliceVisibility CALLED ===');
    console.log('sliceRange:', sliceRange);
    const state = getGlobalState();
    const [minPercent, maxPercent] = sliceRange;
    
    if (!state.sliceMeshes || !state.sliceMetadata) {
        console.log('No slice meshes available for visibility control');
        return;
    }
    
    const sliceCount = state.sliceMetadata.sliceCount;
    
    // Convert percentages to slice indices
    const minSlice = Math.floor(minPercent / 100 * sliceCount);
    const maxSlice = Math.ceil(maxPercent / 100 * sliceCount) - 1;
    
    console.log(`Showing slices ${minSlice} to ${maxSlice} (${minPercent}% - ${maxPercent}%) with volume capping`);
    
    // Update visibility for all classes
    Object.keys(state.sliceMeshes).forEach(classValue => {
        if (state.sliceMeshes[classValue]) {
            state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
                if (mesh) {
                    const shouldBeVisible = (sliceIndex >= minSlice && sliceIndex <= maxSlice);
                    mesh.visible = shouldBeVisible;
                }
            });
        }
    });
    
    // Create or update capping meshes to close the volume
    updateVolumeCapping(minSlice, maxSlice, sliceCount);
    
    // Update metadata
    updateGlobalState({ 
        sliceMetadata: {
            ...state.sliceMetadata,
            visibleSliceRange: [minSlice, maxSlice]
        }
    });
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Create or update capping meshes to close the volume at slice boundaries - DEBUGGED VERSION
 * @param {number} minSlice - First visible slice index
 * @param {number} maxSlice - Last visible slice index  
 * @param {number} sliceCount - Total slice count
 */
export function updateVolumeCapping(minSlice, maxSlice, sliceCount) {
    const state = getGlobalState();
    
    console.log('=== CAPPING DEBUG ===');
    console.log('minSlice:', minSlice, 'maxSlice:', maxSlice, 'sliceCount:', sliceCount);
    console.log('state.sliceMeshes exists:', !!state.sliceMeshes);
    console.log('state.segmentationData exists:', !!state.segmentationData);
    console.log('state.meshGroup exists:', !!state.meshGroup);
    
    if (!state.sliceMeshes || !state.segmentationData) {
        console.log('Missing required data for capping');
        return;
    }
    
    // Remove existing capping meshes
    removeCappingMeshes();
    
    // Don't create caps if showing full range
    if (minSlice === 0 && maxSlice === sliceCount - 1) {
        console.log('Showing full range - no capping needed');
        return;
    }
    
    const [depth, height, width] = state.segmentationData.shape;
    const sliceDirection = state.sliceMetadata.sliceDirection || 'z';
    
    console.log(`Creating volume caps at slice boundaries: ${minSlice} and ${maxSlice}`);
    console.log(`Data shape: ${depth}x${height}x${width}, slice direction: ${sliceDirection}`);
    
    // Create capping meshes for each class
    Object.keys(state.sliceMeshes).forEach(classValue => {
        console.log(`Processing caps for class ${classValue}`);
        
        if (state.sliceMeshes[classValue] && state.sliceMeshes[classValue].length > 0) {
            
            // Get class color from existing mesh
            const firstMesh = state.sliceMeshes[classValue].find(mesh => mesh && mesh.material);
            if (!firstMesh) {
                console.log(`No valid mesh found for class ${classValue}`);
                return;
            }
            
            const classColor = firstMesh.material.color;
            const opacity = firstMesh.material.opacity;
            
            console.log(`Class ${classValue} color:`, classColor, 'opacity:', opacity);
            
            // Create front cap (at minSlice position) - simplified version
            if (minSlice > 0) {
                console.log(`Creating front cap for class ${classValue} at slice ${minSlice}`);
                
                const frontCap = createSimpleCap(
                    classValue, minSlice, sliceCount, sliceDirection, 
                    [depth, height, width], classColor, opacity
                );
                
                if (frontCap && state.meshGroup) {
                    state.meshGroup.add(frontCap);
                    addCappingMesh(frontCap);
                    console.log(`Added front cap for class ${classValue}`);
                } else {
                    console.log(`Failed to create/add front cap for class ${classValue}`);
                }
            }
            
            // Create back cap (at maxSlice position)
            if (maxSlice < sliceCount - 1) {
                console.log(`Creating back cap for class ${classValue} at slice ${maxSlice + 1}`);
                
                const backCap = createSimpleCap(
                    classValue, maxSlice + 1, sliceCount, sliceDirection,
                    [depth, height, width], classColor, opacity
                );
                
                if (backCap && state.meshGroup) {
                    state.meshGroup.add(backCap);
                    addCappingMesh(backCap);
                    console.log(`Added back cap for class ${classValue}`);
                } else {
                    console.log(`Failed to create/add back cap for class ${classValue}`);
                }
            }
        }
    });
    
    console.log(`Total capping meshes created: ${cappingMeshes.length}`);
}

/**
 * Create a proper capping face - IMPROVED VERSION
 */
function createSimpleCap(classValue, sliceIndex, sliceCount, sliceDirection, shape, color, opacity) {
    const [depth, height, width] = shape;
    
    try {
        // Calculate the position of this slice
        let slicePosition;
        let planeWidth, planeHeight;
        
        switch(sliceDirection) {
            case 'x':
                slicePosition = (sliceIndex / sliceCount) * width;
                planeWidth = height;
                planeHeight = depth;
                break;
            case 'y':
                slicePosition = (sliceIndex / sliceCount) * height;
                planeWidth = width;
                planeHeight = depth;
                break;
            case 'z':
            default:
                slicePosition = (sliceIndex / sliceCount) * depth;
                planeWidth = width;
                planeHeight = height;
                break;
        }
        
        // Create a properly sized plane geometry for the cap
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        
        // Apply the same scaling and centering as the original meshes
        const maxOriginalDim = Math.max(depth, height, width);
        const scaleFactor = 8 / maxOriginalDim;
        
        // Scale the geometry vertices
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i] *= scaleFactor;     // X
            vertices[i + 1] *= scaleFactor; // Y
            vertices[i + 2] *= scaleFactor; // Z
        }
        geometry.attributes.position.needsUpdate = true;
        
        // Position the cap at the slice boundary
        let x = 0, y = 0, z = 0;
        switch(sliceDirection) {
            case 'x':
                x = (slicePosition - width/2) * scaleFactor;
                break;
            case 'y':
                y = (slicePosition - height/2) * scaleFactor;  
                break;
            case 'z':
            default:
                z = (slicePosition - depth/2) * scaleFactor;
                break;
        }
        
        // Create material matching the class color (no more bright magenta!)
        const material = new THREE.MeshPhongMaterial({
            color: color,           // Use the actual class color
            transparent: true,
            opacity: opacity * 0.6, // Make caps slightly more transparent
            side: THREE.DoubleSide
        });
        
        const capMesh = new THREE.Mesh(geometry, material);
        capMesh.position.set(x, y, z);
        
        // Rotate the plane to face the correct direction
        switch(sliceDirection) {
            case 'x':
                capMesh.rotation.y = Math.PI / 2;
                break;
            case 'y':
                capMesh.rotation.x = -Math.PI / 2;
                break;
            case 'z':
            default:
                // No rotation needed for Z
                break;
        }
        
        capMesh.userData = {
            isCappingMesh: true,
            classValue: classValue,
            sliceIndex: sliceIndex
        };
        
        console.log(`Created proper cap at position (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) with class color`);
        return capMesh;
        
    } catch (error) {
        console.error('Error creating cap:', error);
        return null;
    }
}

/**
 * Create a single capping face at a slice boundary - HELPER FUNCTION
 */
function createSliceCap(classValue, sliceIndex, sliceCount, sliceDirection, shape, color, opacity, side) {
    const [depth, height, width] = shape;
    
    // Calculate the position of this slice
    let slicePosition;
    switch(sliceDirection) {
        case 'x':
            slicePosition = (sliceIndex / sliceCount) * width;
            break;
        case 'y':
            slicePosition = (sliceIndex / sliceCount) * height;
            break;
        case 'z':
        default:
            slicePosition = (sliceIndex / sliceCount) * depth;
            break;
    }
    
    // Create a simple plane geometry for the cap
    const geometry = new THREE.PlaneGeometry(
        sliceDirection === 'x' ? height : width,
        sliceDirection === 'y' ? depth : (sliceDirection === 'x' ? depth : height)
    );
    
    // Apply the same scaling and centering as the original meshes
    const maxOriginalDim = Math.max(depth, height, width);
    const scaleFactor = 8 / maxOriginalDim; // Same as in mesh creation
    
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] *= scaleFactor;     // X
        vertices[i + 1] *= scaleFactor; // Y
        vertices[i + 2] *= scaleFactor; // Z
    }
    
    // Position the cap at the slice boundary
    let x = 0, y = 0, z = 0;
    switch(sliceDirection) {
        case 'x':
            x = (slicePosition - width/2) * scaleFactor;
            if (side === 'back') x += (width/sliceCount) * scaleFactor; // Adjust for back face
            break;
        case 'y':
            y = (slicePosition - height/2) * scaleFactor;  
            if (side === 'back') y += (height/sliceCount) * scaleFactor;
            break;
        case 'z':
        default:
            z = (slicePosition - depth/2) * scaleFactor;
            if (side === 'back') z += (depth/sliceCount) * scaleFactor;
            break;
    }
    
    // Create material matching the class
    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: opacity * 0.8, // Slightly more transparent for caps
        side: THREE.DoubleSide
    });
    
    const capMesh = new THREE.Mesh(geometry, material);
    capMesh.position.set(x, y, z);
    
    // Rotate the plane to face the correct direction
    switch(sliceDirection) {
        case 'x':
            capMesh.rotation.y = Math.PI / 2;
            break;
        case 'y':
            capMesh.rotation.x = -Math.PI / 2;
            break;
        case 'z':
        default:
            // No rotation needed for Z
            break;
    }
    
    capMesh.userData = {
        isCappingMesh: true,
        classValue: classValue,
        sliceIndex: sliceIndex,
        side: side
    };
    
    return capMesh;
}

// Global array to track capping meshes for cleanup
let cappingMeshes = [];

/**
 * Track a capping mesh for cleanup
 */
function addCappingMesh(mesh) {
    cappingMeshes.push(mesh);
}

/**
 * Remove all existing capping meshes
 */
export function removeCappingMeshes() {
    const state = getGlobalState();
    
    cappingMeshes.forEach(mesh => {
        if (state.meshGroup && mesh.parent === state.meshGroup) {
            state.meshGroup.remove(mesh);
        }
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    });
    
    cappingMeshes = [];
}