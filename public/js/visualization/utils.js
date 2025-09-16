// utils.js - Shared utility functions
// This file contains helper functions used across multiple modules

/**
 * Get the exact color used for a class in the 3D model
 * This matches the classColors object used in createSeparateClassMeshes()
 * @param {number} classValue - The class number
 * @returns {string} - CSS color value that matches the 3D model
 */
export function getClassColor(classValue) {
    // These must match the classColors object used for 3D mesh materials
    const classColors = {
        1: [0.2, 0.9, 0.2], // Green
        2: [0.9, 0.2, 0.2], // Red
        3: [0.2, 0.2, 0.9], // Blue
        4: [0.9, 0.9, 0.2], // Yellow
        5: [0.9, 0.2, 0.9]  // Magenta
    };
    
    // Get the RGB array for this class, or default gray
    const colorArray = classColors[classValue] || [0.6, 0.6, 0.6];
    
    // Convert from 0-1 range to 0-255 range and return CSS rgb string
    const r = Math.round(colorArray[0] * 255);
    const g = Math.round(colorArray[1] * 255);
    const b = Math.round(colorArray[2] * 255);
    
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Function to populate class filter dropdown
 * @param {Array} availableClasses - Array of available class numbers
 */
export function populateClassFilter(availableClasses) {
    const classFilter = document.getElementById('classFilter');
    if (!classFilter) return;
    
    // Clear existing options except "All Classes"
    classFilter.innerHTML = '<option value="all">All Classes</option>';
    
    // Add option for each class
    availableClasses.forEach(classValue => {
        const option = document.createElement('option');
        option.value = classValue;
        option.textContent = `Class ${classValue}`;
        classFilter.appendChild(option);
    });
    
    console.log('Class filter populated with', availableClasses.length, 'classes');
}

/**
 * Helper function to create a fallback mesh when no data is available
 * @param {Object} scene - Three.js scene object
 * @returns {Object} - Returns objects needed for compatibility
 */
export function createFallbackMesh(scene) {
    console.log('Creating fallback placeholder mesh');
    
    // Create a simple placeholder cube
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0x4CAF50,  // Green for placeholder
        transparent: true, 
        opacity: 0.8 
    });
    
    const placeholderMesh = new THREE.Mesh(geometry, material);
    scene.add(placeholderMesh);
    
    // Create compatibility objects
    const availableClasses = [1];
    const visibleClasses = [1];
    const classMeshes = { 1: placeholderMesh };
    const meshGroup = new THREE.Group();
    meshGroup.add(placeholderMesh);
    
    console.log('Placeholder mesh created');
    
    return {
        availableClasses,
        visibleClasses,
        classMeshes,
        meshGroup,
        segmentationMesh: meshGroup
    };
}

/**
 * Helper function to create an error mesh when something goes wrong
 * @param {Object} scene - Three.js scene object
 * @returns {Object} - Returns objects needed for compatibility
 */
export function createErrorFallbackMesh(scene) {
    console.log('Creating error fallback mesh');
    
    // Create a red cube to indicate error
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xff0000,  // Red for error
        transparent: true, 
        opacity: 0.8 
    });
    
    const errorMesh = new THREE.Mesh(geometry, material);
    scene.add(errorMesh);
    
    // Create compatibility objects
    const availableClasses = [1];
    const visibleClasses = [1];
    const classMeshes = { 1: errorMesh };
    const meshGroup = new THREE.Group();
    meshGroup.add(errorMesh);
    
    console.log('Error fallback mesh created');
    
    return {
        availableClasses,
        visibleClasses,
        classMeshes,
        meshGroup,
        segmentationMesh: meshGroup
    };
}

/**
 * Center and scale geometry to make it a reasonable size
 * @param {Float32Array} vertices - Vertex array to modify
 * @param {Array} shape - Original data shape [depth, height, width]
 * @param {number} scaleFactor - Scale factor to apply
 */
export function centerAndScaleGeometry(vertices, shape, scaleFactor) {
    const [depth, height, width] = shape;
    
    console.log(`Centering and scaling geometry with factor ${scaleFactor.toFixed(4)}`);
    
    // Calculate center offset (before scaling)
    const centerX = width / 2;
    const centerY = height / 2;
    const centerZ = depth / 2;
    
    // Apply centering AND scaling to all vertices
    for (let i = 0; i < vertices.length; i += 3) {
        // Center first, then scale
        vertices[i] = (vertices[i] - centerX) * scaleFactor;         // X
        vertices[i + 1] = (vertices[i + 1] - centerY) * scaleFactor; // Y
        vertices[i + 2] = (vertices[i + 2] - centerZ) * scaleFactor; // Z
    }
    
    console.log(`Geometry centered at origin and scaled by ${scaleFactor.toFixed(4)}`);
}

/**
 * Add a quad face to vertex and normal arrays
 * @param {Array} vertices - Vertex array to append to
 * @param {Array} normals - Normal array to append to  
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @param {Object} face - Face object with direction info
 */
export function addQuadFace(vertices, normals, x, y, z, face) {
    const faceData = {
        'right': {
            verts: [
                [x+1, y, z], [x+1, y+1, z], [x+1, y+1, z+1],
                [x+1, y, z], [x+1, y+1, z+1], [x+1, y, z+1]
            ],
            normal: [1, 0, 0]
        },
        'left': {
            verts: [
                [x, y, z+1], [x, y+1, z+1], [x, y+1, z],
                [x, y, z+1], [x, y+1, z], [x, y, z]
            ],
            normal: [-1, 0, 0]
        },
        'top': {
            verts: [
                [x, y+1, z], [x+1, y+1, z], [x+1, y+1, z+1],
                [x, y+1, z], [x+1, y+1, z+1], [x, y+1, z+1]
            ],
            normal: [0, 1, 0]
        },
        'bottom': {
            verts: [
                [x, y, z+1], [x+1, y, z+1], [x+1, y, z],
                [x, y, z+1], [x+1, y, z], [x, y, z]
            ],
            normal: [0, -1, 0]
        },
        'front': {
            verts: [
                [x, y, z+1], [x, y+1, z+1], [x+1, y+1, z+1],
                [x, y, z+1], [x+1, y+1, z+1], [x+1, y, z+1]
            ],
            normal: [0, 0, 1]
        },
        'back': {
            verts: [
                [x+1, y, z], [x+1, y+1, z], [x, y+1, z],
                [x+1, y, z], [x, y+1, z], [x, y, z]
            ],
            normal: [0, 0, -1]
        }
    };
    
    const data = faceData[face.name];
    data.verts.forEach(vertex => {
        vertices.push(vertex[0], vertex[1], vertex[2]);
        normals.push(data.normal[0], data.normal[1], data.normal[2]);
    });
}

/**
 * Get voxel value from volume array with bounds checking
 * @param {Uint8Array} volume - Volume data array
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate  
 * @param {number} z - Z coordinate
 * @param {number} width - Volume width
 * @param {number} height - Volume height
 * @param {number} depth - Volume depth
 * @returns {number} - Voxel value or 0 if out of bounds
 */
export function getVoxelValue(volume, x, y, z, width, height, depth) {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;  // Outside bounds = background
    const index = z * (height * width) + y * width + x;
    return volume[index] || 0;
}