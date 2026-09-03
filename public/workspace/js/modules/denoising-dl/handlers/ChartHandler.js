/**
 * ChartHandler.js - Chart Management for DL Denoising Module
 *
 * Handles Chart.js initialization, updates, and destruction for
 * training loss visualization.
 */

/**
 * Read the current theme's chart colours from the module design tokens so the
 * canvas follows light/dark mode. Falls back to the light-theme values when a
 * token is missing (e.g. module-base.css not yet applied).
 */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
  return {
    train: token('--module-primary', '#EB1F17'),
    validation: token('--module-info', '#17A2B8'),
    grid: token('--module-border', '#DEE2E6'),
    text: token('--module-text-secondary', '#6C757D')
  };
}

class ChartHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Initialize Chart.js and create charts for the current training method
   */
  async initializeCharts() {
    // Load Chart.js from CDN if not already loaded
    if (!window.Chart) {
      await new Promise((resolve, reject) => {
        if (window.Chart) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Colours are read from the theme tokens at creation time
    const colors = themeColors();

    // Chart configuration factory
    const chartConfig = (canvasId) => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Train Loss',
            data: [],
            borderColor: colors.train,
            backgroundColor: colors.train,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Val Loss',
            data: [],
            borderColor: colors.validation,
            backgroundColor: colors.validation,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: {
            display: true,
            title: { display: true, text: 'Epoch', color: colors.text },
            grid: { color: colors.grid },
            ticks: { color: colors.text }
          },
          y: {
            display: true,
            title: { display: true, text: 'Loss', color: colors.text },
            grid: { color: colors.grid },
            ticks: { color: colors.text, callback: (v) => v.toFixed(4) }
          }
        }
      }
    });

    // The routed pipeline trains ONE model for both methods -> one chart
    const canvas = document.getElementById('trainLossChart');
    if (canvas && !this.module.charts.train) {
      this.module.charts.train = new Chart(canvas.getContext('2d'), chartConfig('trainLossChart'));
      console.log('[ChartHandler] Created training chart');
    }
  }

  /**
   * Add a data point to a chart
   * @param {string} chartKey - Chart identifier ('n2v', 'stage1', or 'stage2')
   * @param {number} epoch - Epoch number
   * @param {number} trainLoss - Training loss value
   * @param {number} valLoss - Validation loss value
   */
  addChartPoint(chartKey, epoch, trainLoss, valLoss) {
    const chart = this.module.charts[chartKey];
    if (!chart) return;

    // Validate data - skip epoch 0 or invalid values
    // Epoch must be > 0 (epoch 0 is just initialization, not real training data)
    if (epoch == null || epoch <= 0) {
      return;
    }

    // Loss values must be valid numbers (not null/undefined/NaN)
    if (trainLoss == null || valLoss == null || isNaN(trainLoss) || isNaN(valLoss)) {
      return;
    }

    // Skip if this epoch already exists in the chart (avoid duplicates on resume)
    if (chart.data.labels.includes(epoch)) {
      return;
    }

    chart.data.labels.push(epoch);
    chart.data.datasets[0].data.push(trainLoss);
    chart.data.datasets[1].data.push(valLoss);
    chart.update('none');
  }

  /**
   * Restore chart data from history array
   * @param {string} chartKey - Chart identifier ('n2v', 'stage1', or 'stage2')
   * @param {Array} history - Array of {epoch, trainLoss, valLoss}
   */
  restoreChartsFromHistory(chartKey, history) {
    if (!history || history.length === 0) {
      console.log(`[ChartHandler] No history to restore for ${chartKey}`);
      return;
    }

    const chart = this.module.charts[chartKey];
    if (!chart) {
      console.warn(`[ChartHandler] Chart ${chartKey} not initialized, cannot restore history`);
      return;
    }

    console.log(`[ChartHandler] Restoring ${history.length} data points to ${chartKey} chart`);

    // Clear existing chart data
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];

    // Add all historical data points (only valid ones with epoch > 0 and valid loss values)
    for (const point of history) {
      if (point.epoch != null && point.epoch > 0 &&
          point.trainLoss != null && point.valLoss != null) {
        chart.data.labels.push(point.epoch);
        chart.data.datasets[0].data.push(point.trainLoss);
        chart.data.datasets[1].data.push(point.valLoss);
      }
    }

    console.log(`[ChartHandler] Chart ${chartKey} now has ${chart.data.labels.length} data points`);
    chart.update();
  }

  /**
   * Destroy all chart instances and reset to null
   */
  destroyCharts() {
    if (this.module.charts) {
      Object.keys(this.module.charts).forEach(key => {
        if (this.module.charts[key]) {
          this.module.charts[key].destroy();
          this.module.charts[key] = null;
        }
      });
    }
  }

  /**
   * Reset charts - destroy and reinitialize the charts object
   */
  resetCharts() {
    if (this.module.charts) {
      Object.values(this.module.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        }
      });
      this.module.charts = { train: null };
    }
  }
}

export default ChartHandler;
