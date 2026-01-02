/**
 * meshWorker.js - Web Worker for heavy mesh computation
 *
 * Offloads the expensive voxel processing to a background thread,
 * keeping the UI responsive during mesh generation.
 */

// Utility functions (duplicated here since workers can't import from main thread)

/**
 * Get voxel value at position, returning 0 for out-of-bounds
 */
function getVoxelValue(volume, x, y, z, width, height, depth) {
    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) {
        return 0; // Out of bounds = background
    }
    return volume[z * (height * width) + y * width + x];
}

/**
 * Add a quad face (2 triangles = 6 vertices) to the vertex/normal arrays
 */
function addQuadFace(vertices, normals, x, y, z, face) {
    // Define quad corners based on face direction
    let v0, v1, v2, v3;
    let normal;

    switch (face.name) {
        case 'right': // +X face
            v0 = [x + 1, y, z];
            v1 = [x + 1, y + 1, z];
            v2 = [x + 1, y + 1, z + 1];
            v3 = [x + 1, y, z + 1];
            normal = [1, 0, 0];
            break;
        case 'left': // -X face
            v0 = [x, y, z + 1];
            v1 = [x, y + 1, z + 1];
            v2 = [x, y + 1, z];
            v3 = [x, y, z];
            normal = [-1, 0, 0];
            break;
        case 'top': // +Y face
            v0 = [x, y + 1, z];
            v1 = [x, y + 1, z + 1];
            v2 = [x + 1, y + 1, z + 1];
            v3 = [x + 1, y + 1, z];
            normal = [0, 1, 0];
            break;
        case 'bottom': // -Y face
            v0 = [x, y, z + 1];
            v1 = [x, y, z];
            v2 = [x + 1, y, z];
            v3 = [x + 1, y, z + 1];
            normal = [0, -1, 0];
            break;
        case 'front': // +Z face
            v0 = [x, y, z + 1];
            v1 = [x + 1, y, z + 1];
            v2 = [x + 1, y + 1, z + 1];
            v3 = [x, y + 1, z + 1];
            normal = [0, 0, 1];
            break;
        case 'back': // -Z face
            v0 = [x + 1, y, z];
            v1 = [x, y, z];
            v2 = [x, y + 1, z];
            v3 = [x + 1, y + 1, z];
            normal = [0, 0, -1];
            break;
    }

    // Triangle 1: v0, v1, v2
    vertices.push(...v0, ...v1, ...v2);
    normals.push(...normal, ...normal, ...normal);

    // Triangle 2: v0, v2, v3
    vertices.push(...v0, ...v2, ...v3);
    normals.push(...normal, ...normal, ...normal);
}

/**
 * Process a single slice for all classes
 */
function processSlice(volume, shape, availableClasses, classSet, sliceIndex, sliceBoundaries, sliceDirection) {
    const [depth, height, width] = shape;

    // Initialize vertex/normal arrays for each class
    const classData = {};
    for (const classValue of availableClasses) {
        classData[classValue] = { vertices: [], normals: [] };
    }

    // Get slice boundaries
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

    // Pre-define faces array
    const faces = [
        { dx: 1, dy: 0, dz: 0, name: 'right' },
        { dx: -1, dy: 0, dz: 0, name: 'left' },
        { dx: 0, dy: 1, dz: 0, name: 'top' },
        { dx: 0, dy: -1, dz: 0, name: 'bottom' },
        { dx: 0, dy: 0, dz: 1, name: 'front' },
        { dx: 0, dy: 0, dz: -1, name: 'back' }
    ];

    // Single pass through the slice region
    for (let z = zStart; z < zEnd; z++) {
        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                const currentValue = getVoxelValue(volume, x, y, z, width, height, depth);

                if (!classSet.has(currentValue)) continue;

                const data = classData[currentValue];

                for (let i = 0; i < 6; i++) {
                    const face = faces[i];
                    const neighborValue = getVoxelValue(volume,
                        x + face.dx, y + face.dy, z + face.dz,
                        width, height, depth);

                    if (neighborValue !== currentValue) {
                        addQuadFace(data.vertices, data.normals, x, y, z, face);
                    }
                }
            }
        }
    }

    // Convert arrays to Float32Arrays for transfer
    const result = {};
    for (const classValue of availableClasses) {
        const data = classData[classValue];
        if (data.vertices.length > 0) {
            result[classValue] = {
                vertices: new Float32Array(data.vertices),
                normals: new Float32Array(data.normals)
            };
        }
    }

    return result;
}

/**
 * Main message handler
 */
self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'processVoxelData') {
        const { voxelData, shape, availableClasses, sliceCount, sliceDirection, sliceBoundaries } = data;
        const [depth, height, width] = shape;

        const startTime = performance.now();

        // Convert sparse voxel data to dense volume
        const volume = new Uint8Array(depth * height * width);
        for (let i = 0; i < voxelData.length; i++) {
            const voxel = voxelData[i];
            const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
            volume[index] = voxel.value;
        }

        const sparseTime = performance.now() - startTime;
        self.postMessage({ type: 'progress', message: `Sparse-to-dense: ${sparseTime.toFixed(1)}ms` });

        // Create class set for O(1) lookup
        const classSet = new Set(availableClasses);

        // Process all slices
        const allSliceData = {};
        for (const classValue of availableClasses) {
            allSliceData[classValue] = new Array(sliceCount).fill(null);
        }

        const meshStartTime = performance.now();

        for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
            const sliceData = processSlice(
                volume, shape, availableClasses, classSet,
                sliceIndex, sliceBoundaries, sliceDirection
            );

            // Store results per class
            for (const classValue of availableClasses) {
                if (sliceData[classValue]) {
                    allSliceData[classValue][sliceIndex] = sliceData[classValue];
                }
            }

            // Report progress every 5 slices
            if (sliceIndex % 5 === 0) {
                const progress = Math.round((sliceIndex / sliceCount) * 100);
                self.postMessage({ type: 'progress', progress, sliceIndex, sliceCount });
            }
        }

        const meshTime = performance.now() - meshStartTime;
        const totalTime = performance.now() - startTime;

        // Prepare transferable arrays
        const transferables = [];
        for (const classValue of availableClasses) {
            for (let i = 0; i < sliceCount; i++) {
                const sliceData = allSliceData[classValue][i];
                if (sliceData) {
                    transferables.push(sliceData.vertices.buffer);
                    transferables.push(sliceData.normals.buffer);
                }
            }
        }

        self.postMessage({
            type: 'complete',
            data: {
                sliceData: allSliceData,
                timing: {
                    sparse: sparseTime,
                    mesh: meshTime,
                    total: totalTime
                }
            }
        }, transferables);
    }
};
