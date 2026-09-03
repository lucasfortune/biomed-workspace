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

    // Initialize mask visualization
    const vizContainer = document.getElementById('maskVisualizationContainer');
    if (vizContainer) {
      this.module.maskVisualization = new MaskVisualization({
        containerId: 'maskVisualizationContainer'
      });
      // Use outerHTML to replace placeholder, avoiding duplicate IDs
      vizContainer.outerHTML = this.module.maskVisualization.render();
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
      // Use outerHTML to replace placeholder, avoiding duplicate IDs
      paramContainer.outerHTML = this.module.maskParameterPanel.render();
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

    // Approving always works: an empty/1x1 mask or an N2V route simply
    // continues as plain N2V (the same mechanism with a center-pixel mask).
    // When the route already IS N2V, the force-N2V override is redundant,
    // so hide it and let the approve button carry the N2V label.
    const routedToN2V = data.isEmpty || data.branch === 'n2v';
    const approveBtn = document.getElementById('approveMaskBtn');
    if (approveBtn) {
      approveBtn.textContent = routedToN2V ? 'Continue with N2V' : 'Approve & Train';
    }
    const forceBtn = document.getElementById('forceN2VBtn');
    if (forceBtn) {
      forceBtn.style.display = routedToN2V ? 'none' : 'inline-block';
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
   * Render the routing decision card (branch, reason, gate metrics)
   * @param {Object} data - Payload with branch/routeReason/routeMessage/
   *   dmax/dmaxThreshold/maskRho2
   */
  renderRouteDecision(data) {
    const card = document.getElementById('routeDecisionCard');
    if (!card || !data || !data.branch) return;

    const isStruct = data.branch === 'structn2v';
    const branchLabel = isStruct ? 'StructN2V (discovered mask)' : 'Plain N2V (no structured mask)';
    const fmt = (v, digits = 4) => (v == null ? 'n/a' : Number(v).toFixed(digits));

    const metrics = [];
    if (data.dmax != null) {
      metrics.push(`<span class="route-metric" title="Directional correlation statistic measured on the background ACF">
        Directionality D<sub>max</sub>: <strong>${fmt(data.dmax)}</strong>
        (gate ${fmt(data.dmaxThreshold, 3)})</span>`);
    }
    if (isStruct && data.maskRho2 != null) {
      metrics.push(`<span class="route-metric" title="Fraction of the center pixel's noise variance the mask covers">
        Mask leak coverage &Sigma;&rho;&sup2;: <strong>${fmt(data.maskRho2, 3)}</strong></span>`);
    }

    card.innerHTML = `
      <div class="route-decision-header">
        <span class="route-badge ${isStruct ? 'route-struct' : 'route-n2v'}">${branchLabel}</span>
      </div>
      <p class="route-message">${data.routeMessage || ''}</p>
      ${metrics.length ? `<div class="route-metrics">${metrics.join('')}</div>` : ''}
      ${!isStruct ? `<p class="route-note">The noise carries no usable directional structure, so plain
        blind-spot training is the right model here. Approving continues with N2V.</p>` : ''}
    `;
    card.style.display = 'block';
  }

  /**
   * Update a mask parameter
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  updateMaskParameter(name, value) {
    // Update local config
    this.module.trainingConfig.maskExtractor[name] = value;

    // Update parameter panel's value display
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.updateParameter(name, value);
    }
  }

  /**
   * Reset mask parameters to defaults
   */
  resetMaskParameters() {
    // Keep the run's bg_side (the one required input); reset the tunables
    // to the published defaults.
    const bgSide = this.module.trainingConfig.maskExtractor?.bg_side;
    this.module.trainingConfig.maskExtractor = {
      bg_side: bgSide,
      rho_floor: 0.05,
      spine_thresh: 8.0,
      max_pixels: null
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

        // Regeneration re-runs the router too - refresh the decision card
        this.renderRouteDecision(maskResult);

        this.updateMaskVisualization({
          mask: maskData,
          kernelSize: maskResult.kernelSize,
          kernelHeight: maskResult.kernelHeight,
          kernelWidth: maskResult.kernelWidth,
          activePixels: maskResult.activePixels,
          pattern: maskResult.pattern,
          isEmpty: maskResult.isEmpty != null ? maskResult.isEmpty : maskResult.activePixels < 2,
          branch: maskResult.branch
        });

        // Refresh workspace file browser to show regenerated mask file
        if (window.workspace?.fileBrowser) {
          window.workspace.fileBrowser.refresh();
        }

        this.module.state.notify('info', 'Mask regenerated');
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
   * Approve current mask and continue training with it
   */
  async approveMask() {
    console.log('[MaskHandler] Mask approved, starting training...');

    // Update mask status badge to "Approved"
    this.module.updateStageStatus('mask', 'completed', 'Approved');

    if (!this.module.trainingId) {
      this.module.state.notify('error', 'No active training session');
      return;
    }

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Update training status
    this.module.updateStageStatus('train', 'training', 'Starting...');
    const statusText = document.getElementById('trainStatusText');
    if (statusText) {
      statusText.textContent = 'Starting training...';
    }
    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Starting training...');
    }

    // Disable mask parameter controls since training is starting
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.setDisabled(true);
    }

    try {
      // Run the single routed training with the approved mask
      const result = await this.module.api.continueTraining(this.module.trainingId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to continue training');
      }

      this.module.state.notify('info', 'Mask approved. Training started.');
      // Socket.IO handlers will update the UI with training progress
    } catch (error) {
      console.error('[MaskHandler] Error continuing training:', error);
      this.module.state.notify('error', `Failed to start training: ${error.message}`);

      // Reset UI state on error
      this.module.updateStageStatus('train', 'pending', 'Pending');
      if (maskActions) {
        maskActions.style.display = 'block';
      }
    }
  }

  /**
   * Override the routing decision and train plain N2V instead of the
   * discovered structural mask (the old "Skip Stage 2" action)
   */
  async skipStage2() {
    console.log('[MaskHandler] Overriding route: training plain N2V');

    if (!this.module.trainingId) {
      this.module.state.notify('error', 'No active training session');
      return;
    }

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Reflect the override in the UI
    this.module.updateStageStatus('mask', 'completed', 'Overridden to N2V');
    this.module.updateStageStatus('train', 'training', 'Starting...');
    this.module.setTrainSectionBranch('n2v');

    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Starting plain N2V training...');
    }

    // Disable mask parameter controls
    if (this.module.maskParameterPanel) {
      this.module.maskParameterPanel.setDisabled(true);
    }

    try {
      // Backend endpoint keeps its historic name; it now trains the N2V
      // branch (1x1 center kernel) via continue_training with an override.
      const result = await this.module.api.skipStage2(this.module.trainingId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start N2V training');
      }

      console.log('[MaskHandler] Force N2V started:', result);
      this.module.state.notify('info', 'Training started with plain N2V.');

      // Socket.IO events will handle the rest of the UI updates
    } catch (error) {
      console.error('[MaskHandler] Error forcing N2V:', error);
      this.module.state.notify('error', `Failed to start N2V training: ${error.message}`);

      // Reset UI state on error
      this.module.updateStageStatus('train', 'pending', 'Pending');
      if (maskActions) {
        maskActions.style.display = 'block';
      }
      if (this.module.maskParameterPanel) {
        this.module.maskParameterPanel.setDisabled(false);
      }
    }
  }
}

export default MaskHandler;
