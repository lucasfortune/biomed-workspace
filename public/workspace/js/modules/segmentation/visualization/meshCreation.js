// meshCreation.js - 3D mesh creation and geometry processing
// This file handles loading data and creating 3D meshes from segmentation data

import { populateClassFilter, centerAndScaleGeometry, addQuadFace, getVoxelValue } from './utils.js';

/**
 * Load segmentation data from server
 * @param {string} visualizationPath - Path to the visualization data
 * @returns {Object} - The loaded segmentation data
 */
export async function loadSegmentationData(visualizationPath) {
 
    try {
        const response = await fetch(visualizationPath);
        
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Performance warning for very large datasets
        if (data.data.length > 500000) {
            console.warn('Large dataset detected. Rendering may take longer than usual.');
        } else if (data.data.length > 100000) {
            console.log('Medium-sized dataset. Good balance of detail and performance.');
        } else {
            console.log('Small dataset. Optimal for real-time interaction.');
        }
        
        return data;
        
    } catch (error) {
        console.error('Failed to load high-resolution segmentation data:', error);
        throw error;
    }
}

/**
 * Load and create textured planes for original data overlay
 * @param {string} inferenceId - The inference ID
 * @param {Object} segmentationData - The segmentation data for spatial reference
 * @returns {Object} - Object containing planes and metadata
 */
export async function loadAndCreateOriginalDataPlanes(inferenceId, segmentationData) {
    try {
        console.log('Loading downsampled original data for overlay...');

        // Fetch the downsampled TIFF from server
        const fetchUrl = `/results/${inferenceId}/original-data-web`;
        console.log('[OriginalData] Fetching from:', fetchUrl);

        const response = await fetch(fetchUrl);

        console.log('[OriginalData] Fetch response status:', response.status, response.statusText);

        if (!response.ok) {
            if (response.status === 404) {
                console.warn('[OriginalData] Data not available (404) - expected for imported models or missing data');
                return null;
            }
            console.error('[OriginalData] Fetch failed:', response.status, response.statusText);
            throw new Error(`Failed to load original data: ${response.status}`);
        }

        // Get the TIFF data as array buffer
        const arrayBuffer = await response.arrayBuffer();
        console.log('[OriginalData] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
        
        // Parse TIFF using tiff.js library (we'll need to add this)
        // For now, we'll use a simpler approach with a library loaded via CDN
        const tiffData = await parseTiffData(arrayBuffer);
        
        console.log(`Original data loaded: ${tiffData.slices.length} slices, ${tiffData.width}x${tiffData.height}`);
        
        // Create textured planes for each slice
        const planes = createTexturedPlanes(tiffData, segmentationData);
        
        return {
            planes: planes,
            planeGroup: planes.group,
            metadata: {
                numSlices: tiffData.slices.length,
                width: tiffData.width,
                height: tiffData.height
            }
        };
        
    } catch (error) {
        console.error('[OriginalData] Failed to load original data overlay:', error);
        console.error('[OriginalData] Error message:', error.message);
        console.error('[OriginalData] Error stack:', error.stack);
        return null;
    }
}

/**
 * Parse TIFF data from array buffer
 * Uses a lightweight TIFF parser
 */
async function parseTiffData(arrayBuffer) {
    // We'll use tiff.js library which we need to load
    // For multi-page TIFF support
    const Tiff = window.Tiff || window.UTIF;

    console.log('[OriginalData] Checking TIFF parser - window.UTIF:', !!window.UTIF, 'window.Tiff:', !!window.Tiff);

    if (!Tiff) {
        console.error('[OriginalData] TIFF parser library not loaded!');
        console.error('[OriginalData] window.UTIF:', window.UTIF);
        console.error('[OriginalData] window.Tiff:', window.Tiff);
        throw new Error('TIFF parser library not loaded');
    }

    console.log('[OriginalData] UTIF available, decoding TIFF...');

    // Decode TIFF
    const ifds = Tiff.decode(arrayBuffer);
    console.log('[OriginalData] Decoded', ifds.length, 'image(s) from TIFF');
    const slices = [];
    
    for (let i = 0; i < ifds.length; i++) {
        Tiff.decodeImage(arrayBuffer, ifds[i]);
        const rgba = Tiff.toRGBA8(ifds[i]);

        // Log slice data for validation
        console.log(`[OriginalData] Slice ${i}: ${rgba.length} RGBA values, ${rgba.byteLength} bytes, type: ${rgba.constructor.name}`);

        slices.push({
            data: rgba,  // ✅ Use typed array directly (was: new Uint8Array(rgba) which created empty array)
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
 */
function createTexturedPlanes(tiffData, segmentationData) {
    const group = new THREE.Group();
    const planes = [];
    
    // Get segmentation dimensions (in voxel space)
    const [segDepth, segHeight, segWidth] = segmentationData.shape;
    
    console.log(`Segmentation voxel dimensions: ${segWidth} x ${segHeight} x ${segDepth}`);
    console.log(`Original data texture dimensions: ${tiffData.width} x ${tiffData.height} x ${tiffData.slices.length}`);
    
    // CRITICAL: Use EXACT SAME scaling as segmentation meshes
    const maxOriginalDim = Math.max(segDepth, segHeight, segWidth);
    const targetMaxSize = 8; // Same as segmentation
    const scaleFactor = targetMaxSize / maxOriginalDim;
    
    console.log(`Scale factor: ${scaleFactor.toFixed(6)} (same as segmentation)`);
    
    // Calculate scaled dimensions (after applying scaleFactor)
    const scaledWidth = segWidth * scaleFactor;
    const scaledHeight = segHeight * scaleFactor;
    const scaledDepth = segDepth * scaleFactor;
    
    console.log(`Scaled dimensions: ${scaledWidth.toFixed(3)} x ${scaledHeight.toFixed(3)} x ${scaledDepth.toFixed(3)}`);
    
    // Calculate Z spacing in SCALED space
    const zSpacing = scaledDepth / (tiffData.slices.length - 1);
    
    console.log(`Z spacing between planes: ${zSpacing.toFixed(4)}`);
    
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
        
        // Create plane geometry with SCALED dimensions
        // This matches the scaled segmentation mesh size
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
        
        // Position in SCALED Z space
        // Centered from -scaledDepth/2 to +scaledDepth/2
        let zPosition = (index * zSpacing) - (scaledDepth / 2);

        // ANTI-Z-FIGHTING: Offset first and last planes slightly inward
        const epsilon = 0.01; // Small offset to prevent z-fighting with segmentation caps
        if (index === 0) {
            zPosition += epsilon; // Move first plane slightly inward (positive Z)
        } else if (index === tiffData.slices.length - 1) {
            zPosition -= epsilon; // Move last plane slightly inward (negative Z)
        }

        plane.position.set(0, 0, zPosition);
        
        // Store metadata
        plane.userData.sliceIndex = index;
        plane.userData.isOriginalDataPlane = true;
        
        planes.push(plane);
        group.add(plane);
    });
    
    console.log(`Created ${planes.length} textured planes`);
    console.log(`Plane size: ${scaledWidth.toFixed(3)} x ${scaledHeight.toFixed(3)}`);
    console.log(`Planes span from Z=${(-scaledDepth/2).toFixed(3)} to Z=${(scaledDepth/2).toFixed(3)}`);
    
    return {
        planes: planes,
        group: group
    };
}

/**
 * Create separate 3D meshes for each class in the segmentation data
 * @param {Object} data - The segmentation data
 * @param {Object} scene - Three.js scene to add meshes to
 * @returns {Object} - Object containing meshes and related data
 */
export function createSeparateClassMeshes(data, scene) {
    
    // Extract basic information
    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    
    
    // Set class information
    const availableClasses = [...new Set(voxelData.map(v => v.value))].sort();
    const visibleClasses = [...availableClasses];
    
    // Convert sparse voxel data to dense 3D volume
    const volume = new Uint8Array(depth * height * width);
    voxelData.forEach(voxel => {
        const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
        volume[index] = voxel.value;
    });
    
    // Class colors
    const classColors = {
        1: [0.2, 0.9, 0.2], // Green
        2: [0.9, 0.2, 0.2], // Red
        3: [0.2, 0.2, 0.9], // Blue
        4: [0.9, 0.9, 0.2], // Yellow
        5: [0.9, 0.2, 0.9]  // Magenta
    };
    
    // Create a group to hold all class meshes
    const meshGroup = new THREE.Group();
    const classMeshes = {}; // Reset the meshes object
    
    // Calculate target scale to make mesh a reasonable size (around 10 units max dimension)
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8; // Target maximum dimension
    const scaleFactor = targetMaxSize / maxOriginalDim;
    
    // Create separate mesh for each class
    availableClasses.forEach(classValue => {
        
        const classVertices = [];
        const classNormals = [];
        
        // Extract surface vertices for this class only
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    
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
                        
                        // If neighbor is different, this face is on the surface
                        if (neighborValue !== classValue) {
                            addQuadFace(classVertices, classNormals, x, y, z, face);
                        }
                    });
                }
            }
        }
        
        if (classVertices.length > 0) {
            // Create geometry for this class
            const geometry = new THREE.BufferGeometry();
            
            // Convert to Float32Array 
            const vertices = new Float32Array(classVertices);
            const normals = new Float32Array(classNormals);
            
            // Center geometry around origin and scale it
            centerAndScaleGeometry(vertices, shape, scaleFactor);
            
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geometry.computeBoundingBox();
            
            // Create material with class-specific color
            const color = classColors[classValue] || [0.6, 0.6, 0.6];
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(color[0], color[1], color[2]),
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            
            // Create mesh for this class
            const classMesh = new THREE.Mesh(geometry, material);
            classMesh.userData = {
                classValue: classValue,
                originalOpacity: 0.8
            };
            
            // Store mesh reference
            classMeshes[classValue] = classMesh;
            
            // Add to group
            meshGroup.add(classMesh);
            
        } else {
            console.log(`Class ${classValue}: No vertices found`);
        }
    });
    
    // Add the group to the scene
    scene.add(meshGroup);

    
    // Populate class filter dropdown
    populateClassFilter(availableClasses);
    
    return {
        meshGroup,
        classMeshes,
        availableClasses,
        visibleClasses
    };
}

/**
 * Create slice-based meshes for each class - NEW SLICE SYSTEM
 * @param {Object} data - The segmentation data
 * @param {Object} scene - Three.js scene to add meshes to
 * @param {number} sliceCount - Number of slices to create (default: 20)
 * @param {string} sliceDirection - Direction to slice ('z', 'x', 'y')
 * @returns {Object} - Object containing slice meshes and metadata
 */
export function createSliceBasedClassMeshes(data, scene, sliceCount = 20, sliceDirection = 'z') {
    
    // Extract basic information
    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    
    // Set class information
    const availableClasses = [...new Set(voxelData.map(v => v.value))].sort();
    const visibleClasses = [...availableClasses];
    
    // Convert sparse voxel data to dense 3D volume
    const volume = new Uint8Array(depth * height * width);
    voxelData.forEach(voxel => {
        const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
        volume[index] = voxel.value;
    });
    
    // Class colors (same as original)
    const classColors = {
        1: [0.2, 0.9, 0.2], // Green
        2: [0.9, 0.2, 0.2], // Red
        3: [0.2, 0.2, 0.9], // Blue
        4: [0.9, 0.9, 0.2], // Yellow
        5: [0.9, 0.2, 0.9]  // Magenta
    };
    
    // Calculate scaling (same as original)
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;
    
    // Determine slice parameters based on direction
    let sliceDimension, sliceSize;
    switch(sliceDirection) {
        case 'x': 
            sliceDimension = width;
            break;
        case 'y': 
            sliceDimension = height;
            break;
        case 'z':
        default:
            sliceDimension = depth;
            break;
    }
    
    // Create slice-based mesh structure: sliceMeshes[classValue][sliceIndex] = mesh
    const sliceMeshes = {};
    const meshGroup = new THREE.Group();
    
    // Create slices for each class
    availableClasses.forEach(classValue => {
        sliceMeshes[classValue] = [];
        
        // Create each slice for this class
        for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
            const sliceMesh = createSingleSlice(
                volume, shape, classValue, sliceIndex, sliceCount, 
                sliceDirection, scaleFactor, classColors[classValue] || [0.6, 0.6, 0.6]
            );
            
            if (sliceMesh) {
                sliceMesh.userData = {
                    classValue: classValue,
                    sliceIndex: sliceIndex,
                    originalOpacity: 0.8
                };
                
                sliceMeshes[classValue][sliceIndex] = sliceMesh;
                meshGroup.add(sliceMesh);
            }
        }
        
    });
    
    // Add the group to the scene
    scene.add(meshGroup);

    // Populate class filter dropdown
    populateClassFilter(availableClasses);
    
    return {
        meshGroup,
        sliceMeshes,           // NEW: slice-based structure
        availableClasses,
        visibleClasses,
        sliceMetadata: {       // NEW: metadata about slices
            sliceCount,
            sliceDirection,
            sliceSize,
            visibleSliceRange: [0, sliceCount - 1]
        }
    };
}

/**
 * Create a single slice mesh for a specific class - HELPER FUNCTION
 * @param {Uint8Array} volume - Dense volume data
 * @param {Array} shape - [depth, height, width]
 * @param {number} classValue - Class number
 * @param {number} sliceIndex - Which slice (0 to sliceCount-1)
 * @param {number} sliceCount - Total number of slices
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @param {number} scaleFactor - Scaling factor for vertices
 * @param {Array} color - RGB color array
 * @returns {THREE.Mesh} - The slice mesh
 */
function createSingleSlice(volume, shape, classValue, sliceIndex, sliceCount, sliceDirection, scaleFactor, color, generateBoundaryFaces = false) {
    const [depth, height, width] = shape;
    const classVertices = [];
    const classNormals = [];
    
    // Calculate slice boundaries
    let sliceStart, sliceEnd;
    switch(sliceDirection) {
        case 'x':
            sliceStart = Math.floor((sliceIndex * width) / sliceCount);
            sliceEnd = Math.floor(((sliceIndex + 1) * width) / sliceCount);
            break;
        case 'y':
            sliceStart = Math.floor((sliceIndex * height) / sliceCount);
            sliceEnd = Math.floor(((sliceIndex + 1) * height) / sliceCount);
            break;
        case 'z':
        default:
            sliceStart = Math.floor((sliceIndex * depth) / sliceCount);
            sliceEnd = Math.floor(((sliceIndex + 1) * depth) / sliceCount);
            break;
    }
    
    // Extract surface vertices for this class and slice only
    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                
                // Check if this voxel is in our slice range
                let inSlice = false;
                switch(sliceDirection) {
                    case 'x': inSlice = (x >= sliceStart && x < sliceEnd); break;
                    case 'y': inSlice = (y >= sliceStart && y < sliceEnd); break;
                    case 'z': inSlice = (z >= sliceStart && z < sliceEnd); break;
                }
                
                if (!inSlice) continue;
                
                const currentValue = getVoxelValue(volume, x, y, z, width, height, depth);
                if (currentValue !== classValue) continue;
                
                // Check each face of the voxel (same logic as original)
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
                    
                    // If neighbor is different, this face is on the surface
                    if (neighborValue !== classValue || 
                        (generateBoundaryFaces && isAtSliceBoundary(x, y, z, face, sliceStart, sliceEnd, sliceDirection))) {
                        addQuadFace(classVertices, classNormals, x, y, z, face);
                    }
                });
            }
        }
    }
    
    if (classVertices.length === 0) {
        return null; // No vertices in this slice
    }
    
    // Create geometry for this slice
    const geometry = new THREE.BufferGeometry();
    
    // Convert to Float32Array 
    const vertices = new Float32Array(classVertices);
    const normals = new Float32Array(classNormals);
    
    // Center and scale geometry (same as original)
    centerAndScaleGeometry(vertices, shape, scaleFactor);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingBox();
    
    // Create material with class-specific color
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color[0], color[1], color[2]),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    // Create mesh for this slice
    const sliceMesh = new THREE.Mesh(geometry, material);
    
    return sliceMesh;
}

/**
 * Check if a voxel face is at a slice boundary and should generate a cap surface
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate  
 * @param {number} z - Z coordinate
 * @param {Object} face - Face object with direction info
 * @param {number} sliceStart - Start of current slice
 * @param {number} sliceEnd - End of current slice
 * @param {string} sliceDirection - 'x', 'y', or 'z'
 * @returns {boolean} - True if this face is at a slice boundary
 */
function isAtSliceBoundary(x, y, z, face, sliceStart, sliceEnd, sliceDirection) {
    switch(sliceDirection) {
        case 'x':
            // Check if we're at the left or right boundary of the slice
            if (face.name === 'left' && x === sliceStart) return true;
            if (face.name === 'right' && x === sliceEnd - 1) return true;
            break;
        case 'y':
            // Check if we're at the bottom or top boundary of the slice  
            if (face.name === 'bottom' && y === sliceStart) return true;
            if (face.name === 'top' && y === sliceEnd - 1) return true;
            break;
        case 'z':
        default:
            // Check if we're at the back or front boundary of the slice
            if (face.name === 'back' && z === sliceStart) return true;
            if (face.name === 'front' && z === sliceEnd - 1) return true;
            break;
    }
    return false;
}