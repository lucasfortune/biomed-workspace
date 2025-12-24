/**
 * meshCreation.js - Slice-based 3D mesh creation from voxel data
 *
 * Creates slice-based meshes from VoxelSlices JSON format.
 * Each class gets 20 slices for range slider control.
 */

import {
    CLASS_COLORS,
    getVoxelValue,
    addQuadFace,
    centerAndScaleGeometry
} from './utils.js';

/**
 * Create slice-based meshes for each class from voxel data
 * @param {Object} data - VoxelSlices JSON data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, sliceMeshes, availableClasses, sliceMetadata }
 */
export function createSliceBasedClassMeshes(data, scene) {
    console.log('[MeshCreation] Creating slice-based meshes...');

    // Extract data from VoxelSlices format
    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    const sliceCount = data.sliceCount || 20;
    const sliceDirection = data.sliceDirection || 'z';
    const sliceBoundaries = data.sliceBoundaries;

    // Get available classes from data
    const availableClasses = data.classes || [...new Set(voxelData.map(v => v.value))].sort((a, b) => a - b);

    console.log(`[MeshCreation] Shape: ${depth}x${height}x${width}, Classes: ${availableClasses}, Slices: ${sliceCount}`);

    // Convert sparse voxel data to dense 3D volume for efficient lookup
    const volume = new Uint8Array(depth * height * width);
    voxelData.forEach(voxel => {
        const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
        volume[index] = voxel.value;
    });

    // Calculate scaling factor (same as segmentation module)
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;

    // Create mesh group and slice structure
    const meshGroup = new THREE.Group();
    const sliceMeshes = {};

    // Create slices for each class
    availableClasses.forEach(classValue => {
        sliceMeshes[classValue] = [];

        for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
            const sliceMesh = createSingleSlice(
                volume, shape, classValue, sliceIndex,
                sliceBoundaries, sliceDirection, scaleFactor
            );

            if (sliceMesh) {
                sliceMesh.userData = {
                    classValue: classValue,
                    sliceIndex: sliceIndex,
                    originalOpacity: 0.8
                };

                sliceMeshes[classValue][sliceIndex] = sliceMesh;
                meshGroup.add(sliceMesh);
            } else {
                // Store null for empty slices
                sliceMeshes[classValue][sliceIndex] = null;
            }
        }

        const nonEmptySlices = sliceMeshes[classValue].filter(m => m !== null).length;
        console.log(`[MeshCreation] Class ${classValue}: ${nonEmptySlices}/${sliceCount} non-empty slices`);
    });

    // Add mesh group to scene
    scene.add(meshGroup);

    console.log(`[MeshCreation] Created slice meshes for ${availableClasses.length} classes`);

    return {
        meshGroup,
        sliceMeshes,
        availableClasses,
        sliceMetadata: {
            sliceCount,
            sliceDirection,
            sliceBoundaries,
            shape,
            scaleFactor
        }
    };
}

/**
 * Create a single slice mesh for a specific class
 * @param {Uint8Array} volume - Dense volume data
 * @param {Array} shape - [depth, height, width]
 * @param {number} classValue - Class number
 * @param {number} sliceIndex - Which slice (0 to sliceCount-1)
 * @param {Array} sliceBoundaries - Array of slice boundary positions
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {number} scaleFactor - Scaling factor for vertices
 * @returns {THREE.Mesh|null} - The slice mesh or null if empty
 */
function createSingleSlice(volume, shape, classValue, sliceIndex, sliceBoundaries, sliceDirection, scaleFactor) {
    const [depth, height, width] = shape;
    const classVertices = [];
    const classNormals = [];

    // Get slice boundaries from pre-computed array
    const sliceStart = sliceBoundaries[sliceIndex];
    const sliceEnd = sliceBoundaries[sliceIndex + 1];

    // Extract surface vertices for this class and slice
    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {

                // Check if this voxel is in our slice range
                let inSlice = false;
                switch (sliceDirection) {
                    case 'x': inSlice = (x >= sliceStart && x < sliceEnd); break;
                    case 'y': inSlice = (y >= sliceStart && y < sliceEnd); break;
                    case 'z': inSlice = (z >= sliceStart && z < sliceEnd); break;
                }

                if (!inSlice) continue;

                const currentValue = getVoxelValue(volume, x, y, z, width, height, depth);
                if (currentValue !== classValue) continue;

                // Check each face of the voxel
                const faces = [
                    { dx: 1, dy: 0, dz: 0, name: 'right' },
                    { dx: -1, dy: 0, dz: 0, name: 'left' },
                    { dx: 0, dy: 1, dz: 0, name: 'top' },
                    { dx: 0, dy: -1, dz: 0, name: 'bottom' },
                    { dx: 0, dy: 0, dz: 1, name: 'front' },
                    { dx: 0, dy: 0, dz: -1, name: 'back' }
                ];

                faces.forEach(face => {
                    const neighborValue = getVoxelValue(volume,
                        x + face.dx, y + face.dy, z + face.dz,
                        width, height, depth);

                    // If neighbor is different class, this face is on the surface
                    if (neighborValue !== classValue) {
                        addQuadFace(classVertices, classNormals, x, y, z, face);
                    }
                });
            }
        }
    }

    if (classVertices.length === 0) {
        return null; // No vertices in this slice
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(classVertices);
    const normals = new Float32Array(classNormals);

    // Center and scale geometry
    centerAndScaleGeometry(vertices, shape, scaleFactor);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingBox();

    // Create material with class-specific color
    const colorArray = CLASS_COLORS[classValue] || [0.6, 0.6, 0.6];
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(colorArray[0], colorArray[1], colorArray[2]),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
}

/**
 * Set visibility range for a class (show only slices within range)
 * @param {Object} sliceMeshes - The sliceMeshes object
 * @param {number} classValue - Class to update
 * @param {number} minSlice - Minimum slice index (inclusive)
 * @param {number} maxSlice - Maximum slice index (inclusive)
 */
export function setClassSliceRange(sliceMeshes, classValue, minSlice, maxSlice) {
    if (!sliceMeshes[classValue]) return;

    sliceMeshes[classValue].forEach((mesh, index) => {
        if (mesh) {
            mesh.visible = (index >= minSlice && index <= maxSlice);
        }
    });
}

/**
 * Set visibility for all slices of a class
 * @param {Object} sliceMeshes - The sliceMeshes object
 * @param {number} classValue - Class to update
 * @param {boolean} visible - Visibility state
 */
export function setClassVisibility(sliceMeshes, classValue, visible) {
    if (!sliceMeshes[classValue]) return;

    sliceMeshes[classValue].forEach(mesh => {
        if (mesh) {
            mesh.visible = visible;
        }
    });
}

/**
 * Set opacity for all slices of a class
 * @param {Object} sliceMeshes - The sliceMeshes object
 * @param {number} classValue - Class to update
 * @param {number} opacity - Opacity value (0-1)
 */
export function setClassOpacity(sliceMeshes, classValue, opacity) {
    if (!sliceMeshes[classValue]) return;

    sliceMeshes[classValue].forEach(mesh => {
        if (mesh && mesh.material) {
            mesh.material.opacity = opacity;
            mesh.material.transparent = opacity < 1;
            mesh.material.needsUpdate = true;
        }
    });
}

/**
 * Dispose of all slice meshes
 * @param {THREE.Group} meshGroup - The mesh group to dispose
 * @param {Object} sliceMeshes - The slice meshes object
 */
export function disposeSliceMeshes(meshGroup, sliceMeshes) {
    if (meshGroup) {
        meshGroup.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        if (meshGroup.parent) {
            meshGroup.parent.remove(meshGroup);
        }
    }

    // Clear the sliceMeshes object
    for (const key in sliceMeshes) {
        delete sliceMeshes[key];
    }
}
