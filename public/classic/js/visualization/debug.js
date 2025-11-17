// debug.js - Debug and testing functions
// This file contains all debugging and testing utilities for the 3D visualization

import { getGlobalState } from './main.js';
import { applyRangeToSingleClass } from './clipping.js';

/**
 * =================================
 * ===== TESTING & DEBUGGING =======
 * ============START================
 */

/**
 * Debug specific clipping behavior with simple test
 */
export function debugSpecificClipping() {
    const state = getGlobalState();
    const classValue = 1;
    const mesh = state.classMeshes[classValue];
    
    if (!mesh) {
        console.log('No mesh available for debug test');
        return;
    }
    
    console.log('=== DEBUGGING CLIPPING DIRECTION ===');
    
    // Test 1: Simple plane that should keep the "front" half 
    console.log('Test 1: Keeping Z >= 0 (should show front half)');
    const planeFront = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    mesh.material.clippingPlanes = [planeFront];
    mesh.material.needsUpdate = true;
    state.renderer.localClippingEnabled = true;
    state.renderer.render(state.scene, state.camera);
    
    setTimeout(() => {
        console.log('Test 2: Keeping Z <= 0 (should show back half)');
        const planeBack = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        mesh.material.clippingPlanes = [planeBack];
        mesh.material.needsUpdate = true;
        state.renderer.render(state.scene, state.camera);
    }, 3000);
    
    setTimeout(() => {
        console.log('Test 3: No clipping (full model)');
        mesh.material.clippingPlanes = [];
        mesh.material.needsUpdate = true;
        state.renderer.localClippingEnabled = false;
        state.renderer.render(state.scene, state.camera);
    }, 6000);
}

/**
 * Test the corrected clipping math with known values
 */
export function testClippingMath(classValue = 1) {
    console.log('=== TESTING CORRECTED CLIPPING MATH ===');
    
    // Test: Show middle 50% of the model (25% to 75%)
    console.log('Test 1: Should show middle 50% of model (25% to 75%)');
    applyRangeToSingleClass(classValue, 25, 75);
    
    setTimeout(() => {
        console.log('Test 2: Should show first 80% of model (0% to 80%)');
        applyRangeToSingleClass(classValue, 0, 80);
    }, 3000);
    
    setTimeout(() => {
        console.log('Test 3: Should show last 60% of model (40% to 100%)');
        applyRangeToSingleClass(classValue, 40, 100);
    }, 6000);
    
    setTimeout(() => {
        console.log('Test 4: Reset to full model (0% to 100%)');
        applyRangeToSingleClass(classValue, 0, 100);
    }, 9000);
}

/**
 * Test clipping in all three axes to determine correct orientation
 * Call this in console: testAllAxes()
 */
export function testAllAxes(classValue = 1) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    console.log('=== TESTING ALL AXES ===');
    console.log('Watch which direction each clipping plane cuts from...');
    
    // Test X-axis clipping (constant = 0 should clip half)
    setTimeout(() => {
        console.log('Testing X-axis clipping (should clip from LEFT to RIGHT)...');
        const planeX = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        mesh.material.clippingPlanes = [planeX];
        mesh.material.needsUpdate = true;
        state.renderer.localClippingEnabled = true;
        state.renderer.render(state.scene, state.camera);
    }, 1000);
    
    // Test Y-axis clipping  
    setTimeout(() => {
        console.log('Testing Y-axis clipping (should clip from BOTTOM to TOP)...');
        const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        mesh.material.clippingPlanes = [planeY];
        mesh.material.needsUpdate = true;
        state.renderer.render(state.scene, state.camera);
    }, 3000);
    
    // Test Z-axis clipping
    setTimeout(() => {
        console.log('Testing Z-axis clipping (should clip from FRONT to BACK)...');
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        mesh.material.clippingPlanes = [planeZ];
        mesh.material.needsUpdate = true;
        state.renderer.render(state.scene, state.camera);
    }, 5000);
    
    // Clear clipping
    setTimeout(() => {
        console.log('Clearing all clipping...');
        mesh.material.clippingPlanes = [];
        mesh.material.needsUpdate = true;
        state.renderer.localClippingEnabled = false;
        state.renderer.render(state.scene, state.camera);
    }, 7000);
}

/**
 * Test clipping with very conservative planes that should definitely work
 */
export function testSafeClipping(classValue = 1, percent = 50) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    // Get actual Z bounds from vertices
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < positions.length; i += 3) {
        const z = positions[i];
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    
    // Calculate a safe clipping coordinate
    const range = maxZ - minZ;
    const clipZ = minZ + (percent / 100) * range;
    
    console.log('=== SAFE CLIPPING TEST ===');
    console.log(`Actual Z range: ${minZ.toFixed(3)} to ${maxZ.toFixed(3)}`);
    console.log(`Clipping at Z = ${clipZ.toFixed(3)} (${percent}% through the range)`);
    
    // Create a single clipping plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipZ);
    
    mesh.material.clippingPlanes = [plane];
    mesh.material.needsUpdate = true;
    state.renderer.localClippingEnabled = true;
    state.renderer.render(state.scene, state.camera);
    
    console.log(`Applied safe clipping - should show ${100-percent}% of model`);
}

/**
 * Debug function to understand mesh coordinate mapping
 * Call this in browser console: debugSliceCoordinates()
 */
export function debugSliceCoordinates() {
    const state = getGlobalState();
    
    if (!state.meshGroup) {
        console.log('No mesh group available');
        return;
    }
    
    // Group bounds
    const groupBox = new THREE.Box3().setFromObject(state.meshGroup);
    const groupSize = groupBox.getSize(new THREE.Vector3());
    
    console.log('=== SLICE COORDINATE DEBUG (FIXED) ===');
    console.log('Mesh GROUP Bounding Box:', `${groupBox.min.z.toFixed(3)} to ${groupBox.max.z.toFixed(3)} (size: ${groupSize.z.toFixed(3)})`);
    
    // Individual mesh bounds
    console.log('Individual Class Mesh Bounds:');
    Object.keys(state.classMeshes).forEach(classValue => {
        const mesh = state.classMeshes[classValue];
        if (mesh) {
            const meshBox = new THREE.Box3().setFromObject(mesh);
            const meshSize = meshBox.getSize(new THREE.Vector3());
            console.log(`  Class ${classValue}: Z from ${meshBox.min.z.toFixed(3)} to ${meshBox.max.z.toFixed(3)} (size: ${meshSize.z.toFixed(3)})`);
        }
    });
}

/**
 * Debug clipping plane behavior - call this after moving sliders
 */
export function debugClippingPlanes(classValue = 1) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh available for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    const planes = mesh.material.clippingPlanes;
    
    console.log('=== CLIPPING PLANE DEBUG ===');
    console.log(`Class ${classValue} has ${planes ? planes.length : 0} clipping planes`);
    
    if (planes && planes.length > 0) {
        planes.forEach((plane, index) => {
            console.log(`Plane ${index + 1}:`, {
                normal: `(${plane.normal.x.toFixed(3)}, ${plane.normal.y.toFixed(3)}, ${plane.normal.z.toFixed(3)})`,
                constant: plane.constant.toFixed(3),
                // Calculate what Z coordinate this plane represents
                planeZ: -plane.constant / plane.normal.z
            });
        });
    }
    
    // Also check mesh geometry distribution
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    let minZ = Infinity, maxZ = -Infinity;
    let zValues = [];
    
    // Sample some Z coordinates from the geometry
    for (let i = 2; i < positions.length; i += 9) { // Every 3rd vertex, Z coordinate
        const z = positions[i];
        zValues.push(z);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    
    // Sort Z values to see distribution
    zValues.sort((a, b) => a - b);
    const sampleSize = Math.min(20, zValues.length);
    const sampleIndices = Array.from({length: sampleSize}, (_, i) => Math.floor(i * (zValues.length - 1) / (sampleSize - 1)));
    const zSample = sampleIndices.map(i => zValues[i]);
    
    console.log('Mesh Geometry Z Distribution:');
    console.log(`  Geometry Z range: ${minZ.toFixed(3)} to ${maxZ.toFixed(3)}`);
    console.log(`  Sample Z values:`, zSample.map(z => z.toFixed(3)));
}

/**
 * Simple test function - manually apply a basic clipping plane
 * Call this in console: testBasicClipping()
 */
export function testBasicClipping(classValue = 1) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    console.log('=== BASIC CLIPPING TEST ===');
    
    // Create a simple clipping plane that should clip half the model
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Clips everything with Z > 0
    
    mesh.material.clippingPlanes = [plane];
    mesh.material.needsUpdate = true;
    state.renderer.localClippingEnabled = true;
    
    console.log('Applied basic clipping plane - half the model should be gone');
    console.log('Clipping planes count:', mesh.material.clippingPlanes.length);
    
    // Force render
    state.renderer.render(state.scene, state.camera);
}

/**
 * Test function to check if clipping planes persist
 * Run this immediately after moving a slider
 */
export function testClippingPersistence(classValue = 1) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    console.log('=== CLIPPING PERSISTENCE TEST ===');
    console.log(`Class ${classValue} material:`, mesh.material);
    console.log(`Class ${classValue} clippingPlanes:`, mesh.material.clippingPlanes);
    console.log(`ClippingPlanes length:`, mesh.material.clippingPlanes ? mesh.material.clippingPlanes.length : 'null');
    console.log(`Renderer clipping enabled:`, state.renderer.localClippingEnabled);
    
    // Test: Set some dummy planes to see if they persist
    console.log('Setting test clipping planes...');
    const testPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    mesh.material.clippingPlanes = [testPlane];
    mesh.material.needsUpdate = true;
    
    setTimeout(() => {
        console.log('After 1 second - clippingPlanes:', mesh.material.clippingPlanes ? mesh.material.clippingPlanes.length : 'null');
    }, 1000);
}

/**
 * Debug mesh creation and geometry properties
 */
export function debugMeshGeometry(classValue = 1) {
    const state = getGlobalState();
    
    if (!state.classMeshes || !state.classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = state.classMeshes[classValue];
    const geometry = mesh.geometry;
    
    console.log('=== MESH GEOMETRY DEBUG ===');
    console.log(`Class ${classValue} mesh properties:`, {
        vertexCount: geometry.attributes.position.count,
        triangleCount: geometry.attributes.position.count / 3,
        hasNormals: !!geometry.attributes.normal,
        hasBoundingBox: !!geometry.boundingBox,
        visible: mesh.visible,
        opacity: mesh.material.opacity
    });
    
    if (geometry.boundingBox) {
        const box = geometry.boundingBox;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Bounding box details:', {
            min: `(${box.min.x.toFixed(3)}, ${box.min.y.toFixed(3)}, ${box.min.z.toFixed(3)})`,
            max: `(${box.max.x.toFixed(3)}, ${box.max.y.toFixed(3)}, ${box.max.z.toFixed(3)})`,
            size: `(${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)})`,
            center: `(${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`
        });
    }
}

/**
 * Debug camera and scene properties
 */
export function debugScene() {
    const state = getGlobalState();
    
    console.log('=== SCENE DEBUG ===');
    console.log('Scene children count:', state.scene.children.length);
    console.log('Camera position:', `(${state.camera.position.x.toFixed(3)}, ${state.camera.position.y.toFixed(3)}, ${state.camera.position.z.toFixed(3)})`);
    console.log('Renderer size:', state.renderer.getSize(new THREE.Vector2()));
    console.log('Renderer clipping enabled:', state.renderer.localClippingEnabled);
    
    // List all lights in scene
    const lights = state.scene.children.filter(child => child.isLight);
    console.log('Lights in scene:', lights.length);
    lights.forEach((light, index) => {
        console.log(`  Light ${index + 1}: ${light.type}, intensity: ${light.intensity || 'N/A'}`);
    });
    
    // List all meshes in scene
    const meshes = [];
    state.scene.traverse(child => {
        if (child.isMesh) {
            meshes.push(child);
        }
    });
    console.log('Total meshes in scene:', meshes.length);
}

/**
 * Debug global state
 */
export function debugGlobalState() {
    const state = getGlobalState();
    
    console.log('=== GLOBAL STATE DEBUG ===');
    console.log('Available classes:', state.availableClasses);
    console.log('Visible classes:', state.visibleClasses);
    console.log('Slice direction:', state.sliceDirection);
    console.log('Class meshes count:', Object.keys(state.classMeshes).length);
    console.log('Class control states:', state.classControlStates);
    console.log('Segmentation data available:', !!state.segmentationData);
    
    if (state.segmentationData) {
        console.log('Segmentation data properties:', {
            shape: state.segmentationData.shape,
            dataPoints: state.segmentationData.data ? state.segmentationData.data.length : 'N/A',
            version: state.segmentationData.version || 'legacy'
        });
    }
}

/**
 * =============END=================
 * ===== TESTING & DEBUGGING =======
 * =================================
 */