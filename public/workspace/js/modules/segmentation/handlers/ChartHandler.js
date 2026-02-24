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
    this.directionDatasetsEnabled = false;
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
      // Auto-detect direction-aware training and enable extra datasets
      if (metrics.train_seg_loss != null && !this.directionDatasetsEnabled) {
        this.enableDirectionDatasets();
      }

      // Update loss chart
      if (metrics.train_loss !== undefined && metrics.val_loss !== undefined &&
        !isNaN(metrics.train_loss) && !isNaN(metrics.val_loss)) {
        // Skip if this epoch already exists (avoid duplicates on resume)
        if (!lossChart.data.labels.includes(epoch)) {
          lossChart.data.labels.push(epoch);
          lossChart.data.datasets[0].data.push(metrics.train_loss);
          lossChart.data.datasets[1].data.push(metrics.val_loss);

          // Push direction sub-loss values if datasets are enabled
          if (this.directionDatasetsEnabled) {
            lossChart.data.datasets[2].data.push(metrics.train_seg_loss ?? null);
            lossChart.data.datasets[3].data.push(metrics.train_dir_loss ?? null);
            lossChart.data.datasets[4].data.push(metrics.val_seg_loss ?? null);
            lossChart.data.datasets[5].data.push(metrics.val_dir_loss ?? null);
          }

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
   * Dynamically add 4 direction sub-loss datasets to the loss chart
   */
  enableDirectionDatasets() {
    const lossChart = this.module.lossChart;
    if (!lossChart || this.directionDatasetsEnabled) return;

    lossChart.data.datasets.push(
      {
        label: 'Train Seg Loss',
        data: [],
        borderColor: 'rgba(255, 99, 132, 0.5)',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0.1,
        fill: false
      },
      {
        label: 'Train Dir Loss',
        data: [],
        borderColor: '#FF9F40',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0.1,
        fill: false
      },
      {
        label: 'Val Seg Loss',
        data: [],
        borderColor: 'rgba(54, 162, 235, 0.5)',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0.1,
        fill: false
      },
      {
        label: 'Val Dir Loss',
        data: [],
        borderColor: '#9966FF',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0.1,
        fill: false
      }
    );

    this.directionDatasetsEnabled = true;
    lossChart.update();
    console.log('[ChartHandler] Direction sub-loss datasets enabled');
  }

  /**
   * Clear all chart data (for reset workflow)
   */
  clearCharts() {
    if (this.module.lossChart) {
      this.module.lossChart.data.labels = [];
      this.module.lossChart.data.datasets[0].data = [];
      this.module.lossChart.data.datasets[1].data = [];

      // Remove direction datasets if they were added (splice back to 2)
      if (this.module.lossChart.data.datasets.length > 2) {
        this.module.lossChart.data.datasets.splice(2);
      }

      this.module.lossChart.update();
    }

    if (this.module.diceChart) {
      this.module.diceChart.data.labels = [];
      this.module.diceChart.data.datasets[0].data = [];
      this.module.diceChart.data.datasets[1].data = [];
      this.module.diceChart.update();
    }

    this.directionDatasetsEnabled = false;
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
