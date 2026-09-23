/**
 * Core Components Index
 *
 * Central export point for the reusable UI components the modules share.
 * These five are the whole set - a component that no module imports does
 * not belong here (tracker D16).
 *
 * Usage:
 * ```javascript
 * // Import individual components
 * import { StepNavigator, FileSelector } from '/workspace/js/core/components/index.js';
 *
 * // Or import all
 * import * as Components from '/workspace/js/core/components/index.js';
 * const nav = new Components.StepNavigator({ ... });
 * ```
 *
 * The help-panel components (InfoPanel, InfoArticle, InfoGlossary, InfoSearch)
 * live in this directory too but are loaded as plain (non-module) <script> tags from
 * workspace/index.html, and ResumeDialog is dynamically imported by
 * workspace.js - none of them go through this index.
 */

// Navigation & Layout
export { default as StepNavigator } from './StepNavigator.js';
export { default as NavigationButtons } from './NavigationButtons.js';

// Data Display
export { default as ValidationDisplay } from './ValidationDisplay.js';

// File Management
export { default as FileSelector } from './FileSelector.js';
export { default as SliceViewerChrome } from './SliceViewerChrome.js';
