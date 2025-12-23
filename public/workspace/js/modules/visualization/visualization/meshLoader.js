/**
 * meshLoader.js - Load and parse mesh JSON data
 *
 * Parses the BufferGeometry JSON format from generate_mesh.py
 * and creates Three.js mesh objects for visualization.
 */

import { getClassColorHex, createClassMaterial } from './utils.js';

/**
 * Load mesh data from JSON and create Three.js objects
 * @param {Object} jsonData - Parsed JSON mesh data
 * @param {THREE.Scene} scene - Three.js scene to add meshes to
 * @returns {Object} - { meshGroup, classMeshes, availableClasses, metadata }
 */
export function loadMeshFromJSON(jsonData, scene) {
    console.log('[MeshLoader] Loading mesh from JSON...');

    // Validate JSON structure
    if (!jsonData || !jsonData.meshes) {
        throw new Error('Invalid mesh JSON: missing "meshes" property');
    }

    if (!jsonData.metadata) {
        console.warn('[MeshLoader] No metadata in mesh JSON');
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

    console.log(`[MeshLoader] Loaded ${availableClasses.length} class meshes`);

    return {
        meshGroup,
        classMeshes,
        availableClasses,
        metadata: jsonData.metadata || {}
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
 * Center mesh group at origin
 * @param {THREE.Group} meshGroup - The mesh group to center
 */
export function centerMeshGroup(meshGroup) {
    if (!meshGroup) return;

    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = box.getCenter(new THREE.Vector3());

    meshGroup.position.sub(center);
}
