// clipping.js - Clipping planes and range filtering functionality
// This file handles all clipping plane calculations and slice filtering

import { getGlobalState, updateGlobalState } from './main.js';
import { centerAndScaleGeometry, addQuadFace, getVoxelValue } from './utils.js';

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
        //console.log(`Applying slice range to class ${classValue}: ${minPercent}% - ${maxPercent}%`);
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
        //console.log(`Initialized clippingPlanes array for class ${classValue}`);
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
    
    //console.log(`Class ${classValue} - Using ACTUAL vertex bounds:`, {
    //    bounds: `X: ${minX.toFixed(3)} to ${maxX.toFixed(3)}, Y: ${minY.toFixed(3)} to ${maxY.toFixed(3)}, Z: ${minZ.toFixed(3)} to ${maxZ.toFixed(3)}`,
    //    size: `(${actualBounds.size.x.toFixed(3)}, ${actualBounds.size.y.toFixed(3)}, ${actualBounds.size.z.toFixed(3)})`,
    //    center: `(${actualBounds.center.x.toFixed(3)}, ${actualBounds.center.y.toFixed(3)}, ${actualBounds.center.z.toFixed(3)})`
    //});
    
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
    
    //console.log(`Applying range ${minPercent}%-${maxPercent}% to class ${classValue} in ${currentDir} direction`);
    //console.log(`Coordinate range: ${minCoord.toFixed(3)} to ${maxCoord.toFixed(3)}`);
    
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
    
    //console.log(`Applied ${clippingPlanes.length} clipping planes to class ${classValue}`);
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
    
    // Check if this class should be visible
    const isClassVisible = state.visibleClasses.includes(parseInt(classValue)) || state.visibleClasses.includes(classValue.toString());
    
    const sliceCount = state.sliceMetadata.sliceCount;
    
    // Convert percentages to slice indices
    const minSlice = Math.floor(minPercent / 100 * sliceCount);
    const maxSlice = Math.ceil(maxPercent / 100 * sliceCount) - 1;
    
    //console.log(`Class ${classValue} - showing slices ${minSlice} to ${maxSlice} (${minPercent}% - ${maxPercent}%)`);
    
    // Update visibility for this class only
    state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
        if (mesh) {
            const shouldBeVisible = (sliceIndex >= minSlice && sliceIndex <= maxSlice);
            mesh.visible = shouldBeVisible;
        }
    });

    // Update the class range tracking
    if (!state.classSliceRanges) {
        state.classSliceRanges = {};
    }
    state.classSliceRanges[classValue] = { min: minPercent, max: maxPercent };

    // Create accurate caps for just this class
    updateAccurateCapping({ [classValue]: { min: minPercent, max: maxPercent } });

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
    
    const state = getGlobalState();
    
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
 * Create or update accurate cross-sectional capping meshes for each class
 * @param {Object} classRanges - Object with class ranges: { classValue: {min, max}, ... }
 */
export function updateAccurateCapping(classRanges) {
    const state = getGlobalState();
    
    if (!state.sliceMeshes || !state.segmentationData) {
        console.log('Missing required data for accurate capping');
        return;
    }
    
    Object.keys(classRanges).forEach(classValue => {
        removeCappingMeshesForClass(classValue);
    });
    
    const { shape } = state.segmentationData;
    const sliceCount = state.sliceMetadata.sliceCount;
    const sliceDirection = state.sliceMetadata.sliceDirection || 'z';
    
    // Create caps for each class individually
    Object.keys(classRanges).forEach(classValue => {
        const range = classRanges[classValue];
        if (range.min === 0 && range.max === 100) {
            return; // Full range, no caps needed
        }
        
        const minSlice = Math.floor(range.min / 100 * sliceCount);
        const maxSlice = Math.ceil(range.max / 100 * sliceCount) - 1;
        
        createAccurateCapsForClass(classValue, minSlice, maxSlice, sliceCount, sliceDirection, shape);
    });
}

/**
 * Create accurate cross-sectional caps for a specific class
 * @param {number} classValue - Class number
 * @param {number} minSlice - First visible slice
 * @param {number} maxSlice - Last visible slice
 * @param {number} sliceCount - Total slice count
 * @param {string} sliceDirection - Slice direction
 * @param {Array} shape - Data shape [depth, height, width]
 */
function createAccurateCapsForClass(classValue, minSlice, maxSlice, sliceCount, sliceDirection, shape) {
    const state = getGlobalState();
    
    // Get the volume data for cross-section extraction
    const volume = state.segmentationData.volume || extractVolumeFromSparseData(state.segmentationData);
    
    // Create front cap (at minSlice boundary)
    if (minSlice > 0) {
        const frontCapMesh = createCrossSectionalCap(
            volume, shape, classValue, minSlice, sliceDirection, 'front'
        );
        if (frontCapMesh && state.meshGroup) {
            state.meshGroup.add(frontCapMesh);
            trackCappingMesh(classValue, frontCapMesh, 'front');
        }
    }
    
    // Create back cap (at maxSlice boundary)
    if (maxSlice < sliceCount - 1) {
        const backCapMesh = createCrossSectionalCap(
            volume, shape, classValue, maxSlice + 1, sliceDirection, 'back'
        );
        if (backCapMesh && state.meshGroup) {
            state.meshGroup.add(backCapMesh);
            trackCappingMesh(classValue, backCapMesh, 'back');
        }
    }
}

/**
 * Create a true cross-sectional cap mesh by extracting the boundary
 * @param {Uint8Array} volume - Dense volume data
 * @param {Array} shape - [depth, height, width] 
 * @param {number} classValue - Class number
 * @param {number} sliceIndex - Slice index for the cap
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {string} side - 'front' or 'back'
 * @returns {THREE.Mesh} - The cross-sectional cap mesh
 */
function createCrossSectionalCap(volume, shape, classValue, sliceIndex, sliceDirection, side) {
    const state = getGlobalState();
    const [depth, height, width] = shape;
    const capVertices = [];
    const capNormals = [];
    
    // Calculate the slice position
    let slicePosition;
    switch(sliceDirection) {
        case 'x':
            slicePosition = Math.floor((sliceIndex * width) / state.sliceMetadata.sliceCount);
            break;
        case 'y':  
            slicePosition = Math.floor((sliceIndex * height) / state.sliceMetadata.sliceCount);
            break;
        case 'z':
        default:
            slicePosition = Math.floor((sliceIndex * depth) / state.sliceMetadata.sliceCount);
            break;
    }
    
    // Extract boundary at this slice position
    extractBoundaryFacesAtSlice(volume, shape, classValue, slicePosition, sliceDirection, side, capVertices, capNormals);
    
    if (capVertices.length === 0) {
        return null; // No boundary found
    }
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(capVertices);
    const normals = new Float32Array(capNormals);
    
    // Apply same scaling as regular meshes  
    const maxOriginalDim = Math.max(depth, height, width);
    const scaleFactor = 8 / maxOriginalDim;
    centerAndScaleGeometry(vertices, shape, scaleFactor);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    
    // Get class color from existing mesh
    const existingMesh = state.sliceMeshes[classValue] && state.sliceMeshes[classValue][0];
    const classColor = existingMesh ? existingMesh.material.color : new THREE.Color(0.5, 0.5, 0.5);
    const opacity = existingMesh ? existingMesh.material.opacity : 0.8;
    
    // Create material
    const material = new THREE.MeshPhongMaterial({
        color: classColor.clone(),
        transparent: true,
        opacity: opacity * 0.6, // Slightly more transparent
        side: THREE.DoubleSide
    });
    
    const capMesh = new THREE.Mesh(geometry, material);
    capMesh.userData = {
        isCappingMesh: true,
        classValue: classValue,
        sliceIndex: sliceIndex,
        side: side
    };
    
    return capMesh;
}

/**
 * Extract boundary faces at a specific slice position
 * @param {Uint8Array} volume - Volume data
 * @param {Array} shape - [depth, height, width]
 * @param {number} classValue - Class to extract
 * @param {number} slicePosition - Position of the slice  
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {string} side - 'front' or 'back'
 * @param {Array} vertices - Array to add vertices to
 * @param {Array} normals - Array to add normals to  
 */
function extractBoundaryFacesAtSlice(volume, shape, classValue, slicePosition, sliceDirection, side, vertices, normals) {
    const targetClassValue = parseInt(classValue);
    
    const [depth, height, width] = shape;
    
    // Determine the face direction based on slice direction and side
    let faceDirection;
    switch(sliceDirection) {
        case 'x':
            faceDirection = side === 'front' ? 'left' : 'right';
            break;
        case 'y':
            faceDirection = side === 'front' ? 'bottom' : 'top';
            break;
        case 'z':
        default:
            faceDirection = side === 'front' ? 'back' : 'front';
            break;
    }
    
    // Iterate through the 2D slice
    switch(sliceDirection) {
        case 'x':
            // YZ plane at X = slicePosition
            for (let z = 0; z < depth; z++) {
                for (let y = 0; y < height; y++) {
                    const currentValue = getVoxelValue(volume, slicePosition, y, z, width, height, depth);
                    if (currentValue === targetClassValue) {
                        // Add face for this voxel
                        const faceObj = { name: faceDirection };
                        addQuadFace(vertices, normals, slicePosition, y, z, faceObj);
                    }
                }
            }
            break;
        case 'y':
            // XZ plane at Y = slicePosition  
            for (let z = 0; z < depth; z++) {
                for (let x = 0; x < width; x++) {
                    const currentValue = getVoxelValue(volume, x, slicePosition, z, width, height, depth);
                    if (currentValue === targetClassValue) {
                        const faceObj = { name: faceDirection };
                        addQuadFace(vertices, normals, x, slicePosition, z, faceObj);
                    }
                }
            }
            break;
        case 'z':
        default:
            // XY plane at Z = slicePosition
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const currentValue = getVoxelValue(volume, x, y, slicePosition, width, height, depth);
                    if (currentValue === targetClassValue) {
                        const faceObj = { name: faceDirection };
                        addQuadFace(vertices, normals, x, y, slicePosition, faceObj);
                    }
                }
            }
            break;
    }
}


// Replace the global cappingMeshes array with per-class tracking
let classCappingMeshes = {}; // { classValue: { front: mesh, back: mesh } }

/**
 * Track a capping mesh for a specific class
 */
function trackCappingMesh(classValue, mesh, side) {
    if (!classCappingMeshes[classValue]) {
        classCappingMeshes[classValue] = {};
    }
    classCappingMeshes[classValue][side] = mesh;
}

/**
 * Remove capping meshes for a specific class
 */
export function removeCappingMeshesForClass(classValue) {
    const state = getGlobalState();
    
    if (classCappingMeshes[classValue]) {
        Object.values(classCappingMeshes[classValue]).forEach(mesh => {
            if (mesh && state.meshGroup && mesh.parent === state.meshGroup) {
                state.meshGroup.remove(mesh);
            }
            if (mesh && mesh.geometry) mesh.geometry.dispose();
            if (mesh && mesh.material) mesh.material.dispose();
        });
        classCappingMeshes[classValue] = {};
    }
}

/**
 * Remove all capping meshes
 */
export function removeAllCappingMeshes() {
    Object.keys(classCappingMeshes).forEach(classValue => {
        removeCappingMeshesForClass(classValue);
    });
}

/**
 * Extract dense volume data from sparse segmentation data if needed
 * @param {Object} segmentationData - The segmentation data
 * @returns {Uint8Array} - Dense volume array
 */
function extractVolumeFromSparseData(segmentationData) {
    const { data, shape } = segmentationData;
    const [depth, height, width] = shape;
    const volume = new Uint8Array(depth * height * width);
    
    // Convert sparse to dense if needed
    if (data && Array.isArray(data)) {
        data.forEach(voxel => {
            const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
            volume[index] = voxel.value;
        });
    }
    
    return volume;
}