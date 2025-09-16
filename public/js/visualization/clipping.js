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
    let dimension, minCoord, maxCoord, centerCoord;
    
    switch(currentDir) {
        case 'x':
            dimension = actualBounds.size.x;
            centerCoord = actualBounds.center.x;
            minCoord = actualBounds.min.x + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.x + (maxPercent / 100) * dimension;
            break;
        case 'y':
            dimension = actualBounds.size.y;
            centerCoord = actualBounds.center.y;
            minCoord = actualBounds.min.y + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.y + (maxPercent / 100) * dimension;
            break;
        case 'z':
        default:
            dimension = actualBounds.size.z;
            centerCoord = actualBounds.center.z;
            minCoord = actualBounds.min.z + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.z + (maxPercent / 100) * dimension;
            break;
    }
    
    console.log(`VERTEX-BASED range calculation for class ${classValue}:`, {
        direction: currentDir,
        actualDimension: dimension.toFixed(3),
        actualBounds: {
            min: (currentDir === 'x' ? actualBounds.min.x : 
                  currentDir === 'y' ? actualBounds.min.y : actualBounds.min.z).toFixed(3),
            max: (currentDir === 'x' ? actualBounds.max.x : 
                  currentDir === 'y' ? actualBounds.max.y : actualBounds.max.z).toFixed(3)
        },
        calculatedCoords: {
            minCoord: minCoord.toFixed(3),
            maxCoord: maxCoord.toFixed(3)
        },
        percentRange: `${minPercent}% - ${maxPercent}%`
    });

    // Create clipping planes (FIXED: Correct Three.js plane math)
    let clippingPlanes = [];

    // Only create clipping planes if we're actually clipping something
    if (minPercent > 0 || maxPercent < 100) {
        console.log(`Creating CORRECTED clipping planes for class ${classValue}`);
        
        // Get actual vertex bounds for the selected direction
        let actualMin, actualMax;
        switch(currentDir) {
            case 'x':
                actualMin = actualBounds.min.x;
                actualMax = actualBounds.max.x;
                break;
            case 'y':
                actualMin = actualBounds.min.y;
                actualMax = actualBounds.max.y;
                break;
            case 'z':
            default:
                actualMin = actualBounds.min.z;
                actualMax = actualBounds.max.z;
                break;
        }
        
        const actualRange = actualMax - actualMin;
        const clipMin = actualMin + (minPercent / 100) * actualRange;
        const clipMax = actualMin + (maxPercent / 100) * actualRange;
        
        console.log(`CORRECTED clipping: ${currentDir}-axis from ${clipMin.toFixed(3)} to ${clipMax.toFixed(3)}`);
        console.log(`  This should KEEP geometry between ${clipMin.toFixed(3)} and ${clipMax.toFixed(3)}`);
        console.log(`  Actual geometry range: ${actualMin.toFixed(3)} to ${actualMax.toFixed(3)}`);
        
        // CORRECTED Three.js plane math:
        // Three.js clips where: normal·point + constant > 0
        // To keep geometry between clipMin and clipMax, we need:
        // - Plane 1: clips geometry < clipMin (keeps >= clipMin)  
        // - Plane 2: clips geometry > clipMax (keeps <= clipMax)
        
        // FIXED: Corrected Three.js clipping plane math
        if (minPercent > 0) {
            // Clip everything below clipMin
            let plane1;
            switch(currentDir) {
                case 'x':
                    plane1 = new THREE.Plane(new THREE.Vector3(1, 0, 0), -clipMin);
                    break;
                case 'y':
                    plane1 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipMin);
                    break;
                case 'z':
                default:
                    plane1 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipMin);
                    break;
            }
            clippingPlanes.push(plane1);
            console.log(`  FIXED plane 1: clips ${currentDir} < ${clipMin.toFixed(3)} (keeps >= ${clipMin.toFixed(3)})`);
        }

        if (maxPercent < 100) {
            // Clip everything above clipMax  
            let plane2;
            switch(currentDir) {
                case 'x':
                    plane2 = new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipMax);
                    break;
                case 'y':
                    plane2 = new THREE.Plane(new THREE.Vector3(0, -1, 0), clipMax);
                    break;
                case 'z':
                default:
                    plane2 = new THREE.Plane(new THREE.Vector3(0, 0, -1), clipMax);
                    break;
            }
            clippingPlanes.push(plane2);
            console.log(`  FIXED plane 2: clips ${currentDir} > ${clipMax.toFixed(3)} (keeps <= ${clipMax.toFixed(3)})`);
        }
        
        // ROTATION-AWARE: Transform clipping planes if the mesh is rotated
        if (state.meshGroup && (state.meshGroup.rotation.x !== 0 || state.meshGroup.rotation.y !== 0 || state.meshGroup.rotation.z !== 0)) {
            console.log(`Applying rotation transformation for class ${classValue}:`, {
                rotation: `(${state.meshGroup.rotation.x.toFixed(3)}, ${state.meshGroup.rotation.y.toFixed(3)}, ${state.meshGroup.rotation.z.toFixed(3)})`
            });
            
            // Get the rotation matrix
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromEuler(state.meshGroup.rotation);
            
            // Create a 3x3 matrix for transforming normals
            const rotationMatrix3 = new THREE.Matrix3().setFromMatrix4(rotationMatrix);
            
            // Transform each clipping plane
            clippingPlanes.forEach((plane, index) => {
                // Store original for debugging
                const originalNormal = plane.normal.clone();
                
                // Transform the normal vector
                plane.normal.applyMatrix3(rotationMatrix3);
                
                console.log(`  Plane ${index + 1}: normal transformed from (${originalNormal.x.toFixed(3)}, ${originalNormal.y.toFixed(3)}, ${originalNormal.z.toFixed(3)}) to (${plane.normal.x.toFixed(3)}, ${plane.normal.y.toFixed(3)}, ${plane.normal.z.toFixed(3)})`);
            });
            
            console.log(`Applied rotation transformation to ${clippingPlanes.length} planes`);
        } else {
            console.log('No rotation applied - mesh is at default orientation');
        }
        
        console.log(`Created ${clippingPlanes.length} CORRECTED clipping planes for class ${classValue}`);
    } else {
        console.log(`No clipping needed for class ${classValue} - showing full range (0%-100%)`);
    }
    
    // Apply clipping planes to this specific class mesh
    if (classMesh.material) {
        classMesh.material.clippingPlanes = clippingPlanes;
        classMesh.material.needsUpdate = true;
        console.log(`Applied ${clippingPlanes.length} clipping planes to class ${classValue} material`);
    } else {
        console.error(`No material found for class ${classValue}`);
    }
    
    // Enable clipping if any class has clipping planes
    let hasAnyClipping = false;
    Object.keys(state.classMeshes).forEach(cv => {
        const mesh = state.classMeshes[cv];
        if (mesh && mesh.material && mesh.material.clippingPlanes && mesh.material.clippingPlanes.length > 0) {
            hasAnyClipping = true;
        }
    });
    
    if (state.renderer) {
        state.renderer.localClippingEnabled = hasAnyClipping;
    }
    console.log(`Renderer clipping enabled: ${hasAnyClipping}`);
    
    console.log(`=== FINAL: Applied range ${minPercent}%-${maxPercent}% to class ${classValue} (${clippingPlanes.length} planes) ===`);
    
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
 * Apply slice-based filtering to meshes (legacy compatibility function)
 * @param {Array} currentSliceRange - Array with [min, max] percentages
 */
export function applySliceRangeToMeshes(currentSliceRange = [0, 100]) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.segmentationData) {
        console.log('No meshes or data available for slice filtering');
        return;
    }
    
    const [depth, height, width] = state.segmentationData.shape;
    
    // Calculate range based on the selected direction
    let minCoord, maxCoord, axis, planeDimension;
    
    switch(state.sliceDirection) {
        case 'x': // Left to Right
            planeDimension = width;
            axis = 'X';
            break;
        case 'y': // Bottom to Top  
            planeDimension = height;
            axis = 'Y';
            break;
        case 'z': // Front to Back (this should be the correct one for most medical data)
            planeDimension = depth;
            axis = 'Z';
            break;
        default:
            planeDimension = depth;
            axis = 'Z';
            updateGlobalState({ sliceDirection: 'z' });
    }
    
    // Calculate coordinate range based on percentage (centered around origin)
    const halfDim = planeDimension / 2;
    const rangeSize = (currentSliceRange[1] - currentSliceRange[0]) / 100 * planeDimension;
    const rangeCenter = (currentSliceRange[0] + currentSliceRange[1]) / 2 / 100 * planeDimension - halfDim;
    
    minCoord = rangeCenter - rangeSize / 2;
    maxCoord = rangeCenter + rangeSize / 2;
    
    console.log(`Applying ${axis}-axis slice filter: ${minCoord.toFixed(2)} to ${maxCoord.toFixed(2)}`);
    console.log(`Range: ${currentSliceRange[0]}% to ${currentSliceRange[1]}% of ${planeDimension} ${axis}-dimension`);
    
    // Create clipping planes based on direction
    let clippingPlanes;
    
    switch(state.sliceDirection) {
        case 'x':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -minCoord),   // Clip left of minX
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxCoord)    // Clip right of maxX
            ];
            break;
        case 'y':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -minCoord),   // Clip below minY
                new THREE.Plane(new THREE.Vector3(0, -1, 0), maxCoord)    // Clip above maxY
            ];
            break;
        case 'z':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 0, 1), -minCoord),   // Clip behind minZ
                new THREE.Plane(new THREE.Vector3(0, 0, -1), maxCoord)    // Clip in front of maxZ
            ];
            break;
    }
    
    // Apply clipping planes to all visible meshes
    Object.keys(state.classMeshes).forEach(classValue => {
        const classMesh = state.classMeshes[classValue];
        if (!classMesh.visible) return;
        
        // Apply clipping planes
        classMesh.material.clippingPlanes = clippingPlanes;
        classMesh.material.clipShadows = true;
        classMesh.material.needsUpdate = true;
    });
    
    // Enable clipping planes in renderer
    if (state.renderer) {
        state.renderer.localClippingEnabled = true;
    }
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}