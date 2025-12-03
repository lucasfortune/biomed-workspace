// uiControls.js - User interface controls and event handlers
// This file handles all UI panel creation and user interaction events

import { getClassColor, populateClassFilter } from './utils.js';
import { applyRangeToSingleClass, updateSliceDirectionIndicator, setSliceDirection, applySliceRangeToMeshes, removeCappingMeshesForClass, applyRangeToOriginalData } from './clipping.js';
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
 * NOW ALSO creates the original data control panel
 * @param {Array} availableClasses - Array of available class numbers
 * @param {Object} classControlStates - Object to store control states
 */
export function generateClassControlPanels(availableClasses, classControlStates) {
    console.log('Generating control panels for original data and classes:', availableClasses);
    
    const container = document.getElementById('classControlPanels');
    if (!container) {
        console.error('Class control panels container not found!');
        return;
    }
    
    // Clear existing panels
    container.innerHTML = '';
    
    // NEW CODE: Create original data control panel FIRST (appears at top)
    const originalDataPanel = createOriginalDataControlPanel();
    container.appendChild(originalDataPanel);
    
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
    
    console.log('Control panels generated successfully');
}

/**
 * NEW FUNCTION: Create control panel for original data overlay
 * @returns {HTMLElement} - The created panel element
 */
export function createOriginalDataControlPanel() {
    // Create main panel div
    const panel = document.createElement('div');
    panel.className = 'class-control-panel original-data-panel';
    panel.id = 'originalDataPanel';
    
    // Create checkbox section
    const checkboxSection = document.createElement('div');
    checkboxSection.className = 'class-checkbox-section';
    checkboxSection.innerHTML = `
        <input type="checkbox" 
               class="class-checkbox" 
               id="originalDataCheckbox">
        <div class="class-label" style="color: #888;">
            Original Data
        </div>
    `;
    
    // Create opacity section
    const opacitySection = document.createElement('div');
    opacitySection.className = 'class-opacity-section';
    opacitySection.innerHTML = `
        <label class="class-opacity-label">Opacity:</label>
        <input type="range"
               class="slider class-opacity-slider"
               id="originalDataOpacity"
               min="5"
               max="100"
               value="30">
        <span class="class-opacity-value" id="originalDataOpacityValue">30%</span>
    `;

    // Create range section with dual slider
    const rangeSection = document.createElement('div');
    rangeSection.className = 'class-range-section';
    rangeSection.innerHTML = `
        <label class="class-range-label">Range:</label>
    `;

    // Create dual range slider
    const dualRangeContainer = createDualRangeSliderForOriginalData();
    rangeSection.appendChild(dualRangeContainer);

    // Add range value display
    const rangeValue = document.createElement('span');
    rangeValue.className = 'class-range-value';
    rangeValue.id = 'originalDataRangeValue';
    rangeValue.textContent = '0% - 100%';
    rangeSection.appendChild(rangeValue);

    // Assemble the panel
    panel.appendChild(checkboxSection);
    panel.appendChild(opacitySection);
    panel.appendChild(rangeSection);
    
    // Add event listeners
    setupOriginalDataListeners();
    
    return panel;
}

/**
 * NEW FUNCTION: Set up event listeners for original data control
 */
export function setupOriginalDataListeners() {
    setTimeout(() => {
        // Checkbox listener
        const checkbox = document.getElementById('originalDataCheckbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                handleOriginalDataVisibilityChange(e.target.checked);
            });
        }
        
        // Opacity slider listener
        const opacitySlider = document.getElementById('originalDataOpacity');
        const opacityValue = document.getElementById('originalDataOpacityValue');
        if (opacitySlider && opacityValue) {
            opacitySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                opacityValue.textContent = `${value}%`;
                handleOriginalDataOpacityChange(value);
            });
        }
        
        console.log('Original data control listeners set up');
    }, 10);
}

/**
 * NEW FUNCTION: Handle original data visibility change
 */
function handleOriginalDataVisibilityChange(visible) {
    const state = getGlobalState();
    
    if (state.originalDataPlaneGroup) {
        state.originalDataPlaneGroup.visible = visible;
        console.log(`Original data ${visible ? 'shown' : 'hidden'}`);
    }
}

/**
 * Handle original data opacity change
 */
function handleOriginalDataOpacityChange(value) {
    const state = getGlobalState();
    const opacity = parseInt(value) / 100;

    // Access the plane group and iterate through its children
    if (state.originalDataPlaneGroup && state.originalDataPlaneGroup.children) {
        state.originalDataPlaneGroup.children.forEach(plane => {
            if (plane.material) {
                plane.material.opacity = opacity;
                plane.material.needsUpdate = true;
            }
        });
    }
}

/**
 * NEW FUNCTION: Create a dual-handle range slider for original data
 * @returns {HTMLElement} - The dual range slider container
 */
function createDualRangeSliderForOriginalData() {
    const container = document.createElement('div');
    container.className = 'dual-range-container';

    const track = document.createElement('div');
    track.className = 'dual-range-track';

    const fill = document.createElement('div');
    fill.className = 'dual-range-fill';
    fill.id = 'dualRangeFill_original';

    const minInput = document.createElement('input');
    minInput.type = 'range';
    minInput.min = 0;
    minInput.max = 100;
    minInput.value = 0;
    minInput.className = 'dual-range-input';
    minInput.id = 'dualRangeMin_original';

    const maxInput = document.createElement('input');
    maxInput.type = 'range';
    maxInput.min = 0;
    maxInput.max = 100;
    maxInput.value = 100;
    maxInput.className = 'dual-range-input';
    maxInput.id = 'dualRangeMax_original';

    const updateFill = () => {
        const min = parseInt(minInput.value);
        const max = parseInt(maxInput.value);

        if (min > max) {
            minInput.value = max;
        }

        const minPercent = (minInput.value / 100) * 100;
        const maxPercent = (maxInput.value / 100) * 100;

        fill.style.left = minPercent + '%';
        fill.style.width = (maxPercent - minPercent) + '%';
    };

    minInput.addEventListener('input', () => {
        updateFill();
        handleOriginalDataRangeChange();
    });

    maxInput.addEventListener('input', () => {
        updateFill();
        handleOriginalDataRangeChange();
    });

    updateFill();

    container.appendChild(track);
    track.appendChild(fill);
    container.appendChild(minInput);
    container.appendChild(maxInput);

    return container;
}

/**
 * NEW FUNCTION: Handle original data range slider changes
 */
export function handleOriginalDataRangeChange() {
    const rangeMin = document.getElementById('dualRangeMin_original');
    const rangeMax = document.getElementById('dualRangeMax_original');
    const rangeValue = document.getElementById('originalDataRangeValue');

    if (!rangeMin || !rangeMax || !rangeValue) return;

    let minVal = parseInt(rangeMin.value);
    let maxVal = parseInt(rangeMax.value);

    // Ensure min doesn't exceed max
    if (minVal > maxVal) {
        minVal = maxVal;
        rangeMin.value = maxVal;
    }

    const state = getGlobalState();

    // Update state
    updateGlobalState({
        originalDataRangeMin: minVal,
        originalDataRangeMax: maxVal
    });

    // Update display
    rangeValue.textContent = `${minVal}% - ${maxVal}%`;

    // Apply range filtering to original data planes
    applyRangeToOriginalData(minVal, maxVal);
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
        
        if (visible) {
            // When making visible, reapply the stored range
            const storedRange = state.classSliceRanges && state.classSliceRanges[classValue];
            if (storedRange) {
                // Reapply the range that was set before
                applyRangeToSingleClass(classValue, storedRange.min, storedRange.max);
            } else {
                // No stored range, apply current UI range
                const rangeMin = document.getElementById(`dualRangeMin_${classValue}`);
                const rangeMax = document.getElementById(`dualRangeMax_${classValue}`);
                if (rangeMin && rangeMax) {
                    const minVal = parseInt(rangeMin.value);
                    const maxVal = parseInt(rangeMax.value);
                    applyRangeToSingleClass(classValue, minVal, maxVal);
                }
            }
        } else {
            // When hiding, just hide all slices and remove caps
            state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
                if (mesh) {
                    mesh.visible = false;
                }
            });
            // Remove caps for this class
            removeCappingMeshesForClass(classValue);
        }
    } else if (state.classMeshes && state.classMeshes[classValue]) {
        // Original system
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
    
    // NEW: Update the UI display value
    const opacityDisplay = document.getElementById(`classOpacityValue_${classValue}`);
    if (opacityDisplay) {
        opacityDisplay.textContent = opacityPercent + '%';
    }
    
    const state = getGlobalState();
    
    // Update state
    if (state.classControlStates && state.classControlStates[classValue]) {
        state.classControlStates[classValue].opacity = opacity;
    }
    
    // Handle both slice-based and original mesh systems
    if (state.sliceMeshes && state.sliceMeshes[classValue]) {
        // NEW: Slice-based system - apply opacity to all slices of this class
        
        state.sliceMeshes[classValue].forEach((mesh, sliceIndex) => {
            if (mesh && mesh.material) {
                mesh.material.opacity = opacity;
                mesh.material.transparent = true;
                mesh.material.needsUpdate = true;
            }
        });
    } else if (state.classMeshes && state.classMeshes[classValue]) {
        // Original system
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
}

/**
 * Handle slice range slider changes (legacy compatibility)
 */
export function handleSliceRangeChange() {
    
    const sliceRangeMin = document.getElementById('sliceRangeMin');
    const sliceRangeMax = document.getElementById('sliceRangeMax');
    const sliceRangeValue = document.getElementById('sliceRangeValue');
    
    if (!sliceRangeMin || !sliceRangeMax || !sliceRangeValue) {
        console.log('MISSING SLIDER ELEMENTS');
        return;
    }
    
    const minVal = parseInt(sliceRangeMin.value);
    const maxVal = parseInt(sliceRangeMax.value);
    
    let currentSliceRange;
    if (minVal > maxVal) {
        sliceRangeMin.value = maxVal;
        currentSliceRange = [maxVal, maxVal];
    } else {
        currentSliceRange = [minVal, maxVal];
    }
    
    sliceRangeValue.textContent = `${currentSliceRange[0]}% - ${currentSliceRange[1]}%`;
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
}