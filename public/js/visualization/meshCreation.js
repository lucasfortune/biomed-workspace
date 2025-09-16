// meshCreation.js - 3D mesh creation and geometry processing
// This file handles loading data and creating 3D meshes from segmentation data

import { populateClassFilter, centerAndScaleGeometry, addQuadFace, getVoxelValue } from './utils.js';

/**
 * Load segmentation data from server
 * @param {string} visualizationPath - Path to the visualization data
 * @returns {Object} - The loaded segmentation data
 */
export async function loadSegmentationData(visualizationPath) {
    console.log('=== LOAD HIGH-RESOLUTION SEGMENTATION DATA ===');
    console.log('Loading from path:', visualizationPath);
    
    try {
        const response = await fetch(visualizationPath);
        
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Enhanced logging for high-resolution data
        console.log('High-resolution data loaded successfully:');
        console.log('  Format version:', data.version || 'legacy');
        console.log('  Final shape:', data.shape);
        console.log('  Original shape:', data.original_shape);
        console.log('  Downsample factor:', data.downsample_factor + 'x');
        console.log('  Total voxels to render:', data.data.length.toLocaleString());
        
        if (data.statistics) {
            console.log('  Data statistics:');
            console.log('    Classes found:', data.statistics.classes);
            console.log('    Class distribution:', data.statistics.class_counts);
            console.log('    Data density:', (data.statistics.density * 100).toFixed(1) + '%');
            console.log('    Original non-zero voxels:', data.statistics.original_non_zero_voxels.toLocaleString());
        }
        
        // Estimate memory usage
        const estimatedMemoryMB = (data.data.length * 24 * 4) / (1024 * 1024); // 24 vertices * 4 bytes per float
        console.log('  Estimated GPU memory usage:', estimatedMemoryMB.toFixed(1) + ' MB');
        
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
 * Create separate 3D meshes for each class in the segmentation data
 * @param {Object} data - The segmentation data
 * @param {Object} scene - Three.js scene to add meshes to
 * @returns {Object} - Object containing meshes and related data
 */
export function createSeparateClassMeshes(data, scene) {
    console.log('=== CREATING SEPARATE CLASS MESHES WITH SCALING ===');
    const startTime = performance.now();
    
    // Extract basic information
    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    
    console.log(`Processing ${voxelData.length} voxels in ${depth}x${height}x${width} volume`);
    
    // Set class information
    const availableClasses = [...new Set(voxelData.map(v => v.value))].sort();
    const visibleClasses = [...availableClasses];
    console.log('Available classes:', availableClasses);
    
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
    
    console.log(`Original dimensions: ${width}x${height}x${depth}`);
    console.log(`Scale factor: ${scaleFactor.toFixed(4)} (target max size: ${targetMaxSize})`);
    
    // Create separate mesh for each class
    availableClasses.forEach(classValue => {
        console.log(`Creating mesh for class ${classValue}...`);
        
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
            
            console.log(`Class ${classValue}: ${vertices.length / 3} vertices created`);
            
            // Debug bounding box for this class
            const bbox = geometry.boundingBox;
            console.log(`  Class ${classValue} bounds: size(${(bbox.max.x - bbox.min.x).toFixed(2)}, ${(bbox.max.y - bbox.min.y).toFixed(2)}, ${(bbox.max.z - bbox.min.z).toFixed(2)})`);
            
        } else {
            console.log(`Class ${classValue}: No vertices found`);
        }
    });
    
    // Add the group to the scene
    scene.add(meshGroup);
    
    const endTime = performance.now();
    console.log(`Mesh creation completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Created ${Object.keys(classMeshes).length} separate class meshes`);
    
    // Calculate and log final group bounds
    const groupBox = new THREE.Box3().setFromObject(meshGroup);
    const groupSize = groupBox.getSize(new THREE.Vector3());
    const groupCenter = groupBox.getCenter(new THREE.Vector3());
    
    console.log(`Final group center: (${groupCenter.x.toFixed(3)}, ${groupCenter.y.toFixed(3)}, ${groupCenter.z.toFixed(3)})`);
    console.log(`Final group size: (${groupSize.x.toFixed(3)}, ${groupSize.y.toFixed(3)}, ${groupSize.z.toFixed(3)})`);
    
    // Populate class filter dropdown
    populateClassFilter(availableClasses);
    
    return {
        meshGroup,
        classMeshes,
        availableClasses,
        visibleClasses
    };
}