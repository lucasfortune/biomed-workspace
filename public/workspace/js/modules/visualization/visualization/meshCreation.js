/**
 * meshCreation.js - Slice-based 3D mesh creation from voxel data
 *
 * Creates slice-based meshes from VoxelSlices JSON format.
 * Each class gets 20 slices for range slider control.
 *
 * OPTIMIZATIONS:
 * 1. Slice-bounded loops - only iterate the slice region, not entire volume
 * 2. Single-pass multi-class - process all classes in one volume scan per slice
 * 3. Web Worker support - offload heavy computation to background thread
 */

import {
    CLASS_COLORS,
    getVoxelValue,
    addQuadFace,
    centerAndScaleGeometry
} from './utils.js';

// Web Worker instance (lazy initialized)
let meshWorker = null;

/**
 * Get or create the mesh processing Web Worker
 * @returns {Worker|null} - Worker instance or null if not supported
 */
function getMeshWorker() {
    if (meshWorker) return meshWorker;

    if (typeof Worker === 'undefined') {
        console.warn('[MeshCreation] Web Workers not supported, using synchronous processing');
        return null;
    }

    try {
        // Get the worker script path relative to the module
        const workerPath = '/workspace/js/modules/visualization/visualization/meshWorker.js';
        meshWorker = new Worker(workerPath);
        console.log('[MeshCreation] Web Worker initialized');
        return meshWorker;
    } catch (e) {
        console.warn('[MeshCreation] Failed to create Web Worker:', e);
        return null;
    }
}

/**
 * Create slice-based meshes using Web Worker (async)
 * Falls back to synchronous processing if workers unavailable
 * @param {Object} data - VoxelSlices JSON data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} - { meshGroup, sliceMeshes, availableClasses, sliceMetadata }
 */
export async function createSliceBasedClassMeshesAsync(data, scene, onProgress = null) {
    const worker = getMeshWorker();

    if (!worker) {
        // Fall back to synchronous processing
        return createSliceBasedClassMeshes(data, scene);
    }

    console.log('[MeshCreation] Creating slice-based meshes (async with Web Worker)...');
    const startTime = performance.now();

    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    const sliceCount = data.sliceCount || 20;
    const sliceDirection = data.sliceDirection || 'z';
    const sliceBoundaries = data.sliceBoundaries;
    const availableClasses = data.classes || [...new Set(voxelData.map(v => v.value))].sort((a, b) => a - b);

    console.log(`[MeshCreation] Shape: ${depth}x${height}x${width}, Classes: ${availableClasses}, Slices: ${sliceCount}`);

    // Pre-compute class volumes for inner/outer detection (sent to worker)
    const classVolumes = {};
    voxelData.forEach(voxel => {
        classVolumes[voxel.value] = (classVolumes[voxel.value] || 0) + 1;
    });
    console.log(`[MeshCreation] Class volumes:`, classVolumes);

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

    // Calculate scaling factor
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;

    return new Promise((resolve, reject) => {
        const messageHandler = (e) => {
            const { type, data: resultData, message, progress } = e.data;

            if (type === 'progress') {
                if (onProgress) onProgress(progress, message);
                console.log(`[MeshCreation Worker] ${message || `Progress: ${progress}%`}`);
            } else if (type === 'complete') {
                worker.removeEventListener('message', messageHandler);

                const { sliceData, timing } = resultData;
                console.log(`[MeshCreation Worker] Complete - Sparse: ${timing.sparse.toFixed(1)}ms, Mesh: ${timing.mesh.toFixed(1)}ms, Total: ${timing.total.toFixed(1)}ms`);

                // Create Three.js meshes from worker data
                const meshGroup = new THREE.Group();
                const sliceMeshes = {};

                for (const classValue of availableClasses) {
                    sliceMeshes[classValue] = new Array(sliceCount).fill(null);

                    for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
                        const meshData = sliceData[classValue]?.[sliceIndex];
                        if (meshData && meshData.vertices.length > 0) {
                            const mesh = createMeshFromVertexData(
                                Array.from(meshData.vertices),
                                Array.from(meshData.normals),
                                classValue, shape, scaleFactor
                            );
                            mesh.userData = {
                                classValue: classValue,
                                sliceIndex: sliceIndex,
                                originalOpacity: 0.8
                            };
                            // Set renderOrder based on class volume: smaller volumes render first (lower renderOrder)
                            // This ensures inner classes are in framebuffer before outer classes blend on top
                            mesh.renderOrder = classVolumes[classValue] || 0;
                            sliceMeshes[classValue][sliceIndex] = mesh;
                            meshGroup.add(mesh);
                        }
                    }

                    const nonEmptySlices = sliceMeshes[classValue].filter(m => m !== null).length;
                    console.log(`[MeshCreation] Class ${classValue}: ${nonEmptySlices}/${sliceCount} non-empty slices`);
                }

                scene.add(meshGroup);

                const totalTime = performance.now() - startTime;
                console.log(`[MeshCreation] Created slice meshes for ${availableClasses.length} classes in ${totalTime.toFixed(1)}ms (including worker overhead)`);

                resolve({
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
                });
            }
        };

        const errorHandler = (e) => {
            worker.removeEventListener('message', messageHandler);
            worker.removeEventListener('error', errorHandler);
            console.error('[MeshCreation Worker] Error:', e);
            reject(new Error('Web Worker error: ' + e.message));
        };

        worker.addEventListener('message', messageHandler);
        worker.addEventListener('error', errorHandler);

        // Send data to worker
        worker.postMessage({
            type: 'processVoxelData',
            data: {
                voxelData: voxelData,
                shape: shape,
                availableClasses: availableClasses,
                sliceCount: sliceCount,
                sliceDirection: sliceDirection,
                sliceBoundaries: sliceBoundaries,
                classVolumes: classVolumes  // For inner/outer detection at class boundaries
            }
        });
    });
}

/**
 * Terminate the mesh worker (call when done with visualization)
 */
export function terminateMeshWorker() {
    if (meshWorker) {
        meshWorker.terminate();
        meshWorker = null;
        console.log('[MeshCreation] Web Worker terminated');
    }
}

/**
 * Create slice-based meshes for each class from voxel data
 * @param {Object} data - VoxelSlices JSON data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, sliceMeshes, availableClasses, sliceMetadata }
 */
export function createSliceBasedClassMeshes(data, scene) {
    console.log('[MeshCreation] Creating slice-based meshes (optimized)...');
    const startTime = performance.now();

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

    const sparseStartTime = performance.now();

    // Compute class volumes (voxel count per class) for inner/outer detection
    const classVolumes = {};
    voxelData.forEach(voxel => {
        const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
        volume[index] = voxel.value;
        // Count voxels per class
        classVolumes[voxel.value] = (classVolumes[voxel.value] || 0) + 1;
    });
    console.log(`[MeshCreation] Sparse-to-dense conversion: ${(performance.now() - sparseStartTime).toFixed(1)}ms`);
    console.log(`[MeshCreation] Class volumes:`, classVolumes);

    // Calculate scaling factor (same as segmentation module)
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;

    // Create mesh group and slice structure
    const meshGroup = new THREE.Group();
    const sliceMeshes = {};

    // Initialize slice arrays for each class
    availableClasses.forEach(classValue => {
        sliceMeshes[classValue] = new Array(sliceCount).fill(null);
    });

    // OPTIMIZATION: Process all classes for each slice in a single pass
    // Instead of (classes × slices) volume scans, we do just (slices) scans
    const meshStartTime = performance.now();
    for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
        const sliceMeshData = createSliceForAllClasses(
            volume, shape, availableClasses, sliceIndex,
            sliceBoundaries, sliceDirection, scaleFactor, classVolumes
        );

        // Create meshes for each class from the collected data
        for (const classValue of availableClasses) {
            const classData = sliceMeshData[classValue];
            if (classData && classData.vertices.length > 0) {
                const mesh = createMeshFromVertexData(classData.vertices, classData.normals, classValue, shape, scaleFactor);
                mesh.userData = {
                    classValue: classValue,
                    sliceIndex: sliceIndex,
                    originalOpacity: 0.8
                };
                // Set renderOrder based on class volume: smaller volumes render first (lower renderOrder)
                // This ensures inner classes are in framebuffer before outer classes blend on top
                mesh.renderOrder = classVolumes[classValue] || 0;
                sliceMeshes[classValue][sliceIndex] = mesh;
                meshGroup.add(mesh);
            }
        }
    }
    console.log(`[MeshCreation] Mesh generation: ${(performance.now() - meshStartTime).toFixed(1)}ms`);

    // Log stats per class
    availableClasses.forEach(classValue => {
        const nonEmptySlices = sliceMeshes[classValue].filter(m => m !== null).length;
        console.log(`[MeshCreation] Class ${classValue}: ${nonEmptySlices}/${sliceCount} non-empty slices`);
    });

    // Add mesh group to scene
    scene.add(meshGroup);

    const totalTime = performance.now() - startTime;
    console.log(`[MeshCreation] Created slice meshes for ${availableClasses.length} classes in ${totalTime.toFixed(1)}ms`);

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
 * Create mesh data for ALL classes in a single slice with one volume scan
 * OPTIMIZATION: Instead of scanning the volume once per class, scan once and bucket by class
 * @param {Uint8Array} volume - Dense volume data
 * @param {Array} shape - [depth, height, width]
 * @param {Array} availableClasses - Array of class values to process
 * @param {number} sliceIndex - Which slice (0 to sliceCount-1)
 * @param {Array} sliceBoundaries - Array of slice boundary positions
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {number} scaleFactor - Scaling factor for vertices
 * @param {Object} classVolumes - Voxel count per class (for inner/outer detection)
 * @returns {Object} - Map of classValue -> { vertices: [], normals: [] }
 */
function createSliceForAllClasses(volume, shape, availableClasses, sliceIndex, sliceBoundaries, sliceDirection, scaleFactor, classVolumes = {}) {
    const [depth, height, width] = shape;

    // Initialize vertex/normal arrays for each class
    const classData = {};
    for (const classValue of availableClasses) {
        classData[classValue] = { vertices: [], normals: [] };
    }

    // Create a Set for O(1) class lookup
    const classSet = new Set(availableClasses);

    // Get slice boundaries from pre-computed array
    const sliceStart = sliceBoundaries[sliceIndex];
    const sliceEnd = sliceBoundaries[sliceIndex + 1];

    // Calculate loop bounds based on slice direction
    let xStart = 0, xEnd = width;
    let yStart = 0, yEnd = height;
    let zStart = 0, zEnd = depth;

    switch (sliceDirection) {
        case 'x':
            xStart = sliceStart;
            xEnd = sliceEnd;
            break;
        case 'y':
            yStart = sliceStart;
            yEnd = sliceEnd;
            break;
        case 'z':
            zStart = sliceStart;
            zEnd = sliceEnd;
            break;
    }

    // Pre-define faces array (avoid repeated allocation)
    const faces = [
        { dx: 1, dy: 0, dz: 0, name: 'right' },
        { dx: -1, dy: 0, dz: 0, name: 'left' },
        { dx: 0, dy: 1, dz: 0, name: 'top' },
        { dx: 0, dy: -1, dz: 0, name: 'bottom' },
        { dx: 0, dy: 0, dz: 1, name: 'front' },
        { dx: 0, dy: 0, dz: -1, name: 'back' }
    ];

    // Single pass through the slice region - process ALL classes at once
    for (let z = zStart; z < zEnd; z++) {
        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                const currentValue = getVoxelValue(volume, x, y, z, width, height, depth);

                // Skip if not a class we care about (background = 0)
                if (!classSet.has(currentValue)) continue;

                const data = classData[currentValue];

                // Check each face of the voxel
                for (let i = 0; i < 6; i++) {
                    const face = faces[i];
                    const neighborValue = getVoxelValue(volume,
                        x + face.dx, y + face.dy, z + face.dz,
                        width, height, depth);

                    // If neighbor is different class, this face is on the surface
                    if (neighborValue !== currentValue) {
                        // Background boundary (neighborValue === 0): always render exterior surface
                        if (neighborValue === 0) {
                            addQuadFace(data.vertices, data.normals, x, y, z, face);
                        }
                        // Class-class boundary: only smaller (inner) class renders its face
                        // This prevents z-fighting at shared edges between enclosed volumes
                        else {
                            const currentVolume = classVolumes[currentValue] || 0;
                            const neighborVolume = classVolumes[neighborValue] || 0;
                            // Smaller volume wins (inner class). Equal volumes: both render (fallback)
                            if (currentVolume <= neighborVolume) {
                                addQuadFace(data.vertices, data.normals, x, y, z, face);
                            }
                        }
                    }
                }
            }
        }
    }

    return classData;
}

/**
 * Create a Three.js mesh from pre-computed vertex/normal data
 * @param {Array} vertices - Flat array of vertex coordinates
 * @param {Array} normals - Flat array of normal coordinates
 * @param {number} classValue - Class number for material color
 * @param {Array} shape - [depth, height, width]
 * @param {number} scaleFactor - Scaling factor
 * @returns {THREE.Mesh}
 */
function createMeshFromVertexData(vertices, normals, classValue, shape, scaleFactor) {
    const geometry = new THREE.BufferGeometry();
    const vertexArray = new Float32Array(vertices);
    const normalArray = new Float32Array(normals);

    // Center and scale geometry
    centerAndScaleGeometry(vertexArray, shape, scaleFactor);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
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

    // OPTIMIZATION: Calculate loop bounds based on slice direction
    // Instead of iterating entire volume and checking inSlice, only iterate the slice region
    let xStart = 0, xEnd = width;
    let yStart = 0, yEnd = height;
    let zStart = 0, zEnd = depth;

    switch (sliceDirection) {
        case 'x':
            xStart = sliceStart;
            xEnd = sliceEnd;
            break;
        case 'y':
            yStart = sliceStart;
            yEnd = sliceEnd;
            break;
        case 'z':
            zStart = sliceStart;
            zEnd = sliceEnd;
            break;
    }

    // Pre-define faces array outside the loop (avoid repeated allocation)
    const faces = [
        { dx: 1, dy: 0, dz: 0, name: 'right' },
        { dx: -1, dy: 0, dz: 0, name: 'left' },
        { dx: 0, dy: 1, dz: 0, name: 'top' },
        { dx: 0, dy: -1, dz: 0, name: 'bottom' },
        { dx: 0, dy: 0, dz: 1, name: 'front' },
        { dx: 0, dy: 0, dz: -1, name: 'back' }
    ];

    // Extract surface vertices for this class and slice
    // Now only iterates over the slice region, not the entire volume
    for (let z = zStart; z < zEnd; z++) {
        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                const currentValue = getVoxelValue(volume, x, y, z, width, height, depth);
                if (currentValue !== classValue) continue;

                // Check each face of the voxel
                for (let i = 0; i < 6; i++) {
                    const face = faces[i];
                    const neighborValue = getVoxelValue(volume,
                        x + face.dx, y + face.dy, z + face.dz,
                        width, height, depth);

                    // If neighbor is different class, this face is on the surface
                    if (neighborValue !== classValue) {
                        addQuadFace(classVertices, classNormals, x, y, z, face);
                    }
                }
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

        // Set renderOrder to render AFTER all mesh classes
        // This ensures OG data planes properly integrate with transparent meshes
        // Using a very high value that will always exceed any class volume count
        plane.renderOrder = 1e9;

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
