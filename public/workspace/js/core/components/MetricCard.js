/**
 * MetricCard Component
 *
 * Displays a metric value with a label in a card format.
 * Commonly used for training metrics like loss, accuracy, etc.
 *
 * Usage:
 * ```javascript
 * // Single card
 * const card = new MetricCard({
 *   id: 'trainLoss',
 *   label: 'Training Loss',
 *   value: '--',
 *   precision: 4
 * });
 * container.innerHTML = card.render();
 *
 * // Update value
 * card.setValue(0.0234);
 *
 * // Render multiple cards in a grid
 * const html = MetricCard.renderGrid([
 *   { id: 'trainLoss', label: 'Training Loss', value: '--' },
 *   { id: 'valLoss', label: 'Validation Loss', value: '--' },
 *   { id: 'trainAcc', label: 'Training Accuracy', value: '--' },
 *   { id: 'valAcc', label: 'Validation Accuracy', value: '--' }
 * ]);
 * ```
 */
class MetricCard {
  /**
   * Create a MetricCard
   * @param {object} config - Configuration options
   * @param {string} config.id - Unique identifier for the card
   * @param {string} config.label - Display label
   * @param {string|number} [config.value='--'] - Initial value
   * @param {number} [config.precision=4] - Decimal precision for number values
   * @param {string} [config.unit=''] - Optional unit suffix (e.g., '%', 'ms')
   */
  constructor(config = {}) {
    this.id = config.id || `metric-${Date.now()}`;
    this.label = config.label || 'Metric';
    this.value = config.value !== undefined ? config.value : '--';
    this.precision = config.precision !== undefined ? config.precision : 4;
    this.unit = config.unit || '';
    this.container = null;
  }

  /**
   * Format a value for display
   * @param {string|number} value
   * @returns {string}
   */
  formatValue(value) {
    if (value === '--' || value === null || value === undefined) {
      return '--';
    }
    if (typeof value === 'number') {
      return value.toFixed(this.precision) + this.unit;
    }
    return String(value) + this.unit;
  }

  /**
   * Render the metric card HTML
   * @returns {string} HTML string
   */
  render() {
    return `
      <div class="metric-card" data-component="metric-card" data-metric-id="${this.id}">
        <div class="metric-value" id="${this.id}">${this.formatValue(this.value)}</div>
        <div class="metric-label">${this.label}</div>
      </div>
    `;
  }

  /**
   * Initialize the component (finds container)
   * @param {HTMLElement} container - Parent container
   */
  init(container) {
    this.container = container;
  }

  /**
   * Update the displayed value
   * @param {string|number} value - New value
   */
  setValue(value) {
    this.value = value;
    const valueEl = document.getElementById(this.id);
    if (valueEl) {
      valueEl.textContent = this.formatValue(value);
    }
  }

  /**
   * Get the current value
   * @returns {string|number}
   */
  getValue() {
    return this.value;
  }

  /**
   * Reset the value to default
   */
  reset() {
    this.setValue('--');
  }

  /**
   * Render multiple metric cards in a grid
   * @param {Array} cards - Array of card configs
   * @param {object} [options] - Grid options
   * @param {string} [options.className='metrics-display'] - Container class name
   * @returns {string} HTML string
   */
  static renderGrid(cards, options = {}) {
    const className = options.className || 'metrics-display';

    const cardsHtml = cards.map(config => {
      const card = new MetricCard(config);
      return card.render();
    }).join('');

    return `
      <div class="${className}" data-component="metric-grid">
        ${cardsHtml}
      </div>
    `;
  }

  /**
   * Create multiple MetricCard instances from configs
   * @param {Array} configs - Array of card configurations
   * @returns {Map} Map of id -> MetricCard instance
   */
  static createCards(configs) {
    const cards = new Map();
    configs.forEach(config => {
      cards.set(config.id, new MetricCard(config));
    });
    return cards;
  }

  /**
   * Update multiple cards from a data object
   * @param {Map} cards - Map of MetricCard instances
   * @param {object} data - Object with id -> value mappings
   */
  static updateCards(cards, data) {
    Object.entries(data).forEach(([id, value]) => {
      const card = cards.get(id);
      if (card) {
        card.setValue(value);
      }
    });
  }
}

// Export for ES6 modules
export default MetricCard;

// Also make available globally
if (typeof window !== 'undefined') {
  window.MetricCard = MetricCard;
}
