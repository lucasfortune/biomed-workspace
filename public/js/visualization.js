async function initialize3DVisualization() {
    console.log('=== ENHANCED 3D VISUALIZATION INIT ===');
    
    const container = document.getElementById('threejsContainer');
    if (!container) {
        console.error('3D container not found!');
        return;
    }
    
    try {
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
        
        // IMPORTANT: Enable clipping planes for slice range functionality
        renderer.localClippingEnabled = true;
        
        container.appendChild(renderer.domElement);
        
        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(2, 2, 2);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);
        
        // Add a second light from different angle
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-1, -1, 1);
        scene.add(fillLight);
        
        // Initial camera position
        camera.position.set(3, 2, 5);
        camera.lookAt(0, 0, 0);
        
        // Try to load segmentation data
        if (window.inferenceResult && window.inferenceResult.visualization_path) {
            console.log('Loading segmentation data for surface mesh creation...');
            console.log('Visualization path:', window.inferenceResult.visualization_path);
            
            // Load the segmentation data
            segmentationData = await loadSegmentationData(window.inferenceResult.visualization_path);
            console.log('Segmentation data loaded successfully');
            
            // ===================================================
            // UPDATED: Create separate meshes instead of single geometry
            // ===================================================
            console.log('Creating separate class meshes...');
            meshGroup = createSeparateClassMeshes(segmentationData);
            
           if (meshGroup && meshGroup.children.length > 0) {
                console.log('Separate class meshes created successfully');
                
                // =========================
                // DETAILED DEBUGGING OUTPUT (UPDATED)
                // =========================
                console.log('=== DETAILED MESH DEBUG ===');
                console.log('Mesh group exists:', !!meshGroup);
                console.log('Number of class meshes:', Object.keys(classMeshes).length);
                console.log('Available classes:', availableClasses);
                
                // Debug each class mesh
                Object.keys(classMeshes).forEach(classValue => {
                    const mesh = classMeshes[classValue];
                    console.log(`Class ${classValue}:`, {
                        vertices: mesh.geometry.attributes.position.count,
                        visible: mesh.visible,
                        material: mesh.material.type,
                        opacity: mesh.material.opacity
                    });
                });
                
                // Calculate bounding box of entire group
                const box = new THREE.Box3().setFromObject(meshGroup);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                console.log('Group bounding box:');
                console.log('  Center:', center.x.toFixed(3), center.y.toFixed(3), center.z.toFixed(3));
                console.log('  Size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
                
                // =========================
                // IMPROVED CAMERA POSITIONING
                // =========================
                const maxDim = Math.max(size.x, size.y, size.z);
                console.log('Max dimension for camera positioning:', maxDim.toFixed(3));
                
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
                
                console.log(`Calculated camera distance: ${distance.toFixed(3)}`);
                
                // Position camera in a nice viewing angle
                const cameraX = distance * 0.7;  // 70% to the right
                const cameraY = distance * 0.5;  // 50% up
                const cameraZ = distance * 0.7;  // 70% forward
                
                camera.position.set(cameraX, cameraY, cameraZ);
                camera.lookAt(center);
                
                console.log('Camera positioned at:', camera.position.x.toFixed(3), camera.position.y.toFixed(3), camera.position.z.toFixed(3));
                console.log('Camera looking at:', center.x.toFixed(3), center.y.toFixed(3), center.z.toFixed(3));
                console.log('Actual camera distance:', camera.position.distanceTo(center).toFixed(3));
                
                // Adjust camera near/far planes for the mesh size
                camera.near = distance * 0.01;  // Very close
                camera.far = distance * 10;     // Far enough
                camera.updateProjectionMatrix();
                
                console.log(`Camera near/far planes: ${camera.near.toFixed(3)} / ${camera.far.toFixed(3)}`);
                
                // Set global reference for backward compatibility
                segmentationMesh = meshGroup;
                
            } else {
                console.warn('No meshes were created from segmentation data');
                createFallbackMesh();
            }
            
        } else {
            console.log('No visualization data available, creating placeholder');
            createFallbackMesh();
        }
        
        // Setup visualization controls
        setupVisualizationControls();
        
        // Setup enhanced controls for mesh interaction
        setupEnhancedControls();
        
        // Start render loop
        startRenderLoop();
        
        console.log('=== 3D VISUALIZATION INITIALIZATION COMPLETE ===');
        
    } catch (error) {
        console.error('3D visualization failed:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Error fallback
        createErrorFallbackMesh();
        
        // Still setup basic controls so the interface works
        setupVisualizationControls();
        setupEnhancedControls();
        startRenderLoop();
    }
}

// Helper function to create a fallback mesh when no data is available
function createFallbackMesh() {
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
    
    // Set up dummy data for controls
    availableClasses = [1];
    visibleClasses = [1];
    classMeshes = { 1: placeholderMesh };
    meshGroup = new THREE.Group();
    meshGroup.add(placeholderMesh);
    segmentationMesh = meshGroup;
    
    console.log('Placeholder mesh created');
}

// Helper function to create an error mesh when something goes wrong
function createErrorFallbackMesh() {
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
    
    // Set up dummy data for controls
    availableClasses = [1];
    visibleClasses = [1];
    classMeshes = { 1: errorMesh };
    meshGroup = new THREE.Group();
    meshGroup.add(errorMesh);
    segmentationMesh = meshGroup;
    
    console.log('Error fallback mesh created');
}

// Helper function to start the render loop
function startRenderLoop() {
    function animate() {
        requestAnimationFrame(animate);
        
        // Render the scene
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    
    animate();
    console.log('Render loop started');
}

function setupEnhancedControls() {
    console.log('Setting up enhanced mesh-centered controls');
    
    const canvas = renderer.domElement;
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && meshGroup) {
            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };
            
            // Rotate the entire mesh group
            meshGroup.rotation.y += deltaMove.x * 0.01;
            meshGroup.rotation.x += deltaMove.y * 0.01;
            
            // Clamp vertical rotation
            meshGroup.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, meshGroup.rotation.x));
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });
    
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });
    
    // Zoom controls
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const zoomSpeed = 0.2;
        const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        
        camera.position.multiplyScalar(delta);
        
        // Prevent camera from getting too close or too far
        const distance = camera.position.length();
        if (distance < 1) {
            camera.position.normalize().multiplyScalar(1);
        } else if (distance > 100) {
            camera.position.normalize().multiplyScalar(100);
        }
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (event) => {
        if (!meshGroup) return;
        
        const rotationSpeed = 0.1;
        
        switch(event.key.toLowerCase()) {
            case 'arrowleft':
                meshGroup.rotation.y -= rotationSpeed;
                break;
            case 'arrowright':
                meshGroup.rotation.y += rotationSpeed;
                break;
            case 'arrowup':
                meshGroup.rotation.x -= rotationSpeed;
                break;
            case 'arrowdown':
                meshGroup.rotation.x += rotationSpeed;
                break;
            case 'r':
                // Reset rotation
                meshGroup.rotation.set(0, 0, 0);
                break;
        }
    });
    
    canvas.style.cursor = 'grab';
    console.log('Enhanced mesh-centered controls setup complete');
}

// Function to setup UI control event listeners
function setupVisualizationControls() {
    console.log('Setting up visualization controls for surface mesh');
    
    // =========================
    // OPACITY SLIDER
    // =========================
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    
    if (opacitySlider && opacityValue) {
        console.log('Opacity controls found');
        
        // Remove any existing listeners to avoid duplicates
        opacitySlider.removeEventListener('input', handleOpacityChange);
        
        // Add new listener
        opacitySlider.addEventListener('input', handleOpacityChange);
        
        console.log('Opacity slider listener attached');
    } else {
        console.log('Opacity controls not found!');
    }
    
    // =========================
    // SLICE RANGE SLIDERS
    // =========================
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (sliceRangeMin && sliceRangeMax && sliceRangeValue) {
        console.log('Slice range controls found');
        
        // Remove existing listeners
        sliceRangeMin.removeEventListener('input', handleSliceRangeChange);
        sliceRangeMax.removeEventListener('input', handleSliceRangeChange);
        
        // Add new listeners
        sliceRangeMin.addEventListener('input', handleSliceRangeChange);
        sliceRangeMax.addEventListener('input', handleSliceRangeChange);
        
        console.log('Slice range listeners attached');
    } else {
        console.log('Slice range controls not found!');
    }
    
    // =========================
    // SLICE DIRECTION SELECTOR
    // =========================
    const sliceDirectionSelect = document.getElementById('sliceDirectionSelect');
    if (sliceDirectionSelect) {
        console.log('Slice direction selector found');
        
        // Remove existing listener
        sliceDirectionSelect.removeEventListener('change', handleSliceDirectionChange);
        
        // Add new listener
        sliceDirectionSelect.addEventListener('change', handleSliceDirectionChange);
        
        // Set initial direction to Z (front-back)
        sliceDirectionSelect.value = 'z';
        sliceDirection = 'z';
        
        console.log('Slice direction selector attached, set to Z-axis (front-back)');
    } else {
        console.log('Slice direction selector not found - using default Z-axis');
        sliceDirection = 'z';
    }
    
    // =========================
    // CLASS FILTER DROPDOWN
    // =========================
    const classFilter = document.getElementById('classFilter');
    if (classFilter) {
        console.log('Class filter found');
        
        // Remove existing listener
        classFilter.removeEventListener('change', handleClassFilterChange);
        
        // Add new listener
        classFilter.addEventListener('change', handleClassFilterChange);
        
        console.log('Class filter listener attached');
    } else {
        console.log('Class filter not found!');
    }
    
    console.log('All visualization controls setup complete');
}

function handleOpacityChange(e) {
    const opacity = e.target.value / 100;
    const opacityValue = document.getElementById('opacityValue');
    
    if (opacityValue) {
        opacityValue.textContent = e.target.value + '%';
    }
    
    console.log('Opacity changed to:', opacity);
    
    // Apply opacity to all visible class meshes
    if (classMeshes) {
        Object.keys(classMeshes).forEach(classValue => {
            const classMesh = classMeshes[classValue];
            if (classMesh.visible && classMesh.material) {
                classMesh.material.opacity = opacity;
                classMesh.material.transparent = true;
                classMesh.material.needsUpdate = true;
                classMesh.userData.originalOpacity = opacity;
            }
        });
        
        console.log('Applied opacity to all visible class meshes');
        
        // Force re-render
        if (typeof renderer !== 'undefined') {
            renderer.render(scene, camera);
        }
    } else {
        console.log('No class meshes available for opacity change');
    }
}

function applySliceRangeToMeshes() {
    if (!classMeshes || !segmentationData) {
        console.log('No meshes or data available for slice filtering');
        return;
    }
    
    const [depth, height, width] = segmentationData.shape;
    
    // Calculate range based on the selected direction
    let minCoord, maxCoord, axis, planeDimension;
    
    switch(sliceDirection) {
        case 'x': // Left to Right
            planeDimension = width;
            axis = 'X';
            break;
        case 'y': // Bottom to Top  
            planeDimension = height;
            axis = 'Y';
            break;
        case 'z': // Front to Back (this should be the correct one for most medical data)
            planeDimension = depth;
            axis = 'Z';
            break;
        default:
            planeDimension = depth;
            axis = 'Z';
            sliceDirection = 'z';
    }
    
    // Calculate coordinate range based on percentage (centered around origin)
    const halfDim = planeDimension / 2;
    const rangeSize = (currentSliceRange[1] - currentSliceRange[0]) / 100 * planeDimension;
    const rangeCenter = (currentSliceRange[0] + currentSliceRange[1]) / 2 / 100 * planeDimension - halfDim;
    
    minCoord = rangeCenter - rangeSize / 2;
    maxCoord = rangeCenter + rangeSize / 2;
    
    console.log(`Applying ${axis}-axis slice filter: ${minCoord.toFixed(2)} to ${maxCoord.toFixed(2)}`);
    console.log(`Range: ${currentSliceRange[0]}% to ${currentSliceRange[1]}% of ${planeDimension} ${axis}-dimension`);
    
    // Create clipping planes based on direction
    let clippingPlanes;
    
    switch(sliceDirection) {
        case 'x':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -minCoord),   // Clip left of minX
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxCoord)    // Clip right of maxX
            ];
            break;
        case 'y':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -minCoord),   // Clip below minY
                new THREE.Plane(new THREE.Vector3(0, -1, 0), maxCoord)    // Clip above maxY
            ];
            break;
        case 'z':
            clippingPlanes = [
                new THREE.Plane(new THREE.Vector3(0, 0, 1), -minCoord),   // Clip behind minZ
                new THREE.Plane(new THREE.Vector3(0, 0, -1), maxCoord)    // Clip in front of maxZ
            ];
            break;
    }
    
    // Apply clipping planes to all visible meshes
    Object.keys(classMeshes).forEach(classValue => {
        const classMesh = classMeshes[classValue];
        if (!classMesh.visible) return;
        
        // Remove existing clipping planes
        classMesh.material.clippingPlanes = clippingPlanes;
        classMesh.material.clipShadows = true;
        classMesh.material.needsUpdate = true;
    });
    
    // Enable clipping planes in renderer
    renderer.localClippingEnabled = true;
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
}

// Function to change slice direction
function setSliceDirection(direction) {
    const validDirections = ['x', 'y', 'z'];
    if (!validDirections.includes(direction.toLowerCase())) {
        console.error('Invalid slice direction. Use "x", "y", or "z"');
        return;
    }
    
    sliceDirection = direction.toLowerCase();
    console.log(`Slice direction changed to ${direction.toUpperCase()}-axis`);
    
    // Update the slice direction indicator if it exists
    const indicator = document.getElementById('sliceDirectionIndicator');
    if (indicator) {
        const directionNames = {
            'x': 'Left → Right',
            'y': 'Bottom → Top', 
            'z': 'Front → Back'
        };
        indicator.textContent = directionNames[sliceDirection];
    }
    
    // Re-apply current slice range with new direction
    applySliceRangeToMeshes();
}

// Updated slice range change handler 
function handleSliceRangeChange() {
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (!sliceRangeMin || !sliceRangeMax || !sliceRangeValue) return;
    
    const minVal = parseInt(sliceRangeMin.value);
    const maxVal = parseInt(sliceRangeMax.value);
    
    console.log('Slice range change:', minVal, 'to', maxVal);
    
    if (minVal > maxVal) {
        sliceRangeMin.value = maxVal;
        currentSliceRange = [maxVal, maxVal];
    } else {
        currentSliceRange = [minVal, maxVal];
    }
    
    sliceRangeValue.textContent = `${currentSliceRange[0]}% - ${currentSliceRange[1]}%`;
    console.log('Updated slice range to:', currentSliceRange);
    
    // Apply slice-based filtering to meshes with current direction
    applySliceRangeToMeshes();
}

function handleClassFilterChange(e) {
    console.log('Class filter changed to:', e.target.value);
    
    if (e.target.value === 'all') {
        // Show all classes
        visibleClasses = [...availableClasses];
        Object.keys(classMeshes).forEach(classValue => {
            classMeshes[classValue].visible = true;
        });
    } else {
        // Show only selected class
        const selectedClass = parseInt(e.target.value);
        visibleClasses = [selectedClass];
        
        Object.keys(classMeshes).forEach(classValue => {
            const classValueInt = parseInt(classValue);
            classMeshes[classValue].visible = (classValueInt === selectedClass);
        });
    }
    
    console.log('Visible classes updated to:', visibleClasses);
    console.log('Mesh visibility updated');
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
}

/**
 * Handle slice direction dropdown change
 */
function handleSliceDirectionChange(e) {
    const newDirection = e.target.value;
    setSliceDirection(newDirection);
    console.log(`Slice direction changed via UI to: ${newDirection}`);
}

/**
 * Reset slice range to full (0% - 100%)
 */
function resetSliceRange() {
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (sliceRangeMin) sliceRangeMin.value = 0;
    if (sliceRangeMax) sliceRangeMax.value = 100;
    if (sliceRangeValue) sliceRangeValue.textContent = '0% - 100%';
    
    currentSliceRange = [0, 100];
    
    // Remove all clipping planes (show full mesh)
    if (classMeshes) {
        Object.keys(classMeshes).forEach(classValue => {
            const classMesh = classMeshes[classValue];
            if (classMesh.material) {
                classMesh.material.clippingPlanes = [];
                classMesh.material.needsUpdate = true;
            }
        });
    }
    
    // Disable clipping
    if (renderer) {
        renderer.localClippingEnabled = false;
    }
    
    console.log('Slice range reset to full view');
}

function resetView() {
    console.log('Resetting view to defaults');
    
    // Reset UI controls
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    const classFilter = document.getElementById('classFilter');
    
    if (opacitySlider) opacitySlider.value = 80;
    if (opacityValue) opacityValue.textContent = '80%';
    if (sliceRangeMin) sliceRangeMin.value = 0;
    if (sliceRangeMax) sliceRangeMax.value = 100;
    if (sliceRangeValue) sliceRangeValue.textContent = '0% - 100%';
    if (classFilter) classFilter.value = 'all';
    
    // Reset global variables
    currentSliceRange = [0, 100];
    visibleClasses = [...availableClasses];
    
    // Reset all class meshes
    if (classMeshes) {
        Object.keys(classMeshes).forEach(classValue => {
            const classMesh = classMeshes[classValue];
            
            // Reset visibility
            classMesh.visible = true;
            
            // Reset material properties
            if (classMesh.material) {
                classMesh.material.opacity = 0.8;
                classMesh.material.transparent = true;
                classMesh.material.clippingPlanes = []; // Remove clipping planes
                classMesh.material.needsUpdate = true;
            }
            
            // Reset rotation
            classMesh.rotation.set(0, 0, 0);
        });
    }
    
    // Reset mesh group rotation
    if (meshGroup) {
        meshGroup.rotation.set(0, 0, 0);
    }
    
    // Reset camera position
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);
    
    // Disable clipping planes
    renderer.localClippingEnabled = false;
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
    
    console.log('View reset completed');
}

// Add this function to load segmentation data
async function loadSegmentationData(visualizationPath) {
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
            console.warn('⚠️  Large dataset detected. Rendering may take longer than usual.');
        } else if (data.data.length > 100000) {
            console.log('📊 Medium-sized dataset. Good balance of detail and performance.');
        } else {
            console.log('⚡ Small dataset. Optimal for real-time interaction.');
        }
        
        return data;
        
    } catch (error) {
        console.error('Failed to load high-resolution segmentation data:', error);
        throw error;
    }
}

function createSeparateClassMeshes(data) {
    console.log('=== CREATING SEPARATE CLASS MESHES WITH SCALING ===');
    const startTime = performance.now();
    
    // Extract basic information
    const voxelData = data.data;
    const shape = data.shape;
    const [depth, height, width] = shape;
    
    console.log(`Processing ${voxelData.length} voxels in ${depth}x${height}x${width} volume`);
    
    // Set global variables
    availableClasses = [...new Set(voxelData.map(v => v.value))].sort();
    visibleClasses = [...availableClasses];
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
    meshGroup = new THREE.Group();
    classMeshes = {}; // Reset the meshes object
    
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
            
            // STEP 1: Center geometry around origin
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
    
    // Update global reference for compatibility with existing code
    segmentationMesh = meshGroup;
    
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
    populateClassFilter();
    
    return meshGroup;
}

function centerAndScaleGeometry(vertices, shape, scaleFactor) {
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

// Function to populate class filter dropdown
function populateClassFilter() {
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

function addQuadFace(vertices, normals, x, y, z, face) {
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

function getVoxelValue(volume, x, y, z, width, height, depth) {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;  // Outside bounds = background
    const index = z * (height * width) + y * width + x;
    return volume[index] || 0;
}