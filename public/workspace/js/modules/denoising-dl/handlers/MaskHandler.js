/**
 * MaskHandler.js - Mask Management for DL Denoising Module
 *
 * Handles mask visualization, parameter updates, and mask regeneration
 * for autoStructN2V denoising method.
 */

import MaskVisualization from '../components/MaskVisualization.js';
import MaskParameterPanel from '../components/MaskParameterPanel.js';

class MaskHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Initialize mask visualization components
   * Called when mask extraction completes
   */
  initializeMaskUI() {
    console.log('[MaskHandler] Initializing mask UI...');

    // Show interim mask section
    const maskSection = document.getElementById('interimMaskSection');
    if (maskSection) {
      maskSection.style.display = 'block';
    }

    // Initialize mask visualization
    const vizContainer = document.getElementById('maskVisualizationContainer');
    if (vizContainer) {
      this.module.maskVisualization = new MaskVisualization({
        containerId: 'maskVisualizationContainer'
      });
      vizContainer.innerHTML = this.module.maskVisualization.render();
    }

    // Initialize mask parameter panel
    const paramContainer = document.getElementById('maskParameterContainer');
    if (paramContainer) {
      this.module.maskParameterPanel = new MaskParameterPanel({
        containerId: 'maskParameterContainer',
        parameters: this.module.trainingConfig.maskExtractor,
        onRegenerateMask: () => this.regenerateMask(),
        onParameterChange: (name, value) => this.updateMaskParameter(name, value)
      });
      paramContainer.innerHTML = this.module.maskParameterPanel.render();
    }
  }

  /**
   * Update mask visualization with new data
   * @param {Object} data - Mask data including grid, kernelSize, activePixels, pattern
   */
  updateMaskVisualization(data) {
    this.module.maskData = data;

    if (this.module.maskVisualization) {
      this.module.maskVisualization.setMaskData(data);
      this.module.maskVisualization.refresh();
    }

    // Show/hide approve button based on mask state
    const approveBtn = document.getElementById('approveMaskBtn');
    if (approveBtn) {
      approveBtn.style.display = data.isEmpty ? 'none' : 'inline-block';
    }
  }

  /**
   * Create a mask grid representation for visualization
   * This is a simplified representation - actual mask loaded from file
   * @param {number} kernelSize - Size of the kernel
   * @param {number} activePixels - Number of active pixels
   * @param {string} pattern - Pattern type
   * @returns {Array<Array<boolean>>} Mask grid
   */
  createMaskGrid(kernelSize, activePixels, pattern) {
    const size = kernelSize || 11;
    const grid = [];

    for (let i = 0; i < size; i++) {
      const row = [];
      for (let j = 0; j < size; j++) {
        row.push(false);
      }
      grid.push(row);
    }

    // Create a simple pattern based on active pixels count
    const center = Math.floor(size / 2);

    if (pattern === 'cross' || pattern === 'plus') {
      // Horizontal and vertical lines
      for (let i = 0; i < size; i++) {
        grid[center][i] = true;
        grid[i][center] = true;
      }
    } else if (pattern === 'diagonal') {
      // Diagonal lines
      for (let i = 0; i < size; i++) {
        if (i < size) grid[i][i] = true;
        if (size - 1 - i >= 0) grid[i][size - 1 - i] = true;
      }
    } else {
      // Random-ish pattern based on active pixel count
      let count = 0;
      const maxPixels = activePixels || 10;

      // Start from center and spread out
      for (let r = 0; r <= center && count < maxPixels; r++) {
        for (let dx = -r; dx <= r && count < maxPixels; dx++) {
          for (let dy = -r; dy <= r && count < maxPixels; dy++) {
            if (Math.abs(dx) === r || Math.abs(dy) === r) {
              const x = center + dx;
              const y = center + dy;
              if (x >= 0 && x < size && y >= 0 && y < size && !grid[x][y]) {
                if (Math.random() < 0.5 || r === 0) {
                  grid[x][y] = true;
                  count++;
                }
              }
            }
          }
        }
      }
    }

    return grid;
  }

  /**
   * Toggle mask parameters panel
   */
  toggleMaskParameters() {
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.toggle();
    }
  }

  /**
   * Show mask parameters panel (from warning)
   */
  showMaskParameters() {
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.expand();
    }
  }

  /**
   * Update a mask parameter
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  updateMaskParameter(name, value) {
    console.log('[MaskHandler] Updating mask parameter:', name, value);

    // Update local config
    this.module.trainingConfig.maskExtractor[name] = value;

    // Update parameter panel
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.updateParameter(name, value);
    }
  }

  /**
   * Reset mask parameters to defaults
   */
  resetMaskParameters() {
    this.module.trainingConfig.maskExtractor = {
      adaptive_thresholding: true,
      base_percentile: 50,
      percentile_decay: 1.15,
      max_masked_pixels: 25
    };

    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.resetToDefaults();
    }
  }

  /**
   * Regenerate mask with current parameters
   */
  async regenerateMask() {
    if (!this.module.trainingId) {
      this.module.state.notify('error', 'No active training session');
      return;
    }

    console.log('[MaskHandler] Regenerating mask with params:', this.module.trainingConfig.maskExtractor);

    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.setRegenerating(true);
    }

    try {
      const result = await this.module.api.regenerateMask(
        this.module.trainingId,
        this.module.trainingConfig.maskExtractor
      );

      if (result.success) {
        // Convert maskArray to boolean mask for visualization
        const maskResult = result.mask;
        let maskData;
        if (maskResult.maskArray && Array.isArray(maskResult.maskArray)) {
          maskData = maskResult.maskArray.map(row => row.map(val => Boolean(val)));
        } else {
          // Fallback to mock grid
          maskData = this.createMaskGrid(maskResult.kernelSize, maskResult.activePixels, maskResult.pattern);
        }

        this.updateMaskVisualization({
          mask: maskData,
          kernelSize: maskResult.kernelSize,
          activePixels: maskResult.activePixels,
          pattern: maskResult.pattern,
          isEmpty: maskResult.activePixels < 2
        });
        this.module.state.notify('success', 'Mask regenerated');
      } else {
        throw new Error(result.error || 'Failed to regenerate mask');
      }
    } catch (error) {
      console.error('[MaskHandler] Error regenerating mask:', error);
      this.module.state.notify('error', `Failed to regenerate mask: ${error.message}`);
    } finally {
      if (this.module.maskParameterPanel) {
        this.module.maskParameterPanel.setRegenerating(false);
      }
    }
  }

  /**
   * Approve current mask and continue to Stage 2
   */
  async approveMask() {
    console.log('[MaskHandler] Mask approved, triggering Stage 2 training...');

    if (!this.module.trainingId) {
      this.module.state.notify('error', 'No active training session');
      return;
    }

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Update stage 2 status
    this.module.updateStageStatus('stage2', 'training', 'Starting...');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Starting Stage 2 training...';
    }

    // Update training progress status
    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Starting Stage 2 training...');
    }

    try {
      // Call backend to continue training with Stage 2
      const result = await this.module.api.continueTraining(this.module.trainingId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to continue training');
      }

      this.module.state.notify('info', 'Mask approved. Stage 2 training started.');
      // Socket.IO handlers will update the UI with Stage 2 progress
    } catch (error) {
      console.error('[MaskHandler] Error continuing training:', error);
      this.module.state.notify('error', `Failed to start Stage 2: ${error.message}`);

      // Reset UI state on error
      this.module.updateStageStatus('stage2', 'pending', 'Pending');
      if (maskActions) {
        maskActions.style.display = 'block';
      }
    }
  }

  /**
   * Skip Stage 2 and use N2V results
   */
  skipStage2() {
    console.log('[MaskHandler] Skipping Stage 2, using N2V results');

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Update stage 2 status to skipped
    this.module.updateStageStatus('stage2', 'skipped', 'Skipped');

    // Show results section with Stage 1 only
    const resultsSection = document.getElementById('autoStructResultsSection');
    if (resultsSection) {
      resultsSection.style.display = 'block';
    }

    this.module.state.notify('info', 'Stage 2 skipped. Using N2V results.');

    // The training should complete with just Stage 1 results
  }
}

export default MaskHandler;
