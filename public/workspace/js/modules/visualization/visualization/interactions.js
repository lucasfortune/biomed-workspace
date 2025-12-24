/**
 * interactions.js - User interaction controls (mouse, keyboard, touch)
 *
 * This file handles all user interactions with the 3D visualization.
 * Simplified version without clipping dependencies - those will be added in Phase 4.
 */

/**
 * Setup enhanced controls for mesh-centered interactions
 * @param {Object} renderer - Three.js renderer
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} camera - Three.js camera
 * @param {Object} options - Optional callbacks and settings
 * @param {Function} options.onRotationChange - Callback when rotation changes
 */
export function setupEnhancedControls(renderer, meshGroup, camera, options = {}) {

    const canvas = renderer.domElement;
    let isDragging = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    // Update cursor based on mode
    const updateCursor = (dragging, panning) => {
        if (dragging) {
            canvas.style.cursor = panning ? 'move' : 'grabbing';
        } else {
            canvas.style.cursor = 'grab';
        }
    };

    // Mouse down event - start dragging
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        isPanning = e.ctrlKey || e.metaKey; // CTRL or CMD for panning
        previousMousePosition = { x: e.clientX, y: e.clientY };
        updateCursor(true, isPanning);
    });

    // Mouse move event - handle rotation or panning
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && meshGroup) {
            // Check if CTRL state changed during drag
            const currentlyPanning = e.ctrlKey || e.metaKey;
            if (currentlyPanning !== isPanning) {
                isPanning = currentlyPanning;
                updateCursor(true, isPanning);
            }

            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };

            if (isPanning) {
                // Pan mode: move the mesh group in screen space
                // Scale pan speed based on camera distance for consistent feel
                const cameraDistance = camera.position.length();
                const panSpeed = cameraDistance * 0.002;

                // Get camera's right and up vectors for screen-space panning
                const right = new THREE.Vector3();
                const up = new THREE.Vector3();
                camera.getWorldDirection(new THREE.Vector3()); // Ensure matrix is updated
                right.setFromMatrixColumn(camera.matrixWorld, 0); // Camera's right vector
                up.setFromMatrixColumn(camera.matrixWorld, 1);    // Camera's up vector

                // Move mesh along camera's right and up vectors
                meshGroup.position.addScaledVector(right, deltaMove.x * panSpeed);
                meshGroup.position.addScaledVector(up, -deltaMove.y * panSpeed); // Invert Y for natural feel

                // Call pan change callback if provided
                if (options.onPanChange) {
                    options.onPanChange(meshGroup.position);
                }
            } else {
                // Rotate mode: rotate the entire mesh group
                meshGroup.rotation.y += deltaMove.x * 0.01;
                meshGroup.rotation.x += deltaMove.y * 0.01;

                // Clamp vertical rotation to prevent flipping
                meshGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, meshGroup.rotation.x));

                // Call rotation change callback if provided
                if (options.onRotationChange) {
                    options.onRotationChange(meshGroup.rotation);
                }
            }

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    // Mouse up event - stop dragging
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        isPanning = false;
        updateCursor(false, false);
    });

    // Mouse leave event - stop dragging when cursor leaves canvas
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        isPanning = false;
        updateCursor(false, false);
    });

    // Setup zoom controls
    setupZoomControls(canvas, camera);

    // Setup keyboard controls
    setupKeyboardControls(meshGroup, options);

    // Setup touch controls
    setupTouchControls(canvas, meshGroup, camera, options);

    // Prevent context menu
    preventContextMenu(canvas);

    // Set initial cursor style
    canvas.style.cursor = 'grab';

    // Return cleanup function
    return () => {
        canvas.style.cursor = 'default';
    };
}

/**
 * Setup mouse wheel zoom controls
 * @param {HTMLElement} canvas - The canvas element
 * @param {Object} camera - Three.js camera
 */
function setupZoomControls(canvas, camera) {
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        if (!camera) return;

        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

        // Scale camera position to zoom in/out
        camera.position.multiplyScalar(delta);

        // Prevent camera from getting too close or too far
        // Use very generous limits to handle meshes of any size
        const distance = camera.position.length();
        if (distance < 1) {
            camera.position.normalize().multiplyScalar(1);
        } else if (distance > 10000) {
            camera.position.normalize().multiplyScalar(10000);
        }
    }, { passive: false });
}

/**
 * Setup keyboard controls for mesh rotation
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} options - Options with callbacks
 */
function setupKeyboardControls(meshGroup, options) {
    const handleKeydown = (event) => {
        if (!meshGroup) return;

        // Ignore if user is typing in an input
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        const rotationSpeed = 0.1;
        const panSpeed = 0.2;
        let rotationChanged = false;
        let panChanged = false;

        // Check if CTRL/CMD is held for panning
        const isPanning = event.ctrlKey || event.metaKey;

        switch (event.key.toLowerCase()) {
            case 'arrowleft':
                if (isPanning) {
                    meshGroup.position.x -= panSpeed;
                    panChanged = true;
                } else {
                    meshGroup.rotation.y -= rotationSpeed;
                    rotationChanged = true;
                }
                event.preventDefault();
                break;
            case 'arrowright':
                if (isPanning) {
                    meshGroup.position.x += panSpeed;
                    panChanged = true;
                } else {
                    meshGroup.rotation.y += rotationSpeed;
                    rotationChanged = true;
                }
                event.preventDefault();
                break;
            case 'arrowup':
                if (isPanning) {
                    meshGroup.position.y += panSpeed;
                    panChanged = true;
                } else {
                    meshGroup.rotation.x -= rotationSpeed;
                    rotationChanged = true;
                }
                event.preventDefault();
                break;
            case 'arrowdown':
                if (isPanning) {
                    meshGroup.position.y -= panSpeed;
                    panChanged = true;
                } else {
                    meshGroup.rotation.x += rotationSpeed;
                    rotationChanged = true;
                }
                event.preventDefault();
                break;
            case 'r':
                // Reset rotation and position
                meshGroup.rotation.set(0, 0, 0);
                meshGroup.position.set(0, 0, 0);
                rotationChanged = true;
                panChanged = true;
                break;
        }

        // Call callbacks
        if (rotationChanged && options.onRotationChange) {
            options.onRotationChange(meshGroup.rotation);
        }
        if (panChanged && options.onPanChange) {
            options.onPanChange(meshGroup.position);
        }
    };

    document.addEventListener('keydown', handleKeydown);

    // Return cleanup function
    return () => {
        document.removeEventListener('keydown', handleKeydown);
    };
}

/**
 * Setup touch controls for mobile devices
 * @param {HTMLElement} canvas - The canvas element
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} camera - Three.js camera
 * @param {Object} options - Options with callbacks
 */
function setupTouchControls(canvas, meshGroup, camera, options) {
    let touches = [];
    let lastTouchDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    let lastTwoFingerCenter = { x: 0, y: 0 };
    let isPinching = false;

    // Calculate center point between two touches
    const getTwoFingerCenter = (t1, t2) => ({
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    });

    // Touch start
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);

        if (touches.length === 1) {
            // Single touch - rotation
            lastTouchCenter = { x: touches[0].clientX, y: touches[0].clientY };
        } else if (touches.length === 2) {
            // Two finger touch - zoom and pan
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
            lastTwoFingerCenter = getTwoFingerCenter(touches[0], touches[1]);
            isPinching = false;
        }
    }, { passive: false });

    // Touch move
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);

        if (touches.length === 1 && meshGroup) {
            // Single touch rotation
            const touch = touches[0];
            const deltaMove = {
                x: touch.clientX - lastTouchCenter.x,
                y: touch.clientY - lastTouchCenter.y
            };

            meshGroup.rotation.y += deltaMove.x * 0.01;
            meshGroup.rotation.x += deltaMove.y * 0.01;

            // Clamp vertical rotation
            meshGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, meshGroup.rotation.x));

            lastTouchCenter = { x: touch.clientX, y: touch.clientY };

            // Call callback
            if (options.onRotationChange) {
                options.onRotationChange(meshGroup.rotation);
            }

        } else if (touches.length === 2 && camera && meshGroup) {
            // Two finger - zoom (pinch) and pan (drag)
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const center = getTwoFingerCenter(touches[0], touches[1]);

            if (lastTouchDistance > 0) {
                // Detect if pinching (distance changing) or panning (center moving)
                const distanceChange = Math.abs(distance - lastTouchDistance);
                const centerDelta = {
                    x: center.x - lastTwoFingerCenter.x,
                    y: center.y - lastTwoFingerCenter.y
                };
                const centerMove = Math.sqrt(centerDelta.x * centerDelta.x + centerDelta.y * centerDelta.y);

                // If pinching more than panning, zoom
                if (distanceChange > centerMove * 0.5 || isPinching) {
                    isPinching = true;
                    const scale = distance / lastTouchDistance;
                    const zoomFactor = scale > 1 ? 0.95 : 1.05;
                    camera.position.multiplyScalar(zoomFactor);

                    // Prevent camera from getting too close or too far
                    const cameraDistance = camera.position.length();
                    if (cameraDistance < 1) {
                        camera.position.normalize().multiplyScalar(1);
                    } else if (cameraDistance > 100) {
                        camera.position.normalize().multiplyScalar(100);
                    }
                }

                // Pan based on center movement (always allow some panning)
                if (centerMove > 2) {
                    const cameraDistance = camera.position.length();
                    const panSpeed = cameraDistance * 0.002;

                    // Get camera's right and up vectors for screen-space panning
                    const right = new THREE.Vector3();
                    const up = new THREE.Vector3();
                    camera.getWorldDirection(new THREE.Vector3());
                    right.setFromMatrixColumn(camera.matrixWorld, 0);
                    up.setFromMatrixColumn(camera.matrixWorld, 1);

                    // Move mesh along camera's right and up vectors
                    meshGroup.position.addScaledVector(right, centerDelta.x * panSpeed);
                    meshGroup.position.addScaledVector(up, -centerDelta.y * panSpeed);

                    if (options.onPanChange) {
                        options.onPanChange(meshGroup.position);
                    }
                }
            }

            lastTouchDistance = distance;
            lastTwoFingerCenter = center;
        }
    }, { passive: false });

    // Touch end
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);

        if (touches.length === 0) {
            lastTouchDistance = 0;
            isPinching = false;
        } else if (touches.length === 1) {
            // Transition from two fingers to one - update single touch position
            lastTouchCenter = { x: touches[0].clientX, y: touches[0].clientY };
            lastTouchDistance = 0;
            isPinching = false;
        }
    }, { passive: false });
}

/**
 * Setup context menu prevention (right-click menu)
 * @param {HTMLElement} canvas - The canvas element
 */
function preventContextMenu(canvas) {
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}

/**
 * Setup double-click reset functionality
 * @param {HTMLElement} canvas - The canvas element
 * @param {Function} resetViewFunction - Function to call for reset
 */
export function setupDoubleClickReset(canvas, resetViewFunction) {
    canvas.addEventListener('dblclick', (e) => {
        e.preventDefault();
        resetViewFunction();
    });
}
