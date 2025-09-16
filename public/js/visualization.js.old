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
        
        // ENHANCED LIGHTING SETUP - Much Brighter and More Dynamic
        console.log('Setting up enhanced lighting system...');

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

        console.log('Enhanced lighting system setup complete');
        
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
            
            // UPDATE: Update slice direction indicator in real-time
            updateSliceDirectionIndicator();
            
            // UPDATE: Re-apply all current slice ranges with new rotation
            if (classControlStates) {
                Object.keys(classControlStates).forEach(classValue => {
                    const state = classControlStates[classValue];
                    if (state.rangeMin !== 0 || state.rangeMax !== 100) {
                        // Re-apply the slice range with the new rotation
                        applyRangeToSingleClass(parseInt(classValue), state.rangeMin, state.rangeMax);
                    }
                });
            }
            
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
        
        const zoomSpeed = 0.05;
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
        let rotationChanged = false;
        
        switch(event.key.toLowerCase()) {
            case 'arrowleft':
                meshGroup.rotation.y -= rotationSpeed;
                rotationChanged = true;
                break;
            case 'arrowright':
                meshGroup.rotation.y += rotationSpeed;
                rotationChanged = true;
                break;
            case 'arrowup':
                meshGroup.rotation.x -= rotationSpeed;
                rotationChanged = true;
                break;
            case 'arrowdown':
                meshGroup.rotation.x += rotationSpeed;
                rotationChanged = true;
                break;
            case 'r':
                // Reset rotation
                meshGroup.rotation.set(0, 0, 0);
                rotationChanged = true;
                break;
        }
        
        // Re-apply all current slice ranges with new rotation
        if (classControlStates) {
            Object.keys(classControlStates).forEach(classValue => {
                const state = classControlStates[classValue];
                if (state.rangeMin !== 0 || state.rangeMax !== 100) {
                    applyRangeToSingleClass(parseInt(classValue), state.rangeMin, state.rangeMax);
                }
            });
        }
    });
    
    canvas.style.cursor = 'grab';
    console.log('Enhanced mesh-centered controls setup complete');
}

// Global object to store individual class control states
let classControlStates = {};

/**
 * Generate individual control panels for each class
 * This replaces the old shared control system
 */
function generateClassControlPanels() {
    console.log('Generating individual control panels for classes:', availableClasses);
    
    const container = document.getElementById('classControlPanels');
    if (!container) {
        console.error('Class control panels container not found!');
        return;
    }
    
    // Clear existing panels
    container.innerHTML = '';
    
    // Initialize control states for each class
    availableClasses.forEach(classValue => {
        classControlStates[classValue] = {
            visible: true,
            opacity: 80,
            rangeMin: 0,
            rangeMax: 100
        };
    });
    
    // Create panel for each class
    availableClasses.forEach(classValue => {
        const panel = createClassControlPanel(classValue);
        container.appendChild(panel);
    });
    
    console.log('Class control panels generated successfully');
}

/**
 * Create a control panel for a specific class with improved styling
 * @param {number} classValue - The class number
 * @returns {HTMLElement} - The created panel element
 */
function createClassControlPanel(classValue) {
    // Create main panel div
    const panel = document.createElement('div');
    panel.className = 'class-control-panel';
    panel.setAttribute('data-class', classValue);
    
    // Get class color for visual identification
    const classColor = getClassColor(classValue);
    
    // Create checkbox section
    const checkboxSection = document.createElement('div');
    checkboxSection.className = 'class-checkbox-section';
    checkboxSection.innerHTML = `
        <input type="checkbox" 
               class="class-checkbox" 
               id="classCheckbox_${classValue}" 
               checked>
        <div class="class-label" style="color: ${classColor};">
            Class ${classValue}
        </div>
    `;
    
    // Create opacity section
    const opacitySection = document.createElement('div');
    opacitySection.className = 'class-opacity-section';
    opacitySection.innerHTML = `
        <label class="class-opacity-label">Opacity:</label>
        <input type="range" 
               class="slider class-opacity-slider" 
               id="classOpacity_${classValue}"
               min="10" 
               max="100" 
               value="80">
        <span class="class-opacity-value" id="classOpacityValue_${classValue}">80%</span>
    `;
    
    // Create range section with dual slider
    const rangeSection = document.createElement('div');
    rangeSection.className = 'class-range-section';
    
    const rangeLabel = document.createElement('label');
    rangeLabel.className = 'class-range-label';
    rangeLabel.textContent = 'Range:';
    
    const dualRangeSlider = createDualRangeSlider(classValue);
    
    const rangeValue = document.createElement('span');
    rangeValue.className = 'class-range-value';
    rangeValue.id = `classRangeValue_${classValue}`;
    rangeValue.textContent = '0% - 100%';
    
    rangeSection.appendChild(rangeLabel);
    rangeSection.appendChild(dualRangeSlider);
    rangeSection.appendChild(rangeValue);
    
    // Assemble the panel
    panel.appendChild(checkboxSection);
    panel.appendChild(opacitySection);
    panel.appendChild(rangeSection);
    
    // Add event listeners to this panel's controls
    setupClassControlListeners(classValue);
    
    return panel;
}

/**
 * Set up event listeners for a specific class control panel (updated for dual-range)
 * @param {number} classValue - The class number
 */
function setupClassControlListeners(classValue) {
    // We use setTimeout to ensure the DOM elements are ready
    setTimeout(() => {
        // Checkbox listener
        const checkbox = document.getElementById(`classCheckbox_${classValue}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => handleClassVisibilityChange(classValue, e.target.checked));
        }
        
        // Opacity slider listener
        const opacitySlider = document.getElementById(`classOpacity_${classValue}`);
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => handleClassOpacityChange(classValue, e.target.value));
        }
        
        // Dual-range slider listeners are already set up in createDualRangeSlider()
        // No need to add them again here
        
        console.log(`Event listeners set up for class ${classValue}`);
    }, 10);
}

/**
 * Get the exact color used for a class in the 3D model
 * This matches the classColors object used in createSeparateClassMeshes()
 * @param {number} classValue - The class number
 * @returns {string} - CSS color value that matches the 3D model
 */
function getClassColor(classValue) {
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
 * Handle visibility checkbox change for a specific class
 * @param {number} classValue - The class number
 * @param {boolean} isVisible - Whether the class should be visible
 */
function handleClassVisibilityChange(classValue, isVisible) {
    console.log(`Class ${classValue} visibility changed to:`, isVisible);
    
    // Update our state
    classControlStates[classValue].visible = isVisible;
    
    // Update the mesh visibility
    if (classMeshes && classMeshes[classValue]) {
        classMeshes[classValue].visible = isVisible;
    }
    
    // Update the panel visual state
    const panel = document.querySelector(`[data-class="${classValue}"]`);
    if (panel) {
        if (isVisible) {
            panel.classList.remove('disabled');
        } else {
            panel.classList.add('disabled');
        }
    }
    
    // Update global visibleClasses array
    if (isVisible) {
        if (!visibleClasses.includes(classValue)) {
            visibleClasses.push(classValue);
        }
    } else {
        visibleClasses = visibleClasses.filter(c => c !== classValue);
    }
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
    
    console.log('Updated visible classes:', visibleClasses);
}

/**
 * Handle opacity change for a specific class
 * @param {number} classValue - The class number
 * @param {string} opacityValue - The new opacity value (0-100)
 */
function handleClassOpacityChange(classValue, opacityValue) {
    const opacity = parseInt(opacityValue) / 100;
    console.log(`Class ${classValue} opacity changed to:`, opacity);
    
    // Update our state
    classControlStates[classValue].opacity = parseInt(opacityValue);
    
    // Update the display value
    const opacityValueSpan = document.getElementById(`classOpacityValue_${classValue}`);
    if (opacityValueSpan) {
        opacityValueSpan.textContent = opacityValue + '%';
    }
    
    // Apply opacity to this specific class mesh
    if (classMeshes && classMeshes[classValue]) {
        const classMesh = classMeshes[classValue];
        if (classMesh.material) {
            classMesh.material.opacity = opacity;
            classMesh.material.transparent = true;
            classMesh.material.needsUpdate = true;
        }
    }
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
}

/**
 * Handle range slider changes for a specific class (updated for dual-handle slider)
 * @param {number} classValue - The class number
 */
function handleClassRangeChange(classValue) {
    const rangeMin = document.getElementById(`dualRangeMin_${classValue}`);
    const rangeMax = document.getElementById(`dualRangeMax_${classValue}`);
    const rangeValue = document.getElementById(`classRangeValue_${classValue}`);
    
    if (!rangeMin || !rangeMax || !rangeValue) return;
    
    let minVal = parseInt(rangeMin.value);
    let maxVal = parseInt(rangeMax.value);
    
    // Ensure min is not greater than max
    if (minVal > maxVal) {
        minVal = maxVal;
        rangeMin.value = maxVal;
    }
    
    // Update our state
    classControlStates[classValue].rangeMin = minVal;
    classControlStates[classValue].rangeMax = maxVal;
    
    // Update display
    rangeValue.textContent = `${minVal}% - ${maxVal}%`;
    
    console.log(`Class ${classValue} range changed to: ${minVal}% - ${maxVal}%`);
    
    // Apply range filtering to this specific class
    applyRangeToSingleClass(classValue, minVal, maxVal);
}


/**
 * Apply range filtering to a single class mesh (FIXED: uses actual mesh coordinates)
 * @param {number} classValue - The class number
 * @param {number} minPercent - Minimum percentage (0-100)
 * @param {number} maxPercent - Maximum percentage (0-100)
 */
/**
 * Apply range filtering to a single class mesh (FIXED: Use actual vertex bounds)
 */
function applyRangeToSingleClass(classValue, minPercent, maxPercent) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log(`Cannot apply range to class ${classValue} - mesh not available`);
        return;
    }
    
    const classMesh = classMeshes[classValue];
    
    // SAFETY FIX: Initialize clippingPlanes if it doesn't exist
    if (classMesh.material && !classMesh.material.clippingPlanes) {
        classMesh.material.clippingPlanes = [];
        console.log(`Initialized clippingPlanes array for class ${classValue}`);
    }
    
    // CRITICAL FIX: Calculate bounds directly from geometry vertices, not setFromObject()
    const geometry = classMesh.geometry;
    const positions = geometry.attributes.position.array;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity; 
    let minZ = Infinity, maxZ = -Infinity;
    
    // Calculate actual vertex bounds
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    
    const actualBounds = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
    };
    
    console.log(`Class ${classValue} - Using ACTUAL vertex bounds:`, {
        bounds: `X: ${minX.toFixed(3)} to ${maxX.toFixed(3)}, Y: ${minY.toFixed(3)} to ${maxY.toFixed(3)}, Z: ${minZ.toFixed(3)} to ${maxZ.toFixed(3)}`,
        size: `(${actualBounds.size.x.toFixed(3)}, ${actualBounds.size.y.toFixed(3)}, ${actualBounds.size.z.toFixed(3)})`,
        center: `(${actualBounds.center.x.toFixed(3)}, ${actualBounds.center.y.toFixed(3)}, ${actualBounds.center.z.toFixed(3)})`
    });
    
    // Get the current slice direction
    const currentDir = sliceDirection || 'z';
    
    // Calculate coordinates based on ACTUAL geometry bounds
    let dimension, minCoord, maxCoord, centerCoord;
    
    switch(currentDir) {
        case 'x':
            dimension = actualBounds.size.x;
            centerCoord = actualBounds.center.x;
            minCoord = actualBounds.min.x + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.x + (maxPercent / 100) * dimension;
            break;
        case 'y':
            dimension = actualBounds.size.y;
            centerCoord = actualBounds.center.y;
            minCoord = actualBounds.min.y + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.y + (maxPercent / 100) * dimension;
            break;
        case 'z':
        default:
            dimension = actualBounds.size.z;
            centerCoord = actualBounds.center.z;
            minCoord = actualBounds.min.z + (minPercent / 100) * dimension;
            maxCoord = actualBounds.min.z + (maxPercent / 100) * dimension;
            break;
    }
    
    console.log(`VERTEX-BASED range calculation for class ${classValue}:`, {
        direction: currentDir,
        actualDimension: dimension.toFixed(3),
        actualBounds: {
            min: (currentDir === 'x' ? actualBounds.min.x : 
                  currentDir === 'y' ? actualBounds.min.y : actualBounds.min.z).toFixed(3),
            max: (currentDir === 'x' ? actualBounds.max.x : 
                  currentDir === 'y' ? actualBounds.max.y : actualBounds.max.z).toFixed(3)
        },
        calculatedCoords: {
            minCoord: minCoord.toFixed(3),
            maxCoord: maxCoord.toFixed(3)
        },
        percentRange: `${minPercent}% - ${maxPercent}%`
    });

   // Create clipping planes (FIXED: Correct Three.js plane math)
    let clippingPlanes = [];

    // Only create clipping planes if we're actually clipping something
    if (minPercent > 0 || maxPercent < 100) {
        console.log(`Creating CORRECTED clipping planes for class ${classValue}`);
        
        // Get actual vertex bounds for the selected direction
        let actualMin, actualMax;
        switch(currentDir) {
            case 'x':
                actualMin = actualBounds.min.x;
                actualMax = actualBounds.max.x;
                break;
            case 'y':
                actualMin = actualBounds.min.y;
                actualMax = actualBounds.max.y;
                break;
            case 'z':
            default:
                actualMin = actualBounds.min.z;
                actualMax = actualBounds.max.z;
                break;
        }
        
        const actualRange = actualMax - actualMin;
        const clipMin = actualMin + (minPercent / 100) * actualRange;
        const clipMax = actualMin + (maxPercent / 100) * actualRange;
        
        console.log(`CORRECTED clipping: ${currentDir}-axis from ${clipMin.toFixed(3)} to ${clipMax.toFixed(3)}`);
        console.log(`  This should KEEP geometry between ${clipMin.toFixed(3)} and ${clipMax.toFixed(3)}`);
        console.log(`  Actual geometry range: ${actualMin.toFixed(3)} to ${actualMax.toFixed(3)}`);
        
        // CORRECTED Three.js plane math:
        // Three.js clips where: normal⋅point + constant > 0
        // To keep geometry between clipMin and clipMax, we need:
        // - Plane 1: clips geometry < clipMin (keeps >= clipMin)  
        // - Plane 2: clips geometry > clipMax (keeps <= clipMax)
        
        // FIXED: Corrected Three.js clipping plane math
        if (minPercent > 0) {
            // Clip everything below clipMin
            // Want to clip where z < clipMin, so use normal pointing DOWN and adjust constant
            let plane1;
            switch(currentDir) {
                case 'x':
                    plane1 = new THREE.Plane(new THREE.Vector3(1, 0, 0), -clipMin);
                    break;
                case 'y':
                    plane1 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipMin);
                    break;
                case 'z':
                default:
                    plane1 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipMin);
                    break;
            }
            clippingPlanes.push(plane1);
            console.log(`  FIXED plane 1: clips ${currentDir} < ${clipMin.toFixed(3)} (keeps >= ${clipMin.toFixed(3)})`);
        }

        if (maxPercent < 100) {
            // Clip everything above clipMax  
            // Want to clip where z > clipMax, so use normal pointing UP and adjust constant
            let plane2;
            switch(currentDir) {
                case 'x':
                    plane2 = new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipMax);
                    break;
                case 'y':
                    plane2 = new THREE.Plane(new THREE.Vector3(0, -1, 0), clipMax);
                    break;
                case 'z':
                default:
                    plane2 = new THREE.Plane(new THREE.Vector3(0, 0, -1), clipMax);
                    break;
            }
            clippingPlanes.push(plane2);
            console.log(`  FIXED plane 2: clips ${currentDir} > ${clipMax.toFixed(3)} (keeps <= ${clipMax.toFixed(3)})`);
        }
        
        // ROTATION-AWARE: Transform clipping planes if the mesh is rotated
        if (meshGroup && (meshGroup.rotation.x !== 0 || meshGroup.rotation.y !== 0 || meshGroup.rotation.z !== 0)) {
            console.log(`Applying rotation transformation for class ${classValue}:`, {
                rotation: `(${meshGroup.rotation.x.toFixed(3)}, ${meshGroup.rotation.y.toFixed(3)}, ${meshGroup.rotation.z.toFixed(3)})`
            });
            
            // Get the rotation matrix
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromEuler(meshGroup.rotation);
            
            // Create a 3x3 matrix for transforming normals
            const rotationMatrix3 = new THREE.Matrix3().setFromMatrix4(rotationMatrix);
            
            // Transform each clipping plane
            clippingPlanes.forEach((plane, index) => {
                // Store original for debugging
                const originalNormal = plane.normal.clone();
                
                // Transform the normal vector
                plane.normal.applyMatrix3(rotationMatrix3);
                
                console.log(`  Plane ${index + 1}: normal transformed from (${originalNormal.x.toFixed(3)}, ${originalNormal.y.toFixed(3)}, ${originalNormal.z.toFixed(3)}) to (${plane.normal.x.toFixed(3)}, ${plane.normal.y.toFixed(3)}, ${plane.normal.z.toFixed(3)})`);
            });
            
            console.log(`Applied rotation transformation to ${clippingPlanes.length} planes`);
        } else {
            console.log('No rotation applied - mesh is at default orientation');
        }
        
        console.log(`Created ${clippingPlanes.length} CORRECTED clipping planes for class ${classValue}`);
    } else {
        console.log(`No clipping needed for class ${classValue} - showing full range (0%-100%)`);
    }
    
    // Apply clipping planes to this specific class mesh
    if (classMesh.material) {
        classMesh.material.clippingPlanes = clippingPlanes;
        classMesh.material.needsUpdate = true;
        console.log(`Applied ${clippingPlanes.length} clipping planes to class ${classValue} material`);
    } else {
        console.error(`No material found for class ${classValue}`);
    }
    
    // Enable clipping if any class has clipping planes
    let hasAnyClipping = false;
    Object.keys(classMeshes).forEach(cv => {
        const mesh = classMeshes[cv];
        if (mesh && mesh.material && mesh.material.clippingPlanes && mesh.material.clippingPlanes.length > 0) {
            hasAnyClipping = true;
        }
    });
    
    renderer.localClippingEnabled = hasAnyClipping;
    console.log(`Renderer clipping enabled: ${hasAnyClipping}`);
    
    console.log(`=== FINAL: Applied range ${minPercent}%-${maxPercent}% to class ${classValue} (${clippingPlanes.length} planes) ===`);
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
}

/**
 * =================================
 * ===== TESTING & DEBUGGING =======
 * ============START================
 */

/**
 * Debug specific clipping behavior with simple test
 */
function debugSpecificClipping() {
    const classValue = 1;
    const mesh = classMeshes[classValue];
    
    console.log('=== DEBUGGING CLIPPING DIRECTION ===');
    
    // Test 1: Simple plane that should keep the "front" half 
    console.log('Test 1: Keeping Z >= 0 (should show front half)');
    const planeFront = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    mesh.material.clippingPlanes = [planeFront];
    mesh.material.needsUpdate = true;
    renderer.localClippingEnabled = true;
    renderer.render(scene, camera);
    
    setTimeout(() => {
        console.log('Test 2: Keeping Z <= 0 (should show back half)');
        const planeBack = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        mesh.material.clippingPlanes = [planeBack];
        mesh.material.needsUpdate = true;
        renderer.render(scene, camera);
    }, 3000);
    
    setTimeout(() => {
        console.log('Test 3: No clipping (full model)');
        mesh.material.clippingPlanes = [];
        mesh.material.needsUpdate = true;
        renderer.localClippingEnabled = false;
        renderer.render(scene, camera);
    }, 6000);
}

/**
 * Test the corrected clipping math with known values
 */
function testClippingMath(classValue = 1) {
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
function testAllAxes(classValue = 1) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = classMeshes[classValue];
    console.log('=== TESTING ALL AXES ===');
    console.log('Watch which direction each clipping plane cuts from...');
    
    // Test X-axis clipping (constant = 0 should clip half)
    setTimeout(() => {
        console.log('Testing X-axis clipping (should clip from LEFT to RIGHT)...');
        const planeX = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        mesh.material.clippingPlanes = [planeX];
        mesh.material.needsUpdate = true;
        renderer.localClippingEnabled = true;
        renderer.render(scene, camera);
    }, 1000);
    
    // Test Y-axis clipping  
    setTimeout(() => {
        console.log('Testing Y-axis clipping (should clip from BOTTOM to TOP)...');
        const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        mesh.material.clippingPlanes = [planeY];
        mesh.material.needsUpdate = true;
        renderer.render(scene, camera);
    }, 3000);
    
    // Test Z-axis clipping
    setTimeout(() => {
        console.log('Testing Z-axis clipping (should clip from FRONT to BACK)...');
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        mesh.material.clippingPlanes = [planeZ];
        mesh.material.needsUpdate = true;
        renderer.render(scene, camera);
    }, 5000);
    
    // Clear clipping
    setTimeout(() => {
        console.log('Clearing all clipping...');
        mesh.material.clippingPlanes = [];
        mesh.material.needsUpdate = true;
        renderer.localClippingEnabled = false;
        renderer.render(scene, camera);
    }, 7000);
}

/**
 * Test clipping with very conservative planes that should definitely work
 */
function testSafeClipping(classValue = 1, percent = 50) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = classMeshes[classValue];
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
    renderer.localClippingEnabled = true;
    renderer.render(scene, camera);
    
    console.log(`Applied safe clipping - should show ${100-percent}% of model`);
}

/**
 * Debug function to understand mesh coordinate mapping
 * Call this in browser console: debugSliceCoordinates()
 */
function debugSliceCoordinates() {
    if (!meshGroup) {
        console.log('No mesh group available');
        return;
    }
    
    // Group bounds
    const groupBox = new THREE.Box3().setFromObject(meshGroup);
    const groupSize = groupBox.getSize(new THREE.Vector3());
    
    console.log('=== SLICE COORDINATE DEBUG (FIXED) ===');
    console.log('Mesh GROUP Bounding Box:', `${groupBox.min.z.toFixed(3)} to ${groupBox.max.z.toFixed(3)} (size: ${groupSize.z.toFixed(3)})`);
    
    // Individual mesh bounds
    console.log('Individual Class Mesh Bounds:');
    Object.keys(classMeshes).forEach(classValue => {
        const mesh = classMeshes[classValue];
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
function debugClippingPlanes(classValue = 1) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log('No mesh available for class', classValue);
        return;
    }
    
    const mesh = classMeshes[classValue];
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
function testBasicClipping(classValue = 1) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = classMeshes[classValue];
    console.log('=== BASIC CLIPPING TEST ===');
    
    // Create a simple clipping plane that should clip half the model
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Clips everything with Z > 0
    
    mesh.material.clippingPlanes = [plane];
    mesh.material.needsUpdate = true;
    renderer.localClippingEnabled = true;
    
    console.log('Applied basic clipping plane - half the model should be gone');
    console.log('Clipping planes count:', mesh.material.clippingPlanes.length);
    
    // Force render
    renderer.render(scene, camera);
}

/**
 * Test function to check if clipping planes persist
 * Run this immediately after moving a slider
 */
function testClippingPersistence(classValue = 1) {
    if (!classMeshes || !classMeshes[classValue]) {
        console.log('No mesh for class', classValue);
        return;
    }
    
    const mesh = classMeshes[classValue];
    console.log('=== CLIPPING PERSISTENCE TEST ===');
    console.log(`Class ${classValue} material:`, mesh.material);
    console.log(`Class ${classValue} clippingPlanes:`, mesh.material.clippingPlanes);
    console.log(`ClippingPlanes length:`, mesh.material.clippingPlanes ? mesh.material.clippingPlanes.length : 'null');
    console.log(`Renderer clipping enabled:`, renderer.localClippingEnabled);
    
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
 * =============END=================
 * ===== TESTING & DEBUGGING =======
 * =================================
 */


/**
 * Update slice direction indicator based on current model rotation
 * This provides visual feedback about which direction slicing will occur
 */
function updateSliceDirectionIndicator() {
    const indicator = document.getElementById('sliceDirectionIndicator');
    if (!indicator || !meshGroup) return;
    
    const currentDir = sliceDirection || 'z';
    
    // Get current rotation in degrees for user-friendly display
    const rotX = (meshGroup.rotation.x * 180 / Math.PI).toFixed(0);
    const rotY = (meshGroup.rotation.y * 180 / Math.PI).toFixed(0);
    const rotZ = (meshGroup.rotation.z * 180 / Math.PI).toFixed(0);
    
    // Base direction names
    const directionNames = {
        'x': 'Left ↔ Right',
        'y': 'Bottom ↔ Top', 
        'z': 'Front ↔ Back'
    };
    
    // Show both the base direction and current rotation
    const baseName = directionNames[currentDir];
    indicator.textContent = `${baseName} (rotated: ${rotY}°, ${rotX}°, ${rotZ}°)`;
    indicator.style.color = '#666';
    indicator.style.fontSize = '11px';
}

/**
 * Create a dual-handle range slider component
 * @param {number} classValue - The class number
 * @returns {HTMLElement} - The dual range slider container
 */
function createDualRangeSlider(classValue) {
    const container = document.createElement('div');
    container.className = 'dual-range-container';
    
    // Create the visual track
    const track = document.createElement('div');
    track.className = 'dual-range-track';
    
    // Create the fill area between handles
    const fill = document.createElement('div');
    fill.className = 'dual-range-fill';
    fill.id = `dualRangeFill_${classValue}`;
    
    // Create the two invisible range inputs
    const minInput = document.createElement('input');
    minInput.type = 'range';
    minInput.min = 0;
    minInput.max = 100;
    minInput.value = 0;
    minInput.className = 'dual-range-input';
    minInput.id = `dualRangeMin_${classValue}`;
    
    const maxInput = document.createElement('input');
    maxInput.type = 'range';
    maxInput.min = 0;
    maxInput.max = 100;
    maxInput.value = 100;
    maxInput.className = 'dual-range-input';
    maxInput.id = `dualRangeMax_${classValue}`;
    
    // Assemble the component
    container.appendChild(track);
    container.appendChild(fill);
    container.appendChild(minInput);
    container.appendChild(maxInput);
    
    // Set up the update function for this slider
    const updateFill = () => {
        const min = parseInt(minInput.value);
        const max = parseInt(maxInput.value);
        
        // Ensure min doesn't exceed max
        if (min > max) {
            minInput.value = max;
        }
        
        const minPercent = (minInput.value / 100) * 100;
        const maxPercent = (maxInput.value / 100) * 100;
        
        // Update the fill area
        fill.style.left = minPercent + '%';
        fill.style.width = (maxPercent - minPercent) + '%';
    };
    
    // Add event listeners
    minInput.addEventListener('input', () => {
        updateFill();
        handleClassRangeChange(classValue);
    });
    
    maxInput.addEventListener('input', () => {
        updateFill();
        handleClassRangeChange(classValue);
    });
    
    // Initialize the fill
    updateFill();
    
    return container;
}

// Updated function to setup the new individual class controls
function setupVisualizationControls() {
    console.log('Setting up individual class visualization controls');
    
    // Generate the individual control panels for each class
    generateClassControlPanels();
    
    // Initialize the slice direction indicator
    updateSliceDirectionIndicator();
    
    console.log('Individual class controls setup complete');
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
    
    // Reset individual class controls instead of shared ones
    availableClasses.forEach(classValue => {
        // Reset state
        classControlStates[classValue] = {
            visible: true,
            opacity: 80,
            rangeMin: 0,
            rangeMax: 100
        };
        
        // Reset UI controls
        const checkbox = document.getElementById(`classCheckbox_${classValue}`);
        const opacitySlider = document.getElementById(`classOpacity_${classValue}`);
        const opacityValue = document.getElementById(`classOpacityValue_${classValue}`);
        const rangeMin = document.getElementById(`dualRangeMin_${classValue}`);
        const rangeMax = document.getElementById(`dualRangeMax_${classValue}`);
        const rangeValue = document.getElementById(`classRangeValue_${classValue}`);
        
        if (checkbox) checkbox.checked = true;
        if (opacitySlider) opacitySlider.value = 80;
        if (opacityValue) opacityValue.textContent = '80%';
        if (rangeMin) rangeMin.value = 0;
        if (rangeMax) rangeMax.value = 100;
        if (rangeValue) rangeValue.textContent = '0% - 100%';
        
        // Update dual-range fill
        const fill = document.getElementById(`dualRangeFill_${classValue}`);
        if (fill) {
            fill.style.left = '0%';
            fill.style.width = '100%';
        }
        
        // Reset panel visual state
        const panel = document.querySelector(`[data-class="${classValue}"]`);
        if (panel) {
            panel.classList.remove('disabled');
        }
    });
    
    // Reset global variables
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
                // Initialize clippingPlanes if it doesn't exist, then clear it
                if (!classMesh.material.clippingPlanes) {
                    classMesh.material.clippingPlanes = [];
                } else {
                    classMesh.material.clippingPlanes = []; // Remove clipping planes
                }
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
    
    // Update slice direction indicator
    if (typeof updateSliceDirectionIndicator === 'function') {
        updateSliceDirectionIndicator();
    }
    
    // Force re-render
    if (typeof renderer !== 'undefined') {
        renderer.render(scene, camera);
    }
    
    console.log('View reset complete with individual class controls');
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