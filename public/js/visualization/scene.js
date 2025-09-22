// scene.js - Three.js scene setup and rendering management
// This file handles all the Three.js scene setup, lighting, and rendering

// Scene, camera, and renderer will be initialized here
export let scene, camera, renderer;

/**
 * Initialize the Three.js scene with enhanced lighting and settings
 * @param {HTMLElement} container - The DOM container for the Three.js canvas
 * @returns {Object} - Returns the initialized scene components
 */
export function initializeScene(container) {
    
    // Initialize Three.js scene with better settings
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x222222, 1, 20); // Add atmospheric fog
    
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x222222);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clipping planes only needed for traditional rendering
    // For slice-based rendering, this can be disabled
    renderer.localClippingEnabled = false; // Changed to false for slice system
    
    container.appendChild(renderer.domElement);
    
    // Setup enhanced lighting
    setupEnhancedLighting();
    
    // Initial camera position
    camera.position.set(3, 2, 5);
    camera.lookAt(0, 0, 0);
    
    return { scene, camera, renderer };
}

/**
 * Setup enhanced lighting system for better 3D visualization
 */
function setupEnhancedLighting() {

    // 1. BRIGHTER AMBIENT LIGHT - This provides the base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased from 0.4 to 0.6, pure white
    scene.add(ambientLight);

    // 2. PRIMARY DIRECTIONAL LIGHT - Main light source from top-right
    const primaryLight = new THREE.DirectionalLight(0xffffff, 1.2); // Increased intensity
    primaryLight.position.set(10, 10, 5);
    primaryLight.castShadow = true;
    primaryLight.shadow.mapSize.width = 2048;
    primaryLight.shadow.mapSize.height = 2048;
    primaryLight.shadow.camera.near = 0.1;
    primaryLight.shadow.camera.far = 50;
    primaryLight.shadow.camera.left = -20;
    primaryLight.shadow.camera.right = 20;
    primaryLight.shadow.camera.top = 20;
    primaryLight.shadow.camera.bottom = -20;
    scene.add(primaryLight);

    // 3. FILL LIGHT - Soft light from the opposite side to fill shadows
    const fillLight = new THREE.DirectionalLight(0xb3d9ff, 0.8); // Soft blue-white, increased intensity
    fillLight.position.set(-8, 5, -3);
    scene.add(fillLight);

    // 4. BACK LIGHT - Creates nice rim lighting and depth
    const backLight = new THREE.DirectionalLight(0xfff5b3, 0.6); // Warm yellow-white
    backLight.position.set(2, -5, -10);
    scene.add(backLight);

    // 5. TOP-DOWN LIGHT - Provides even illumination from above
    const topLight = new THREE.DirectionalLight(0xffffff, 0.4);
    topLight.position.set(0, 15, 0);
    scene.add(topLight);

    // 6. HEMISPHERE LIGHT - Adds natural sky/ground lighting
    const hemisphereLight = new THREE.HemisphereLight(
        0xffffff,  // Sky color (white)
        0x444444,  // Ground color (dark gray)
        0.4        // Intensity
    );
    scene.add(hemisphereLight);
}

/**
 * Start the render loop for continuous animation
 */
export function startRenderLoop() {
    function animate() {
        requestAnimationFrame(animate);
        
        // Render the scene
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    
    animate();
}

/**
 * Position camera at optimal viewing angle for the mesh
 * @param {THREE.Object3D} meshGroup - The mesh group to position camera for
 */
export function positionCameraForMesh(meshGroup) {
    if (!meshGroup || !camera) return;
    
    // Calculate bounding box of entire group
    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculate optimal camera distance
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Position camera at a reasonable distance (for small scaled meshes)
    let distance;
    if (maxDim < 2) {
        distance = 8;  // Close for very small meshes
    } else if (maxDim < 5) {
        distance = maxDim * 2.5;  // Medium distance for small meshes
    } else if (maxDim < 10) {
        distance = maxDim * 2;    // Standard distance for medium meshes
    } else {
        distance = maxDim * 1.5;  // Closer for large meshes
    }
    
    // Ensure minimum distance
    distance = Math.max(distance, 5);
    
    // Position camera in a nice viewing angle
    const cameraX = distance * 0.7;  // 70% to the right
    const cameraY = distance * 0.5;  // 50% up
    const cameraZ = distance * 0.7;  // 70% forward
    
    camera.position.set(cameraX, cameraY, cameraZ);
    camera.lookAt(center);
    
    // Adjust camera near/far planes for the mesh size
    camera.near = distance * 0.01;  // Very close
    camera.far = distance * 10;     // Far enough
    camera.updateProjectionMatrix();
}

/**
 * Handle window resize events
 */
export function handleResize() {
    if (!camera || !renderer) return;
    
    const container = renderer.domElement.parentElement;
    if (!container) return;
    
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}