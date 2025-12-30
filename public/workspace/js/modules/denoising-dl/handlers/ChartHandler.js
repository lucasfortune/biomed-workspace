/**
 * ChartHandler.js - Chart Management for DL Denoising Module
 *
 * Handles Chart.js initialization, updates, and destruction for
 * training loss visualization.
 */

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

    // Chart configuration factory
    const chartConfig = (canvasId) => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Train Loss',
            data: [],
            borderColor: '#4A90E2',
            backgroundColor: 'rgba(74, 144, 226, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Val Loss',
            data: [],
            borderColor: '#E24A4A',
            backgroundColor: 'rgba(226, 74, 74, 0.1)',
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
            title: { display: true, text: 'Epoch', color: '#666' },
            grid: { color: 'rgba(0, 0, 0, 0.05)' }
          },
          y: {
            display: true,
            title: { display: true, text: 'Loss', color: '#666' },
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { callback: (v) => v.toFixed(4) }
          }
        }
      }
    });

    // Create charts for the current method
    if (this.module.selectedMethod === 'n2v') {
      const canvas = document.getElementById('n2vLossChart');
      if (canvas) {
        this.module.charts.n2v = new Chart(canvas.getContext('2d'), chartConfig('n2vLossChart'));
      }
    } else {
      // autoStructN2V - create stage 1 and stage 2 charts
      const stage1Canvas = document.getElementById('stage1LossChart');
      if (stage1Canvas) {
        this.module.charts.stage1 = new Chart(stage1Canvas.getContext('2d'), chartConfig('stage1LossChart'));
      }
      const stage2Canvas = document.getElementById('stage2LossChart');
      if (stage2Canvas) {
        this.module.charts.stage2 = new Chart(stage2Canvas.getContext('2d'), chartConfig('stage2LossChart'));
      }
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

    chart.data.labels.push(epoch);
    chart.data.datasets[0].data.push(trainLoss);
    chart.data.datasets[1].data.push(valLoss);
    chart.update('none');
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
      this.module.charts = { n2v: null, stage1: null, stage2: null };
    }
  }
}

export default ChartHandler;
