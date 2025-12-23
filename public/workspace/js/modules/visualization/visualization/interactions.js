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
    let previousMousePosition = { x: 0, y: 0 };

    // Mouse down event - start dragging
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    });

    // Mouse move event - handle rotation
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && meshGroup) {
            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };

            // Rotate the entire mesh group
            meshGroup.rotation.y += deltaMove.x * 0.01;
            meshGroup.rotation.x += deltaMove.y * 0.01;

            // Clamp vertical rotation to prevent flipping
            meshGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, meshGroup.rotation.x));

            previousMousePosition = { x: e.clientX, y: e.clientY };

            // Call rotation change callback if provided
            if (options.onRotationChange) {
                options.onRotationChange(meshGroup.rotation);
            }
        }
    });

    // Mouse up event - stop dragging
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });

    // Mouse leave event - stop dragging when cursor leaves canvas
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
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

        const zoomSpeed = 0.05;
        const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

        // Scale camera position to zoom in/out
        camera.position.multiplyScalar(delta);

        // Prevent camera from getting too close or too far
        const distance = camera.position.length();
        if (distance < 1) {
            camera.position.normalize().multiplyScalar(1);
        } else if (distance > 100) {
            camera.position.normalize().multiplyScalar(100);
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
        let rotationChanged = false;

        switch (event.key.toLowerCase()) {
            case 'arrowleft':
                meshGroup.rotation.y -= rotationSpeed;
                rotationChanged = true;
                event.preventDefault();
                break;
            case 'arrowright':
                meshGroup.rotation.y += rotationSpeed;
                rotationChanged = true;
                event.preventDefault();
                break;
            case 'arrowup':
                meshGroup.rotation.x -= rotationSpeed;
                rotationChanged = true;
                event.preventDefault();
                break;
            case 'arrowdown':
                meshGroup.rotation.x += rotationSpeed;
                rotationChanged = true;
                event.preventDefault();
                break;
            case 'r':
                // Reset rotation
                meshGroup.rotation.set(0, 0, 0);
                rotationChanged = true;
                break;
        }

        // If rotation changed, call callback
        if (rotationChanged && options.onRotationChange) {
            options.onRotationChange(meshGroup.rotation);
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

    // Touch start
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);

        if (touches.length === 1) {
            // Single touch - rotation
            lastTouchCenter = { x: touches[0].clientX, y: touches[0].clientY };
        } else if (touches.length === 2) {
            // Two finger touch - zoom
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
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

        } else if (touches.length === 2 && camera) {
            // Two finger zoom
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (lastTouchDistance > 0) {
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

            lastTouchDistance = distance;
        }
    }, { passive: false });

    // Touch end
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);

        if (touches.length === 0) {
            lastTouchDistance = 0;
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
