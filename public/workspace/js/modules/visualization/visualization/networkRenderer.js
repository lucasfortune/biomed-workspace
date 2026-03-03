/**
 * networkRenderer.js - Filament network 3D rendering
 *
 * Creates THREE.LineSegments from network_data.json for filament network
 * visualization. Uses per-z-bucket LineSegments for z-range slider control.
 * Direction coloring uses DTI convention: |dx|→R, |dy|→G, |dz|→B.
 */

import { centerAndScaleGeometry } from './utils.js';

/**
 * Create filament network visualization from network data.
 * Creates one THREE.LineSegments per z-bucket, added to meshGroup.
 *
 * @param {Object} networkData - Parsed network_data.json
 * @param {THREE.Group} meshGroup - Parent group (rotates with mesh)
 * @param {Array} shape - Volume shape [depth, height, width] (optional override)
 * @returns {Object} { networkGroup, sliceSegments, metadata }
 */
export function createNetworkVisualization(networkData, meshGroup, shape = null) {
    const meta = networkData.metadata;
    const dataShape = shape || meta.shape;
    const [depth, height, width] = dataShape;
    const sliceCount = meta.sliceCount || depth;

    console.log(`[NetworkRenderer] Creating network: ${meta.nodeCount} nodes, ${meta.edgeCount} edges, ${sliceCount} z-buckets`);

    // Compute scale factor matching mesh creation (targetMaxSize=8)
    const maxOriginalDim = Math.max(depth, height, width);
    const targetMaxSize = 8;
    const scaleFactor = targetMaxSize / maxOriginalDim;

    // Create a group for all network line segments
    const networkGroup = new THREE.Group();
    networkGroup.name = 'filamentNetwork';

    // Material: vertex colors, always 100% opaque
    const material = new THREE.LineBasicMaterial({
        vertexColors: true
    });

    const positions = networkData.positions;
    const colors = networkData.colors;
    const sliceBuckets = networkData.sliceBuckets;

    // Create one LineSegments per z-bucket
    const sliceSegments = {};

    for (let z = 0; z < sliceCount; z++) {
        const bucket = sliceBuckets[String(z)];
        if (!bucket || bucket.count === 0) continue;

        // Extract positions and colors for this bucket
        // Each vertex = 3 floats in positions, 3 floats in colors
        const startVertex = bucket.start;
        const vertexCount = bucket.count;
        const posStart = startVertex * 3;
        const posEnd = (startVertex + vertexCount) * 3;

        const bucketPositions = new Float32Array(positions.slice(posStart, posEnd));
        const bucketColors = new Float32Array(colors.slice(posStart, posEnd));

        // Apply centering and scaling to match mesh coordinates
        centerAndScaleGeometry(bucketPositions, dataShape, scaleFactor);

        // Create BufferGeometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(bucketPositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(bucketColors, 3));

        const lineSegments = new THREE.LineSegments(geometry, material);
        lineSegments.name = `network-z${z}`;
        lineSegments.visible = true;

        networkGroup.add(lineSegments);
        sliceSegments[z] = lineSegments;
    }

    // Add to meshGroup so it rotates with the mesh
    meshGroup.add(networkGroup);

    const bucketCount = Object.keys(sliceSegments).length;
    console.log(`[NetworkRenderer] Created ${bucketCount} z-bucket LineSegments`);

    return {
        networkGroup,
        sliceSegments,
        metadata: {
            nodeCount: meta.nodeCount,
            edgeCount: meta.edgeCount,
            sliceCount: sliceCount,
            filamentClass: meta.filamentClass,
            shape: dataShape,
            bucketCount
        }
    };
}

/**
 * Toggle network visibility
 * @param {THREE.Group} networkGroup - The network group
 * @param {boolean} visible - Whether to show the network
 */
export function setNetworkVisibility(networkGroup, visible) {
    if (networkGroup) {
        networkGroup.visible = visible;
    }
}

/**
 * Show/hide per-bucket LineSegments by z-range
 * @param {Object} sliceSegments - Map of z -> THREE.LineSegments
 * @param {number} minBucket - Minimum z-bucket (inclusive)
 * @param {number} maxBucket - Maximum z-bucket (inclusive)
 */
export function setNetworkSliceRange(sliceSegments, minBucket, maxBucket) {
    for (const [z, lineSegments] of Object.entries(sliceSegments)) {
        const zNum = parseInt(z);
        lineSegments.visible = (zNum >= minBucket && zNum <= maxBucket);
    }
}

/**
 * Dispose all network geometries and materials
 * @param {THREE.Group} networkGroup - The network group
 * @param {Object} sliceSegments - Map of z -> THREE.LineSegments
 */
export function disposeNetwork(networkGroup, sliceSegments) {
    if (sliceSegments) {
        for (const lineSegments of Object.values(sliceSegments)) {
            if (lineSegments.geometry) lineSegments.geometry.dispose();
        }
    }

    if (networkGroup) {
        // Dispose shared material
        if (networkGroup.children.length > 0 && networkGroup.children[0].material) {
            networkGroup.children[0].material.dispose();
        }
        // Remove from parent
        if (networkGroup.parent) {
            networkGroup.parent.remove(networkGroup);
        }
    }
}
