/**
 * LossChart Component
 *
 * Real-time loss curve visualization using Chart.js.
 * Shows training and validation loss over epochs.
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

class LossChart {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {string} options.title - Chart title
   * @param {number} options.maxPoints - Maximum number of points to display (default: 100)
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.title = options.title || 'Loss Curve';
    this.maxPoints = options.maxPoints || 100;

    // Data arrays
    this.epochs = [];
    this.trainLoss = [];
    this.valLoss = [];

    // Chart instance
    this.chart = null;
    this.chartLoaded = false;
  }

  /**
   * Render the chart container
   */
  render() {
    return `
      <div class="loss-chart-container" id="${this.containerId}">
        <h4 class="chart-title">${this.title}</h4>
        <div class="chart-wrapper">
          <canvas id="${this.containerId}-canvas"></canvas>
        </div>
        <div class="chart-legend">
          <span class="legend-item train"><span class="legend-color"></span> Train Loss</span>
          <span class="legend-item val"><span class="legend-color"></span> Validation Loss</span>
        </div>
      </div>
    `;
  }

  /**
   * Initialize the chart after DOM is ready
   */
  async init() {
    // Load Chart.js from CDN if not already loaded
    if (!window.Chart) {
      await this._loadChartJS();
    }

    this._createChart();
  }

  /**
   * Load Chart.js library dynamically
   */
  async _loadChartJS() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.Chart) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.onload = () => {
        this.chartLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Create the Chart.js instance
   */
  _createChart() {
    const canvas = document.getElementById(`${this.containerId}-canvas`);
    if (!canvas) {
      console.error('[LossChart] Canvas not found:', `${this.containerId}-canvas`);
      return;
    }

    const ctx = canvas.getContext('2d');
    const colors = themeColors();

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.epochs,
        datasets: [
          {
            label: 'Train Loss',
            data: this.trainLoss,
            borderColor: colors.train,
            backgroundColor: colors.train,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Validation Loss',
            data: this.valLoss,
            borderColor: colors.validation,
            backgroundColor: colors.validation,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0 // Disable animation for real-time updates
        },
        plugins: {
          legend: {
            display: false // We have custom legend
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(6)}`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Epoch',
              color: colors.text
            },
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text,
              maxTicksLimit: 10
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Loss',
              color: colors.text
            },
            grid: {
              color: colors.grid
            },
            ticks: {
              color: colors.text,
              callback: function(value) {
                return value.toFixed(4);
              }
            },
            beginAtZero: false
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  }

  /**
   * Add a data point
   * @param {number} epoch - Epoch number
   * @param {number} trainLoss - Training loss value
   * @param {number} valLoss - Validation loss value
   */
  addPoint(epoch, trainLoss, valLoss) {
    // Add to data arrays
    this.epochs.push(epoch);
    this.trainLoss.push(trainLoss);
    this.valLoss.push(valLoss);

    // Limit data points
    if (this.epochs.length > this.maxPoints) {
      this.epochs.shift();
      this.trainLoss.shift();
      this.valLoss.shift();
    }

    // Update chart
    if (this.chart) {
      this.chart.data.labels = this.epochs;
      this.chart.data.datasets[0].data = this.trainLoss;
      this.chart.data.datasets[1].data = this.valLoss;
      this.chart.update('none'); // Update without animation
    }
  }

  /**
   * Clear all data
   */
  clear() {
    this.epochs = [];
    this.trainLoss = [];
    this.valLoss = [];

    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets[0].data = [];
      this.chart.data.datasets[1].data = [];
      this.chart.update('none');
    }
  }

  /**
   * Destroy the chart instance
   */
  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  /**
   * Get current data
   */
  getData() {
    return {
      epochs: [...this.epochs],
      trainLoss: [...this.trainLoss],
      valLoss: [...this.valLoss]
    };
  }

  /**
   * Set data (for restoring state)
   */
  setData(data) {
    if (data.epochs) this.epochs = [...data.epochs];
    if (data.trainLoss) this.trainLoss = [...data.trainLoss];
    if (data.valLoss) this.valLoss = [...data.valLoss];

    if (this.chart) {
      this.chart.data.labels = this.epochs;
      this.chart.data.datasets[0].data = this.trainLoss;
      this.chart.data.datasets[1].data = this.valLoss;
      this.chart.update('none');
    }
  }
}

export default LossChart;
