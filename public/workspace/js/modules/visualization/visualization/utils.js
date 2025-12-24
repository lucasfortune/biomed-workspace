/**
 * utils.js - Shared utility functions
 *
 * This file contains helper functions used across visualization modules.
 */

/**
 * Class color definitions - matches the colors used in mesh generation
 */
export const CLASS_COLORS = {
    1: [0.2, 0.9, 0.2],   // Green
    2: [0.9, 0.2, 0.2],   // Red
    3: [0.2, 0.2, 0.9],   // Blue
    4: [0.9, 0.9, 0.2],   // Yellow
    5: [0.9, 0.2, 0.9],   // Magenta
    6: [0.2, 0.9, 0.9],   // Cyan
    7: [0.9, 0.5, 0.2],   // Orange
    8: [0.5, 0.2, 0.9]    // Purple
};

/**
 * Get the exact color used for a class in the 3D model
 * @param {number} classValue - The class number
 * @returns {string} - CSS color value that matches the 3D model
 */
export function getClassColor(classValue) {
    // Get the RGB array for this class, or default gray
    const colorArray = CLASS_COLORS[classValue] || [0.6, 0.6, 0.6];

    // Convert from 0-1 range to 0-255 range and return CSS rgb string
    const r = Math.round(colorArray[0] * 255);
    const g = Math.round(colorArray[1] * 255);
    const b = Math.round(colorArray[2] * 255);

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get class color as THREE.js Color
 * @param {number} classValue - The class number
 * @returns {THREE.Color} - Three.js Color object
 */
export function getClassColorThree(classValue) {
    const colorArray = CLASS_COLORS[classValue] || [0.6, 0.6, 0.6];
    return new THREE.Color(colorArray[0], colorArray[1], colorArray[2]);
}

/**
 * Get class color as hex number
 * @param {number} classValue - The class number
 * @returns {number} - Hex color number
 */
export function getClassColorHex(classValue) {
    const colorArray = CLASS_COLORS[classValue] || [0.6, 0.6, 0.6];
    const r = Math.round(colorArray[0] * 255);
    const g = Math.round(colorArray[1] * 255);
    const b = Math.round(colorArray[2] * 255);
    return (r << 16) | (g << 8) | b;
}

/**
 * Helper function to create a fallback mesh when no data is available
 * @param {Object} scene - Three.js scene object
 * @returns {Object} - Returns objects needed for compatibility
 */
export function createFallbackMesh(scene) {
    console.log('[Visualization] Creating fallback placeholder mesh');

    // Create a simple placeholder cube
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshPhongMaterial({
        color: 0x4CAF50,  // Green for placeholder
        transparent: true,
        opacity: 0.8
    });

    const placeholderMesh = new THREE.Mesh(geometry, material);
    const meshGroup = new THREE.Group();
    meshGroup.add(placeholderMesh);
    scene.add(meshGroup);

    return {
        availableClasses: [1],
        classMeshes: { 1: placeholderMesh },
        meshGroup
    };
}

/**
 * Helper function to create an error mesh when something goes wrong
 * @param {Object} scene - Three.js scene object
 * @param {string} errorMessage - Error message to log
 * @returns {Object} - Returns objects needed for compatibility
 */
export function createErrorFallbackMesh(scene, errorMessage = 'Unknown error') {
    console.error('[Visualization] Creating error fallback mesh:', errorMessage);

    // Create a red cube to indicate error
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshPhongMaterial({
        color: 0xff0000,  // Red for error
        transparent: true,
        opacity: 0.8
    });

    const errorMesh = new THREE.Mesh(geometry, material);
    const meshGroup = new THREE.Group();
    meshGroup.add(errorMesh);
    scene.add(meshGroup);

    return {
        availableClasses: [1],
        classMeshes: { 1: errorMesh },
        meshGroup,
        error: errorMessage
    };
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} - Formatted string
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} - Formatted string
 */
export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Map a value from one range to another
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} - Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/**
 * Debounce a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Create a THREE.js material for a class
 * @param {number} classValue - The class number
 * @param {Object} options - Material options
 * @returns {THREE.MeshPhongMaterial} - Material for the class
 */
export function createClassMaterial(classValue, options = {}) {
    const color = getClassColorHex(classValue);

    return new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: options.opacity !== undefined ? options.opacity : 0.8,
        side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        flatShading: options.flatShading || false,
        shininess: options.shininess || 30
    });
}

// ============================================
// VOXEL HELPER FUNCTIONS (for slice-based mesh creation)
// ============================================

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
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;
    const index = z * (height * width) + y * width + x;
    return volume[index] || 0;
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
 * Center and scale geometry to make it a reasonable size
 * @param {Float32Array} vertices - Vertex array to modify
 * @param {Array} shape - Original data shape [depth, height, width]
 * @param {number} scaleFactor - Scale factor to apply
 */
export function centerAndScaleGeometry(vertices, shape, scaleFactor) {
    const [depth, height, width] = shape;

    // Calculate center offset (before scaling)
    const centerX = width / 2;
    const centerY = height / 2;
    const centerZ = depth / 2;

    // Apply centering AND scaling to all vertices
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] = (vertices[i] - centerX) * scaleFactor;         // X
        vertices[i + 1] = (vertices[i + 1] - centerY) * scaleFactor; // Y
        vertices[i + 2] = (vertices[i + 2] - centerZ) * scaleFactor; // Z
    }
}
