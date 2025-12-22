/**
 * Core Module Exports
 *
 * Central export point for all core module framework components.
 * Import from this file to get access to BaseModule and UI components.
 *
 * Usage:
 * ```javascript
 * // Import base module
 * import { BaseModule } from '/workspace/js/core/index.js';
 *
 * // Import specific components
 * import { StepNavigator, MetricCard } from '/workspace/js/core/index.js';
 *
 * // Import everything
 * import * as Core from '/workspace/js/core/index.js';
 * ```
 */

// Base class for all modules
export { default as BaseModule } from './BaseModule.js';

// UI Components
export {
  StepNavigator,
  NavigationButtons,
  MetricCard,
  ValidationDisplay,
  ProgressIndicator,
  LoadingOverlay,
  FileSelector,
  ComponentRegistry,
  getComponent,
  initGlobals
} from './components/index.js';
