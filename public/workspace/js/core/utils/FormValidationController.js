class FormValidationController {
  constructor(validator, options = {}) {
    this.validator = validator;
    this.onValidationChange = options.onValidationChange || (() => {});
    // Selector of the element wrapping a field; it receives `.has-error`
    // and the `.field-error` message (`.form-field` by default; toolbar
    // rows pass `.sv-row`, ad-hoc groups `[data-field-group]`)
    this.fieldSelector = options.fieldSelector || '.form-field';
    this.rules = new Map();
    this.errors = new Map();
    this.container = null;
    this._onChange = this._handleChange.bind(this);
  }

  attachTo(containerEl) {
    this.detach();
    this.container = containerEl;
    if (!this.container) return;
    this.container.addEventListener('change', this._onChange);
    this.container.addEventListener('input', this._onChange);
  }

  detach() {
    if (this.container) {
      this.container.removeEventListener('change', this._onChange);
      this.container.removeEventListener('input', this._onChange);
      this.container = null;
    }
  }

  addFieldRule(fieldId, ruleFn) {
    this.rules.set(fieldId, ruleFn);
  }

  _handleChange(e) {
    const el = e.target;
    if (!el || !el.id) return;
    if (this.rules.has(el.id)) {
      this.validateAll();
    }
  }

  validateField(fieldId) {
    const ruleFn = this.rules.get(fieldId);
    if (!ruleFn) return { valid: true, error: null };

    const el = document.getElementById(fieldId);
    if (!el) return { valid: true, error: null };

    const result = ruleFn(el.value);

    if (!result.valid) {
      this._setFieldError(fieldId, el, result.error);
      this.errors.set(fieldId, result.error);
    } else {
      this._clearFieldError(fieldId, el);
      this.errors.delete(fieldId);
    }

    return result;
  }

  validateAll() {
    for (const fieldId of this.rules.keys()) {
      this.validateField(fieldId);
    }
    const allValid = this.errors.size === 0;
    this.onValidationChange(allValid, this.errors.size);
    return allValid;
  }

  _getFormField(el) {
    return el.closest(this.fieldSelector);
  }

  _getOrCreateErrorSpan(fieldId, el) {
    const formField = this._getFormField(el);
    if (!formField) return null;

    let span = formField.querySelector(`.field-error[data-field="${fieldId}"]`);
    if (!span) {
      span = document.createElement('span');
      span.className = 'field-error';
      span.dataset.field = fieldId;
      formField.appendChild(span);
    }
    return span;
  }

  _setFieldError(fieldId, el, message) {
    const formField = this._getFormField(el);
    if (formField) formField.classList.add('has-error');

    const span = this._getOrCreateErrorSpan(fieldId, el);
    if (span) span.textContent = message;
  }

  _clearFieldError(fieldId, el) {
    const formField = this._getFormField(el);
    if (formField) formField.classList.remove('has-error');

    const span = formField?.querySelector(`.field-error[data-field="${fieldId}"]`);
    if (span) span.textContent = '';
  }

  updateSelectOptions(selectId, maxValue, suffix = '(exceeds image)') {
    const select = document.getElementById(selectId);
    if (!select) return;

    for (const option of select.options) {
      const val = parseFloat(option.value);
      if (isNaN(val)) continue;

      const originalText = option.dataset.originalText || option.textContent;
      option.dataset.originalText = originalText;

      if (maxValue != null && val > maxValue) {
        option.disabled = true;
        option.textContent = `${originalText} ${suffix}`;
      } else {
        option.disabled = false;
        option.textContent = originalText;
      }
    }
  }

  clearAll() {
    for (const [fieldId] of this.errors) {
      const el = document.getElementById(fieldId);
      if (el) this._clearFieldError(fieldId, el);
    }
    this.errors.clear();
  }

  isValid() {
    return this.errors.size === 0;
  }

  getErrorCount() {
    return this.errors.size;
  }

  destroy() {
    this.clearAll();
    this.detach();
    this.rules.clear();
    this.errors.clear();
  }
}

export default FormValidationController;
