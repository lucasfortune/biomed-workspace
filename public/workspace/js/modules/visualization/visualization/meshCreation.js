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

    // Check for edge cases
    if (!voxelData || voxelData.length === 0) {
        console.warn('[MeshCreation] No voxel data provided');
        const meshGroup = new THREE.Group();
        scene.add(meshGroup);
        return {
            meshGroup,
            sliceMeshes: {},
            availableClasses: [],
            sliceMetadata: { sliceCount, sliceDirection, sliceBoundaries, shape, scaleFactor: 1 }
        };
    }

    // Check for very large datasets (warn but proceed)
    const volumeSize = depth * height * width;
    const maxSafeSize = 512 * 512 * 512; // ~134M voxels
    if (volumeSize > maxSafeSize) {
        console.warn(`[MeshCreation] Very large dataset: ${volumeSize.toLocaleString()} voxels. This may be slow.`);
    }

    // Convert sparse voxel data to dense 3D volume for efficient lookup
    let volume;
    try {
        volume = new Uint8Array(depth * height * width);
    } catch (e) {
        console.error('[MeshCreation] Failed to allocate volume array (out of memory?):', e);
        throw new Error(`Dataset too large: ${volumeSize.toLocaleString()} voxels exceeds browser memory limits`);
    }
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

// ============================================
// ORIGINAL DATA OVERLAY (TIFF Planes)
// ============================================

/**
 * Load and create textured planes from original TIFF data
 * @param {string} tiffUrl - URL to fetch the TIFF file
 * @param {Array} shape - Mesh shape [depth, height, width] for alignment
 * @param {THREE.Group} meshGroup - Mesh group to add planes to (so they rotate together)
 * @returns {Object|null} - { planeGroup, planes, metadata } or null on failure
 */
export async function loadAndCreateOriginalDataPlanes(tiffUrl, shape, meshGroup) {
    try {
        console.log('[OriginalData] Loading original data from:', tiffUrl);

        const response = await fetch(tiffUrl);

        if (!response.ok) {
            if (response.status === 404) {
                console.warn('[OriginalData] Data not available (404)');
                return null;
            }
            throw new Error(`Failed to load original data: ${response.status}`);
        }

        // Get the TIFF data as array buffer
        const arrayBuffer = await response.arrayBuffer();
        console.log('[OriginalData] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');

        // Parse TIFF using UTIF.js
        const tiffData = await parseTiffData(arrayBuffer);

        console.log(`[OriginalData] Loaded: ${tiffData.slices.length} slices, ${tiffData.width}x${tiffData.height}`);

        // Create textured planes for each slice
        const result = createTexturedPlanes(tiffData, shape);

        // Add to meshGroup so planes rotate with the mesh
        meshGroup.add(result.group);

        return {
            planeGroup: result.group,
            planes: result.planes,
            metadata: {
                numSlices: tiffData.slices.length,
                width: tiffData.width,
                height: tiffData.height
            }
        };

    } catch (error) {
        console.error('[OriginalData] Failed to load original data overlay:', error);
        return null;
    }
}

/**
 * Parse TIFF data from array buffer using UTIF.js
 * @param {ArrayBuffer} arrayBuffer - TIFF file data
 * @returns {Object} - { slices, width, height }
 */
async function parseTiffData(arrayBuffer) {
    const Tiff = window.UTIF;

    if (!Tiff) {
        throw new Error('UTIF.js library not loaded');
    }

    // Decode TIFF
    const ifds = Tiff.decode(arrayBuffer);
    console.log('[OriginalData] Decoded', ifds.length, 'image(s) from TIFF');

    const slices = [];

    for (let i = 0; i < ifds.length; i++) {
        Tiff.decodeImage(arrayBuffer, ifds[i]);
        const rgba = Tiff.toRGBA8(ifds[i]);

        slices.push({
            data: rgba,
            width: ifds[i].width,
            height: ifds[i].height
        });
    }

    return {
        slices: slices,
        width: ifds[0].width,
        height: ifds[0].height
    };
}

/**
 * Create textured planes from TIFF slice data
 * @param {Object} tiffData - Parsed TIFF data { slices, width, height }
 * @param {Array} shape - Mesh shape [depth, height, width]
 * @returns {Object} - { planes, group }
 */
function createTexturedPlanes(tiffData, shape) {
    const group = new THREE.Group();
    const planes = [];

    const [depth, height, width] = shape;

    // Use same scaling as mesh creation
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;

    // Calculate scaled dimensions
    const scaledWidth = width * scaleFactor;
    const scaledHeight = height * scaleFactor;
    const scaledDepth = depth * scaleFactor;

    // Calculate Z spacing
    const zSpacing = tiffData.slices.length > 1
        ? scaledDepth / (tiffData.slices.length - 1)
        : 0;

    console.log(`[OriginalData] Scale factor: ${scaleFactor.toFixed(4)}`);
    console.log(`[OriginalData] Plane size: ${scaledWidth.toFixed(3)} x ${scaledHeight.toFixed(3)}`);
    console.log(`[OriginalData] Z spacing: ${zSpacing.toFixed(4)}`);

    // Create a plane for each slice
    tiffData.slices.forEach((slice, index) => {
        // Create texture from slice data
        const texture = new THREE.DataTexture(
            slice.data,
            slice.width,
            slice.height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Create plane geometry with scaled dimensions
        const geometry = new THREE.PlaneGeometry(scaledWidth, scaledHeight);

        // Create material with texture
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Create mesh
        const plane = new THREE.Mesh(geometry, material);

        // Position in scaled Z space, centered from -scaledDepth/2 to +scaledDepth/2
        let zPosition = (index * zSpacing) - (scaledDepth / 2);

        // Anti-z-fighting: offset first and last planes slightly inward
        const epsilon = 0.01;
        if (index === 0) {
            zPosition += epsilon;
        } else if (index === tiffData.slices.length - 1) {
            zPosition -= epsilon;
        }

        plane.position.set(0, 0, zPosition);

        // Store metadata
        plane.userData.sliceIndex = index;
        plane.userData.isOriginalDataPlane = true;
        plane.userData.originalOpacity = 0.3;

        planes.push(plane);
        group.add(plane);
    });

    // Initially hide planes (user must enable via controls)
    group.visible = false;

    console.log(`[OriginalData] Created ${planes.length} textured planes`);

    return { planes, group };
}

/**
 * Set visibility for original data planes
 * @param {THREE.Group} planeGroup - The plane group
 * @param {boolean} visible - Visibility state
 */
export function setOriginalDataVisibility(planeGroup, visible) {
    if (planeGroup) {
        planeGroup.visible = visible;
    }
}

/**
 * Set opacity for all original data planes
 * @param {Array} planes - Array of plane meshes
 * @param {number} opacity - Opacity value (0-1)
 */
export function setOriginalDataOpacity(planes, opacity) {
    if (!planes) return;

    planes.forEach(plane => {
        if (plane && plane.material) {
            plane.material.opacity = opacity;
            plane.material.needsUpdate = true;
        }
    });
}

/**
 * Set visibility range for original data planes (show only planes within range)
 * @param {Array} planes - Array of plane meshes
 * @param {number} minSlice - Minimum slice index (inclusive)
 * @param {number} maxSlice - Maximum slice index (inclusive)
 */
export function setOriginalDataSliceRange(planes, minSlice, maxSlice) {
    if (!planes) return;

    planes.forEach((plane, index) => {
        if (plane) {
            plane.visible = (index >= minSlice && index <= maxSlice);
        }
    });
}

/**
 * Dispose of original data planes
 * @param {THREE.Group} planeGroup - The plane group to dispose
 * @param {Array} planes - Array of plane meshes
 */
export function disposeOriginalDataPlanes(planeGroup, planes) {
    if (planes) {
        planes.forEach(plane => {
            if (plane) {
                if (plane.geometry) plane.geometry.dispose();
                if (plane.material) {
                    if (plane.material.map) plane.material.map.dispose();
                    plane.material.dispose();
                }
            }
        });
    }

    if (planeGroup && planeGroup.parent) {
        planeGroup.parent.remove(planeGroup);
    }
}
