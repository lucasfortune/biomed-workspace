// interactions.js - User interaction controls (mouse, keyboard, camera)
// This file handles all user interactions with the 3D visualization

import { updateSliceDirectionIndicator } from './clipping.js';
import { applyRangeToSingleClass } from './clipping.js';
import { getGlobalState } from './main.js';

/**
 * Setup enhanced controls for mesh-centered interactions
 * @param {Object} renderer - Three.js renderer
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} classControlStates - Current class control states
 */
export function setupEnhancedControls(renderer, meshGroup, classControlStates) {
    
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
    setupZoomControls(canvas);
    
    // Setup keyboard controls
    setupKeyboardControls(meshGroup, classControlStates);
    
    // Set initial cursor style
    canvas.style.cursor = 'grab';
}

/**
 * Setup mouse wheel zoom controls
 * @param {HTMLElement} canvas - The canvas element
 */
function setupZoomControls(canvas) {
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const state = getGlobalState();
        if (!state.camera) return;
        
        const zoomSpeed = 0.05;
        const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        
        // Scale camera position to zoom in/out
        state.camera.position.multiplyScalar(delta);
        
        // Prevent camera from getting too close or too far
        const distance = state.camera.position.length();
        if (distance < 1) {
            state.camera.position.normalize().multiplyScalar(1);
        } else if (distance > 100) {
            state.camera.position.normalize().multiplyScalar(100);
        }
    });
}

/**
 * Setup keyboard controls for mesh rotation
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} classControlStates - Current class control states
 */
function setupKeyboardControls(meshGroup, classControlStates) {
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
        
        // If rotation changed, update slice direction indicator and re-apply clipping
        if (rotationChanged) {
            // Update slice direction indicator
            updateSliceDirectionIndicator();
            
            // Re-apply all current slice ranges with new rotation
            if (classControlStates) {
                Object.keys(classControlStates).forEach(classValue => {
                    const state = classControlStates[classValue];
                    if (state.rangeMin !== 0 || state.rangeMax !== 100) {
                        applyRangeToSingleClass(parseInt(classValue), state.rangeMin, state.rangeMax);
                    }
                });
            }
        }
    });
}

/**
 * Setup touch controls for mobile devices
 * @param {HTMLElement} canvas - The canvas element
 * @param {Object} meshGroup - The mesh group to control
 * @param {Object} classControlStates - Current class control states
 */
export function setupTouchControls(canvas, meshGroup, classControlStates) {
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
    });
    
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
            meshGroup.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, meshGroup.rotation.x));
            
            lastTouchCenter = { x: touch.clientX, y: touch.clientY };
            
            // Update slice direction and re-apply clipping
            updateSliceDirectionIndicator();
            reapplyClippingForAllClasses(classControlStates);
            
        } else if (touches.length === 2) {
            // Two finger zoom
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (lastTouchDistance > 0) {
                const state = getGlobalState();
                if (state.camera) {
                    const scale = distance / lastTouchDistance;
                    const zoomFactor = scale > 1 ? 0.95 : 1.05; // Invert zoom direction
                    state.camera.position.multiplyScalar(zoomFactor);
                    
                    // Prevent camera from getting too close or too far
                    const cameraDistance = state.camera.position.length();
                    if (cameraDistance < 1) {
                        state.camera.position.normalize().multiplyScalar(1);
                    } else if (cameraDistance > 100) {
                        state.camera.position.normalize().multiplyScalar(100);
                    }
                }
            }
            
            lastTouchDistance = distance;
        }
    });
    
    // Touch end
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        touches = Array.from(e.touches);
        
        if (touches.length === 0) {
            lastTouchDistance = 0;
        }
    });
}

/**
 * Helper function to re-apply clipping for all classes
 * @param {Object} classControlStates - Current class control states
 */
function reapplyClippingForAllClasses(classControlStates) {
    if (classControlStates) {
        Object.keys(classControlStates).forEach(classValue => {
            const state = classControlStates[classValue];
            if (state.rangeMin !== 0 || state.rangeMax !== 100) {
                applyRangeToSingleClass(parseInt(classValue), state.rangeMin, state.rangeMax);
            }
        });
    }
}

/**
 * Setup context menu prevention (right-click menu)
 * @param {HTMLElement} canvas - The canvas element
 */
export function preventContextMenu(canvas) {
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