/**
 * Core Components Index
 *
 * Central export point for all reusable UI components.
 * Import components individually or as a collection.
 *
 * Usage:
 * ```javascript
 * // Import individual components
 * import { StepNavigator, MetricCard } from '/workspace/js/core/components/index.js';
 *
 * // Or import all
 * import * as Components from '/workspace/js/core/components/index.js';
 * const nav = new Components.StepNavigator({ ... });
 * ```
 */

// Navigation & Layout
export { default as StepNavigator } from './StepNavigator.js';
export { default as NavigationButtons } from './NavigationButtons.js';

// Data Display
export { default as MetricCard } from './MetricCard.js';
export { default as ValidationDisplay } from './ValidationDisplay.js';

// Progress & Loading
export { default as ProgressIndicator } from './ProgressIndicator.js';
export { default as LoadingOverlay } from './LoadingOverlay.js';

// File Management
export { default as FileSelector } from './FileSelector.js';

/**
 * Component Registry
 * For runtime component lookup by name
 */
export const ComponentRegistry = {
  StepNavigator: () => import('./StepNavigator.js').then(m => m.default),
  NavigationButtons: () => import('./NavigationButtons.js').then(m => m.default),
  MetricCard: () => import('./MetricCard.js').then(m => m.default),
  ValidationDisplay: () => import('./ValidationDisplay.js').then(m => m.default),
  ProgressIndicator: () => import('./ProgressIndicator.js').then(m => m.default),
  LoadingOverlay: () => import('./LoadingOverlay.js').then(m => m.default),
  FileSelector: () => import('./FileSelector.js').then(m => m.default)
};

/**
 * Get component by name (async)
 * @param {string} name - Component name
 * @returns {Promise<class>}
 */
export async function getComponent(name) {
  if (ComponentRegistry[name]) {
    return ComponentRegistry[name]();
  }
  throw new Error(`Component not found: ${name}`);
}

/**
 * Initialize all components on window for global access
 * Call this if you need global access without ES6 imports
 */
export function initGlobals() {
  if (typeof window !== 'undefined') {
    Promise.all([
      import('./StepNavigator.js'),
      import('./NavigationButtons.js'),
      import('./MetricCard.js'),
      import('./ValidationDisplay.js'),
      import('./ProgressIndicator.js'),
      import('./LoadingOverlay.js'),
      import('./FileSelector.js')
    ]).then(([
      StepNavigator,
      NavigationButtons,
      MetricCard,
      ValidationDisplay,
      ProgressIndicator,
      LoadingOverlay,
      FileSelector
    ]) => {
      window.StepNavigator = StepNavigator.default;
      window.NavigationButtons = NavigationButtons.default;
      window.MetricCard = MetricCard.default;
      window.ValidationDisplay = ValidationDisplay.default;
      window.ProgressIndicator = ProgressIndicator.default;
      window.LoadingOverlay = LoadingOverlay.default;
      window.FileSelector = FileSelector.default;
      console.log('[Components] All components registered globally');
    });
  }
}
