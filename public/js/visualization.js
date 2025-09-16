// visualization.js - New main entry point that imports all modules
// This replaces your large visualization.js file

// Import the main initialization function
import { initialize3DVisualization, resetView } from './visualization/main.js';

// Make the main function available globally so your HTML can call it
window.initialize3DVisualization = initialize3DVisualization;
window.resetView = resetView;

// You can also import and expose other functions that need to be called from HTML
// For example, if you have buttons that call specific functions:
import { getGlobalState } from './visualization/main.js';
window.getVisualizationState = getGlobalState;

// Import debug functions if needed for console testing
import * as debugModule from './visualization/debug.js';
window.debugVisualization = debugModule;

console.log('Visualization modules loaded successfully');