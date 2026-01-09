/**
 * ChartHandler.js - Chart Management for Segmentation Module
 *
 * Handles chart updates during training.
 * Converted from global functions to ES6 class for better maintainability.
 */

class ChartHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Update training charts with new epoch data
   * @param {number} epoch - Current epoch number
   * @param {Object} metrics - Training metrics
   */
  updateCharts(epoch, metrics) {
    // Get charts from module instance
    if (!this.module.lossChart || !this.module.diceChart) {
      console.warn('[ChartHandler] Charts not initialized in module, skipping update');
      return;
    }

    const lossChart = this.module.lossChart;
    const diceChart = this.module.diceChart;

    // Validate epoch - must be > 0 (epoch 0 is just initialization, not real training data)
    if (epoch == null || epoch <= 0) {
      return;
    }

    // Validate metrics
    if (!metrics || typeof metrics !== 'object') {
      console.warn('[ChartHandler] Invalid metrics data:', metrics);
      return;
    }

    try {
      // Update loss chart
      if (metrics.train_loss !== undefined && metrics.val_loss !== undefined &&
        !isNaN(metrics.train_loss) && !isNaN(metrics.val_loss)) {
        // Skip if this epoch already exists (avoid duplicates on resume)
        if (!lossChart.data.labels.includes(epoch)) {
          lossChart.data.labels.push(epoch);
          lossChart.data.datasets[0].data.push(metrics.train_loss);
          lossChart.data.datasets[1].data.push(metrics.val_loss);
          lossChart.update('none'); // Use 'none' mode for better performance
        }
      }

      // Update dice chart
      if (metrics.train_dice !== undefined && metrics.val_dice !== undefined &&
        !isNaN(metrics.train_dice) && !isNaN(metrics.val_dice)) {
        // Skip if this epoch already exists (avoid duplicates on resume)
        if (!diceChart.data.labels.includes(epoch)) {
          diceChart.data.labels.push(epoch);
          diceChart.data.datasets[0].data.push(metrics.train_dice);
          diceChart.data.datasets[1].data.push(metrics.val_dice);
          diceChart.update('none'); // Use 'none' mode for better performance
        }
      }
    } catch (error) {
      console.error('[ChartHandler] Error updating charts:', error);
    }
  }

  /**
   * Clear all chart data (for reset workflow)
   */
  clearCharts() {
    if (this.module.lossChart) {
      this.module.lossChart.data.labels = [];
      this.module.lossChart.data.datasets[0].data = [];
      this.module.lossChart.data.datasets[1].data = [];
      this.module.lossChart.update();
    }

    if (this.module.diceChart) {
      this.module.diceChart.data.labels = [];
      this.module.diceChart.data.datasets[0].data = [];
      this.module.diceChart.data.datasets[1].data = [];
      this.module.diceChart.update();
    }
  }

  /**
   * Restore charts from training history (for resume)
   * @param {Array} history - Array of {epoch, metrics} objects
   */
  restoreFromHistory(history) {
    if (!history || !Array.isArray(history)) {
      return;
    }

    // Clear existing data first
    this.clearCharts();

    // Replay history
    for (const entry of history) {
      if (entry.epoch && entry.metrics) {
        this.updateCharts(entry.epoch, entry.metrics);
      }
    }
  }
}

export default ChartHandler;
