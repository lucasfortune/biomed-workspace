// uiControls.js - User interface controls and event handlers
// This file handles all UI panel creation and user interaction events

import { getClassColor, populateClassFilter } from './utils.js';
import { applyRangeToSingleClass, updateSliceDirectionIndicator, setSliceDirection, applySliceRangeToMeshes } from './clipping.js';
import { getGlobalState, updateGlobalState } from './main.js';

/**
 * Setup visualization controls - main entry point for UI setup
 * @param {Array} availableClasses - Array of available class numbers
 * @param {Object} classMeshes - Object containing class meshes
 * @param {Object} classControlStates - Object to store control states
 */
export function setupVisualizationControls(availableClasses, classMeshes, classControlStates) {
    console.log('Setting up individual class visualization controls');
    
    // Generate the individual control panels for each class
    generateClassControlPanels(availableClasses, classControlStates);
    
    // Initialize the slice direction indicator
    updateSliceDirectionIndicator();
    
    console.log('Individual class controls setup complete');
}

/**
 * Generate individual control panels for each class
 * This replaces the old shared control system
 * @param {Array} availableClasses - Array of available class numbers
 * @param {Object} classControlStates - Object to store control states
 */
export function generateClassControlPanels(availableClasses, classControlStates) {
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
export function createClassControlPanel(classValue) {
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
export function setupClassControlListeners(classValue) {
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
 * Create a dual-handle range slider component
 * @param {number} classValue - The class number
 * @returns {HTMLElement} - The dual range slider container
 */
export function createDualRangeSlider(classValue) {
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

/**
 * Handle class visibility checkbox changes
 * @param {number} classValue - The class number
 * @param {boolean} visible - Whether the class should be visible
 */
export function handleClassVisibilityChange(classValue, visible) {
    console.log(`Toggling class ${classValue} visibility: ${visible}`);
    
    const state = getGlobalState();
    
    // Update state
    if (visible && !state.visibleClasses.includes(classValue)) {
        state.visibleClasses.push(classValue);
    } else if (!visible && state.visibleClasses.includes(classValue)) {
        const index = state.visibleClasses.indexOf(classValue);
        state.visibleClasses.splice(index, 1);
    }
    
    // Handle both slice-based and original mesh systems
    if (state.sliceMeshes && state.sliceMeshes[classValue]) {
        // NEW: Slice-based system
        console.log(`Updating slice visibility for class ${classValue}`);
        
        // Get current visible slice range
        const sliceRange = state.sliceMetadata ? state.sliceMetadata.visibleSliceRange : [0, 19];
        
        state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
            if (mesh) {
                const inSliceRange = (sliceIndex >= sliceRange[0] && sliceIndex <= sliceRange[1]);
                mesh.visible = visible && inSliceRange;
            }
        });
    } else if (state.classMeshes && state.classMeshes[classValue]) {
        // Original system
        console.log(`Updating visibility for class ${classValue}`);
        state.classMeshes[classValue].visible = visible;
    }
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Handle opacity change for a specific class
 * @param {number} classValue - The class number
 * @param {string} opacityValue - The new opacity value (0-100)
 */
export function handleClassOpacityChange(classValue, opacityPercent) {
    const opacity = opacityPercent / 100;
    console.log(`Class ${classValue} opacity changed to: ${opacity}`);
    
    const state = getGlobalState();
    
    // Update state
    if (state.classControlStates && state.classControlStates[classValue]) {
        state.classControlStates[classValue].opacity = opacity;
    }
    
    // Handle both slice-based and original mesh systems
    if (state.sliceMeshes && state.sliceMeshes[classValue]) {
        // NEW: Slice-based system - apply opacity to all slices of this class
        console.log(`Updating opacity for all slices of class ${classValue}`);
        
        state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
            if (mesh && mesh.material) {
                mesh.material.opacity = opacity;
                mesh.material.transparent = true;
                mesh.material.needsUpdate = true;
            }
        });
    } else if (state.classMeshes && state.classMeshes[classValue]) {
        // Original system
        console.log(`Updating opacity for class ${classValue} mesh`);
        const classMesh = state.classMeshes[classValue];
        if (classMesh.material) {
            classMesh.material.opacity = opacity;
            classMesh.material.transparent = true;
            classMesh.material.needsUpdate = true;
        }
    }
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Handle range slider changes for a specific class (updated for dual-handle slider)
 * @param {number} classValue - The class number
 */
export function handleClassRangeChange(classValue) {
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
    
    const state = getGlobalState();
    
    // Update our state
    state.classControlStates[classValue].rangeMin = minVal;
    state.classControlStates[classValue].rangeMax = maxVal;
    
    // Update display
    rangeValue.textContent = `${minVal}% - ${maxVal}%`;
    
    console.log(`Class ${classValue} range changed to: ${minVal}% - ${maxVal}%`);
    
    // Apply range filtering to this specific class
    applyRangeToSingleClass(classValue, minVal, maxVal);
}

/**
 * Handle general opacity change (legacy function for compatibility)
 * @param {Event} e - The input event
 */
export function handleOpacityChange(e) {
    const opacity = e.target.value / 100;
    const opacityValue = document.getElementById('opacityValue');
    
    if (opacityValue) {
        opacityValue.textContent = e.target.value + '%';
    }
    
    console.log('Opacity changed to:', opacity);
    
    const state = getGlobalState();
    
    // Apply opacity to all visible class meshes
    if (state.classMeshes) {
        Object.keys(state.classMeshes).forEach(classValue => {
            const classMesh = state.classMeshes[classValue];
            if (classMesh.visible && classMesh.material) {
                classMesh.material.opacity = opacity;
                classMesh.material.transparent = true;
                classMesh.material.needsUpdate = true;
                classMesh.userData.originalOpacity = opacity;
            }
        });
        
        console.log('Applied opacity to all visible class meshes');
        
        // Force re-render
        if (state.renderer && state.scene && state.camera) {
            state.renderer.render(state.scene, state.camera);
        }
    } else {
        console.log('No class meshes available for opacity change');
    }
}

/**
 * Handle class filter dropdown change
 * @param {Event} e - The change event
 */
export function handleClassFilterChange(e) {
    console.log('Class filter changed to:', e.target.value);
    
    const state = getGlobalState();
    
    if (e.target.value === 'all') {
        // Show all classes
        state.visibleClasses = [...state.availableClasses];
        Object.keys(state.classMeshes).forEach(classValue => {
            state.classMeshes[classValue].visible = true;
        });
    } else {
        // Show only selected class
        const selectedClass = parseInt(e.target.value);
        state.visibleClasses = [selectedClass];
        
        Object.keys(state.classMeshes).forEach(classValue => {
            const classValueInt = parseInt(classValue);
            state.classMeshes[classValue].visible = (classValueInt === selectedClass);
        });
    }
    
    // Update global state
    updateGlobalState({ visibleClasses: state.visibleClasses });
    
    console.log('Visible classes updated to:', state.visibleClasses);
    console.log('Mesh visibility updated');
    
    // Force re-render
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}

/**
 * Handle slice direction dropdown change
 * @param {Event} e - The change event
 */
export function handleSliceDirectionChange(e) {
    const newDirection = e.target.value;
    setSliceDirection(newDirection);
    console.log(`Slice direction changed via UI to: ${newDirection}`);
}

/**
 * Handle slice range slider changes (legacy compatibility)
 */
export function handleSliceRangeChange() {
    console.log('=== handleSliceRangeChange CALLED ===');
    
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (!sliceRangeMin || !sliceRangeMax || !sliceRangeValue) {
        console.log('MISSING SLIDER ELEMENTS');
        return;
    }
    
    const minVal = parseInt(sliceRangeMin.value);
    const maxVal = parseInt(sliceRangeMax.value);
    
    console.log('Slice range change:', minVal, 'to', maxVal);
    
    let currentSliceRange;
    if (minVal > maxVal) {
        sliceRangeMin.value = maxVal;
        currentSliceRange = [maxVal, maxVal];
    } else {
        currentSliceRange = [minVal, maxVal];
    }
    
    sliceRangeValue.textContent = `${currentSliceRange[0]}% - ${currentSliceRange[1]}%`;
    console.log('About to call applySliceRangeToMeshes with:', currentSliceRange);
    
    // Apply slice-based filtering to meshes with current direction
    applySliceRangeToMeshes(currentSliceRange);
}

/**
 * Reset slice range to full (0% - 100%)
 */
export function resetSliceRange() {
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (sliceRangeMin) sliceRangeMin.value = 0;
    if (sliceRangeMax) sliceRangeMax.value = 100;
    if (sliceRangeValue) sliceRangeValue.textContent = '0% - 100%';
    
    const currentSliceRange = [0, 100];
    
    const state = getGlobalState();
    
    // Remove all clipping planes (show full mesh)
    if (state.classMeshes) {
        Object.keys(state.classMeshes).forEach(classValue => {
            const classMesh = state.classMeshes[classValue];
            if (classMesh.material) {
                classMesh.material.clippingPlanes = [];
                classMesh.material.needsUpdate = true;
            }
        });
    }
    
    // Disable clipping
    if (state.renderer) {
        state.renderer.localClippingEnabled = false;
    }
    
    console.log('Slice range reset to full view');
}