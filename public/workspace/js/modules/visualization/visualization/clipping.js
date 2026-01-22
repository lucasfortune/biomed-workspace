/**
 * clipping.js - Dynamic endcap generation for slice-based meshes
 *
 * Creates cross-sectional capping meshes when range sliders cut the volume.
 * Endcaps show the interior cross-section at slice boundaries.
 */

import {
    CLASS_COLORS,
    getVoxelValue,
    addQuadFace,
    centerAndScaleGeometry
} from './utils.js';

// Per-class tracking of capping meshes
let classCappingMeshes = {}; // { classValue: { front: mesh, back: mesh } }

/**
 * Update accurate capping meshes for specified classes
 * @param {Object} classRanges - Object with class ranges: { classValue: {min, max}, ... }
 * @param {Object} state - Module state containing sliceMeshes, sliceMetadata, meshGroup, volume
 */
export function updateAccurateCapping(classRanges, state) {
    if (!state.sliceMeshes || !state.volume || !state.sliceMetadata) {
        console.log('[Clipping] Missing required data for accurate capping');
        return;
    }

    const { shape, sliceCount, sliceDirection } = state.sliceMetadata;

    // Process each class
    Object.keys(classRanges).forEach(classValue => {
        // Remove old caps for this class
        removeCappingMeshesForClass(classValue, state.meshGroup);

        const range = classRanges[classValue];

        // No caps needed for full range
        if (range.min === 0 && range.max === 100) {
            return;
        }

        // Convert percentages to slice indices
        const minSlice = Math.floor(range.min / 100 * sliceCount);
        const maxSlice = Math.ceil(range.max / 100 * sliceCount) - 1;

        // Create caps for this class
        createAccurateCapsForClass(
            classValue,
            minSlice,
            maxSlice,
            sliceCount,
            sliceDirection,
            shape,
            state
        );
    });
}

/**
 * Create accurate cross-sectional caps for a specific class
 */
function createAccurateCapsForClass(classValue, minSlice, maxSlice, sliceCount, sliceDirection, shape, state) {
    const { volume, meshGroup, sliceMeshes, sliceMetadata } = state;

    // Get renderOrder from existing slice mesh of this class (for consistent transparency ordering)
    let classRenderOrder = 0;
    if (sliceMeshes && sliceMeshes[classValue]) {
        const existingMesh = sliceMeshes[classValue].find(m => m !== null);
        if (existingMesh) {
            classRenderOrder = existingMesh.renderOrder || 0;
        }
    }

    // Create front cap (at minSlice boundary) if not at start
    if (minSlice > 0) {
        const frontCapMesh = createCrossSectionalCap(
            volume, shape, classValue, minSlice, sliceDirection, 'front', sliceCount, sliceMeshes
        );
        if (frontCapMesh && meshGroup) {
            frontCapMesh.renderOrder = classRenderOrder;  // Match parent class renderOrder
            meshGroup.add(frontCapMesh);
            trackCappingMesh(classValue, frontCapMesh, 'front');
        }
    }

    // Create back cap (at maxSlice boundary) if not at end
    if (maxSlice < sliceCount - 1) {
        const backCapMesh = createCrossSectionalCap(
            volume, shape, classValue, maxSlice + 1, sliceDirection, 'back', sliceCount, sliceMeshes
        );
        if (backCapMesh && meshGroup) {
            backCapMesh.renderOrder = classRenderOrder;  // Match parent class renderOrder
            meshGroup.add(backCapMesh);
            trackCappingMesh(classValue, backCapMesh, 'back');
        }
    }
}

/**
 * Create a cross-sectional cap mesh at a slice boundary
 * @param {Uint8Array} volume - Dense volume data
 * @param {Array} shape - [depth, height, width]
 * @param {number} classValue - Class number
 * @param {number} sliceIndex - Slice index for the cap
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {string} side - 'front' or 'back'
 * @param {number} sliceCount - Total number of slices
 * @param {Object} sliceMeshes - Slice meshes to get color from
 * @returns {THREE.Mesh|null} - The cap mesh or null if empty
 */
function createCrossSectionalCap(volume, shape, classValue, sliceIndex, sliceDirection, side, sliceCount, sliceMeshes) {
    const [depth, height, width] = shape;
    const capVertices = [];
    const capNormals = [];

    // Calculate the actual slice position in volume coordinates
    let slicePosition;
    switch (sliceDirection) {
        case 'x':
            slicePosition = Math.floor((sliceIndex * width) / sliceCount);
            break;
        case 'y':
            slicePosition = Math.floor((sliceIndex * height) / sliceCount);
            break;
        case 'z':
        default:
            slicePosition = Math.floor((sliceIndex * depth) / sliceCount);
            break;
    }

    // Extract boundary faces at this slice position
    extractBoundaryFacesAtSlice(
        volume, shape, classValue, slicePosition,
        sliceDirection, side, capVertices, capNormals
    );

    if (capVertices.length === 0) {
        return null; // No voxels at this slice
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(capVertices);
    const normals = new Float32Array(capNormals);

    // Apply same scaling as slice meshes
    const maxOriginalDim = Math.max(depth, height, width);
    const scaleFactor = 8 / maxOriginalDim;
    centerAndScaleGeometry(vertices, shape, scaleFactor);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Get color from existing slice mesh or use default
    const colorArray = CLASS_COLORS[classValue] || [0.6, 0.6, 0.6];
    let opacity = 0.8;

    // Try to get opacity from existing slice mesh
    if (sliceMeshes && sliceMeshes[classValue]) {
        const existingMesh = sliceMeshes[classValue].find(m => m !== null);
        if (existingMesh && existingMesh.material) {
            opacity = existingMesh.material.opacity;
        }
    }

    // Create material - slightly more transparent for caps
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(colorArray[0], colorArray[1], colorArray[2]),
        transparent: true,
        opacity: opacity * 0.6, // 60% of the slice opacity
        side: THREE.DoubleSide
    });

    const capMesh = new THREE.Mesh(geometry, material);
    capMesh.userData = {
        isCappingMesh: true,
        classValue: parseInt(classValue),
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
 * @param {number} slicePosition - Position of the slice in volume coordinates
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
    switch (sliceDirection) {
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

    // Iterate through the 2D slice and add faces for matching voxels
    switch (sliceDirection) {
        case 'x':
            // YZ plane at X = slicePosition
            for (let z = 0; z < depth; z++) {
                for (let y = 0; y < height; y++) {
                    const currentValue = getVoxelValue(volume, slicePosition, y, z, width, height, depth);
                    if (currentValue === targetClassValue) {
                        addQuadFace(vertices, normals, slicePosition, y, z, { name: faceDirection });
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
                        addQuadFace(vertices, normals, x, slicePosition, z, { name: faceDirection });
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
                        addQuadFace(vertices, normals, x, y, slicePosition, { name: faceDirection });
                    }
                }
            }
            break;
    }
}

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
 * @param {number|string} classValue - Class value
 * @param {THREE.Group} meshGroup - Parent mesh group
 */
export function removeCappingMeshesForClass(classValue, meshGroup) {
    if (classCappingMeshes[classValue]) {
        Object.values(classCappingMeshes[classValue]).forEach(mesh => {
            if (mesh) {
                if (meshGroup && mesh.parent === meshGroup) {
                    meshGroup.remove(mesh);
                }
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
        });
        classCappingMeshes[classValue] = {};
    }
}

/**
 * Remove all capping meshes
 * @param {THREE.Group} meshGroup - Parent mesh group
 */
export function removeAllCappingMeshes(meshGroup) {
    Object.keys(classCappingMeshes).forEach(classValue => {
        removeCappingMeshesForClass(classValue, meshGroup);
    });
}

/**
 * Get capping meshes for a class
 * @param {number|string} classValue - Class value
 * @returns {Object} - { front: mesh, back: mesh }
 */
export function getCappingMeshesForClass(classValue) {
    return classCappingMeshes[classValue] || {};
}

/**
 * Update opacity of capping meshes for a class
 * @param {number|string} classValue - Class value
 * @param {number} opacity - New opacity (0-1)
 */
export function setCappingOpacity(classValue, opacity) {
    if (classCappingMeshes[classValue]) {
        Object.values(classCappingMeshes[classValue]).forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.opacity = opacity * 0.6; // 60% of slice opacity
                mesh.material.needsUpdate = true;
            }
        });
    }
}

/**
 * Set visibility of capping meshes for a class
 * @param {number|string} classValue - Class value
 * @param {boolean} visible - Visibility state
 */
export function setCappingVisibility(classValue, visible) {
    if (classCappingMeshes[classValue]) {
        Object.values(classCappingMeshes[classValue]).forEach(mesh => {
            if (mesh) {
                mesh.visible = visible;
            }
        });
    }
}
