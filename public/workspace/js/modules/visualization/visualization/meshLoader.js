/**
 * meshLoader.js - Load and parse mesh JSON data
 *
 * Supports two formats:
 * 1. BufferGeometry (marching cubes) - smooth surface meshes
 * 2. VoxelSlices - slice-based voxel meshes for range slider control
 */

import { getClassColorHex, createClassMaterial } from './utils.js';
import { createSliceBasedClassMeshes, createSliceBasedClassMeshesAsync, disposeSliceMeshes, terminateMeshWorker } from './meshCreation.js';

/**
 * Detect the format of mesh JSON data
 * @param {Object} jsonData - Parsed JSON mesh data
 * @returns {string} - 'VoxelSlices' or 'BufferGeometry'
 */
export function detectMeshFormat(jsonData) {
    if (!jsonData || !jsonData.metadata) {
        // Legacy format without metadata - assume BufferGeometry
        if (jsonData && jsonData.meshes) {
            return 'BufferGeometry';
        }
        throw new Error('Invalid mesh JSON: missing metadata and meshes');
    }

    return jsonData.metadata.type || 'BufferGeometry';
}

/**
 * Load mesh data from JSON and create Three.js objects
 * Automatically detects format and routes to appropriate loader
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, classMeshes/sliceMeshes, availableClasses, metadata, format }
 */
export function loadMeshFromJSON(jsonData, scene) {
    console.log('[MeshLoader] Loading mesh from JSON...');

    // Detect format
    const format = detectMeshFormat(jsonData);
    console.log(`[MeshLoader] Detected format: ${format}`);

    if (format === 'VoxelSlices') {
        return loadVoxelSlicesFormat(jsonData, scene);
    } else {
        return loadBufferGeometryFormat(jsonData, scene);
    }
}

/**
 * Load mesh data from JSON asynchronously using Web Worker
 * Keeps UI responsive during heavy processing
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @param {Function} onProgress - Optional progress callback (progress, message)
 * @returns {Promise<Object>} - { meshGroup, classMeshes/sliceMeshes, availableClasses, metadata, format }
 */
export async function loadMeshFromJSONAsync(jsonData, scene, onProgress = null) {
    console.log('[MeshLoader] Loading mesh from JSON (async)...');

    // Detect format
    const format = detectMeshFormat(jsonData);
    console.log(`[MeshLoader] Detected format: ${format}`);

    if (format === 'VoxelSlices') {
        return loadVoxelSlicesFormatAsync(jsonData, scene, onProgress);
    } else {
        // BufferGeometry format is already fast, no async needed
        return loadBufferGeometryFormat(jsonData, scene);
    }
}

// Re-export terminateMeshWorker for cleanup
export { terminateMeshWorker };

/**
 * Load VoxelSlices format (slice-based meshes)
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, sliceMeshes, availableClasses, metadata, sliceMetadata, format }
 */
function loadVoxelSlicesFormat(jsonData, scene) {
    console.log('[MeshLoader] Loading VoxelSlices format...');

    // Validate required fields
    if (!jsonData.data || !jsonData.shape) {
        throw new Error('Invalid VoxelSlices JSON: missing data or shape');
    }

    // Performance warning for large datasets
    const voxelCount = jsonData.data.length;
    if (voxelCount > 500000) {
        console.warn(`[MeshLoader] Large dataset (${voxelCount} voxels). Processing may take a moment.`);
    }

    // Create slice-based meshes
    const result = createSliceBasedClassMeshes(jsonData, scene);

    console.log(`[MeshLoader] Loaded VoxelSlices: ${result.availableClasses.length} classes, ${jsonData.sliceCount} slices each`);

    return {
        meshGroup: result.meshGroup,
        sliceMeshes: result.sliceMeshes,
        availableClasses: result.availableClasses,
        metadata: jsonData.metadata || {},
        sliceMetadata: result.sliceMetadata,
        format: 'VoxelSlices'
    };
}

/**
 * Load VoxelSlices format asynchronously using Web Worker
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} - { meshGroup, sliceMeshes, availableClasses, metadata, sliceMetadata, format }
 */
async function loadVoxelSlicesFormatAsync(jsonData, scene, onProgress = null) {
    console.log('[MeshLoader] Loading VoxelSlices format (async)...');

    // Validate required fields
    if (!jsonData.data || !jsonData.shape) {
        throw new Error('Invalid VoxelSlices JSON: missing data or shape');
    }

    // Performance info for large datasets
    const voxelCount = jsonData.data.length;
    if (voxelCount > 500000) {
        console.log(`[MeshLoader] Large dataset (${voxelCount} voxels). Using Web Worker for processing.`);
    }

    // Create slice-based meshes using async worker
    const result = await createSliceBasedClassMeshesAsync(jsonData, scene, onProgress);

    console.log(`[MeshLoader] Loaded VoxelSlices: ${result.availableClasses.length} classes, ${jsonData.sliceCount} slices each`);

    return {
        meshGroup: result.meshGroup,
        sliceMeshes: result.sliceMeshes,
        availableClasses: result.availableClasses,
        metadata: jsonData.metadata || {},
        sliceMetadata: result.sliceMetadata,
        format: 'VoxelSlices'
    };
}

/**
 * Load BufferGeometry format (marching cubes meshes)
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, classMeshes, availableClasses, metadata, format }
 */
function loadBufferGeometryFormat(jsonData, scene) {
    console.log('[MeshLoader] Loading BufferGeometry format...');

    // Validate JSON structure
    if (!jsonData.meshes) {
        throw new Error('Invalid BufferGeometry JSON: missing "meshes" property');
    }

    // Create a group to hold all class meshes
    const meshGroup = new THREE.Group();
    const classMeshes = {};
    const availableClasses = [];

    // Process each class mesh
    for (const [classIdStr, meshData] of Object.entries(jsonData.meshes)) {
        const classId = parseInt(classIdStr, 10);

        try {
            const mesh = createMeshFromClassData(classId, meshData);
            if (mesh) {
                classMeshes[classId] = mesh;
                availableClasses.push(classId);
                meshGroup.add(mesh);
                console.log(`[MeshLoader] Created mesh for class ${classId}: ${meshData.statistics?.vertices || '?'} vertices, ${meshData.statistics?.faces || '?'} faces`);
            }
        } catch (error) {
            console.error(`[MeshLoader] Failed to create mesh for class ${classId}:`, error);
        }
    }

    // Sort available classes
    availableClasses.sort((a, b) => a - b);

    // Add mesh group to scene
    scene.add(meshGroup);

    console.log(`[MeshLoader] Loaded ${availableClasses.length} class meshes (BufferGeometry)`);

    return {
        meshGroup,
        classMeshes,
        availableClasses,
        metadata: jsonData.metadata || {},
        format: 'BufferGeometry'
    };
}

/**
 * Create a Three.js mesh from class data
 * @param {number} classId - The class ID
 * @param {Object} meshData - The mesh data for this class
 * @returns {THREE.Mesh} - The created mesh
 */
function createMeshFromClassData(classId, meshData) {
    if (!meshData.attributes || !meshData.attributes.position) {
        throw new Error('Missing position attribute');
    }

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();

    // Add position attribute
    const positionData = meshData.attributes.position;
    const positions = new Float32Array(positionData.array);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, positionData.itemSize || 3));

    // Add normal attribute if present
    if (meshData.attributes.normal) {
        const normalData = meshData.attributes.normal;
        const normals = new Float32Array(normalData.array);
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, normalData.itemSize || 3));
    } else {
        // Compute normals if not provided
        geometry.computeVertexNormals();
    }

    // Add index (faces) if present
    if (meshData.index && meshData.index.array) {
        const indices = new Uint32Array(meshData.index.array);
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }

    // Compute bounding box and sphere for proper rendering
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // Create material with class color
    const material = createClassMaterial(classId, {
        opacity: 0.8,
        doubleSide: true,
        flatShading: false,
        shininess: 30
    });

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
        classId: classId,
        statistics: meshData.statistics || {}
    };

    return mesh;
}

/**
 * Dispose of mesh resources
 * @param {Object} meshGroup - The mesh group to dispose
 * @param {Object} classMeshes - Map of class meshes
 */
export function disposeMeshes(meshGroup, classMeshes) {
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

    // Clear the classMeshes object
    for (const key in classMeshes) {
        delete classMeshes[key];
    }
}

/**
 * Update mesh visibility
 * @param {THREE.Mesh} mesh - The mesh to update
 * @param {boolean} visible - Visibility state
 */
export function setMeshVisibility(mesh, visible) {
    if (mesh) {
        mesh.visible = visible;
    }
}

/**
 * Update mesh opacity
 * @param {THREE.Mesh} mesh - The mesh to update
 * @param {number} opacity - Opacity value (0-1)
 */
export function setMeshOpacity(mesh, opacity) {
    if (mesh && mesh.material) {
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1;
        mesh.material.needsUpdate = true;
    }
}

/**
 * Get mesh bounding box
 * @param {THREE.Group} meshGroup - The mesh group
 * @returns {THREE.Box3} - Bounding box
 */
export function getMeshBoundingBox(meshGroup) {
    const box = new THREE.Box3();
    if (meshGroup) {
        box.setFromObject(meshGroup);
    }
    return box;
}

/**
 * Center mesh group at origin by translating all geometries
 * This ensures rotation happens around the center of the mesh
 * @param {THREE.Group} meshGroup - The mesh group to center
 */
export function centerMeshGroup(meshGroup) {
    if (!meshGroup) return;

    // Calculate the center of the entire mesh group
    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = box.getCenter(new THREE.Vector3());

    // Translate each child mesh's geometry to center the whole group
    meshGroup.traverse((child) => {
        if (child.isMesh && child.geometry) {
            child.geometry.translate(-center.x, -center.y, -center.z);
            // Update bounding box/sphere after translation
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
        }
    });

    // Keep meshGroup position at origin
    meshGroup.position.set(0, 0, 0);
}
