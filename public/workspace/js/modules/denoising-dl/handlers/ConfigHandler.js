/**
 * ConfigHandler.js - Configuration Management for DL Denoising Module
 *
 * Handles configuration rendering, preset management, and form handling
 * for training parameters.
 */

import Templates from '../templates/Templates.js';
import ParameterValidator from '/workspace/js/core/utils/ParameterValidator.js';
import FormValidationController from '/workspace/js/core/utils/FormValidationController.js';
import { icon } from '/workspace/js/core/icons.js';

class ConfigHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
    this.validationControllers = [];
    this.paramValidator = null;
  }

  /**
   * Load configuration presets from backend
   */
  async loadPresets() {
    try {
      const result = await this.module.api.getPresets();
      if (result.success) {
        this.module.presets = result.presets;
        this.module.parameterRanges = result.parameterRanges;
        this.module.currentPreset = result.defaults?.preset || 'balanced';
        console.log('[ConfigHandler] Presets loaded:', Object.keys(this.module.presets));
      }
    } catch (error) {
      console.error('[ConfigHandler] Error loading presets:', error);
      // Use fallback defaults
      this.module.presets = this.getDefaultPresets();
    }
  }

  /**
   * Get fallback default presets — mirrors config/denoising_presets.json
   * (routed v1.0). Used only when the backend fetch fails.
   */
  getDefaultPresets() {
    // stage1 = N2V branch recipe, stage2 = StructN2V branch recipe. The router
    // picks which one trains; both blocks carry the publication recipe.
    const n2vBranch = (epochs, ppi) => ({
      patch_size: 64,
      patches_per_image: ppi,
      batch_size: 128,
      mask_percentage: 1.5,
      masking_strategy: 3,
      use_augmentation: true,
      features: 32,
      num_layers: 2,
      activation: 'relu',
      remove_top_skip: true,
      use_blurpool: true,
      learning_rate: 0.001,
      epochs,
      early_stopping: true,
      early_stopping_patience: 10,
      normalize_method: 'zscore',
      overlap_tile_pad: 16,
      use_resize_conv: true,
      upsampling_mode: 'bilinear'
    });

    const structBranch = (epochs, ppi) => ({
      patch_size: 128,
      patches_per_image: ppi,
      batch_size: 24,
      mask_percentage: 15.0,
      masking_strategy: 3,
      use_augmentation: false,
      features: 32,
      num_layers: 2,
      activation: 'relu',
      remove_top_skip: true,
      use_blurpool: true,
      learning_rate: 0.001,
      epochs,
      early_stopping: true,
      early_stopping_patience: 10,
      normalize_method: 'zscore',
      overlap_tile_pad: 16,
      use_resize_conv: true,
      upsampling_mode: 'bilinear',
      norm_type: 'group',
      num_groups: 8
    });

    const maskExtractor = () => ({
      bg_side: 'light',
      rho_floor: 0.05,
      spine_thresh: 8.0,
      max_pixels: null
    });

    // Tiers vary the compute budget only (epochs + patches per image); the
    // validated training recipe is identical across presets.
    return {
      fast: {
        name: 'Fast',
        description: 'Quick preview: fewer epochs and fewer sampled patches. Same validated recipe, lower compute.',
        stage1: n2vBranch(50, 50),
        stage2: structBranch(50, 100),
        maskExtractor: maskExtractor()
      },
      balanced: {
        name: 'Balanced',
        description: 'The publication training budget. Recommended for most use cases.',
        stage1: n2vBranch(200, 100),
        stage2: structBranch(100, 200),
        maskExtractor: maskExtractor()
      },
      high_quality: {
        name: 'High Quality',
        description: 'Extended training budget: more epochs and denser patch sampling. Longest runtime.',
        stage1: n2vBranch(400, 200),
        stage2: structBranch(200, 400),
        maskExtractor: maskExtractor()
      }
    };
  }

  /**
   * Render Step 2 configuration UI
   */
  renderStep2Config() {
    console.log('[ConfigHandler] Rendering Step 2 config for method:', this.module.selectedMethod);

    // Update method mode label
    const methodLabel = document.getElementById('methodModeLabel');
    if (methodLabel) {
      const isAutoStruct = this.module.selectedMethod === 'autostructn2v';
      methodLabel.innerHTML = isAutoStruct
        ? '<strong>(autoStructN2V - Automatic Mask Discovery + Routed Training)</strong>'
        : '<strong>(N2V - Plain Blind-Spot Training)</strong>';
    }

    // Load preset config if not already loaded
    if (!this.module.trainingConfig.stage1.patch_size) {
      this.applyPreset(this.module.currentPreset);
    }

    // Update preset description
    this.updatePresetDescription();

    // Render configuration columns
    this.renderConfigColumns();

    // Show/hide mask extractor section
    const maskSection = document.getElementById('maskExtractorSection');
    if (maskSection) {
      if (this.module.selectedMethod === 'autostructn2v') {
        maskSection.style.display = 'block';
        this.renderMaskExtractorConfig();
      } else {
        maskSection.style.display = 'none';
      }
    }
  }

  /**
   * Render the configuration columns (single or dual)
   */
  renderConfigColumns() {
    const container = document.getElementById('configColumnsContainer');
    if (!container) return;

    const isDualColumn = this.module.selectedMethod === 'autostructn2v';

    if (isDualColumn) {
      // autoStructN2V: two branch recipes side by side. The router measures
      // the noise on the raw stack and trains EXACTLY ONE of these branches.
      container.innerHTML = `
        <p class="section-desc">
          The noise measurement routes each run to one of two branches; only
          the selected branch trains. Configure both recipes here.
        </p>
        <div class="config-columns dual-column">
          <div class="config-column stage1-column">
            <div class="column-header">
              <h4>N2V BRANCH (no directional noise)</h4>
            </div>
            <div class="column-content" id="stage1ConfigContent">
              ${this.renderStageConfigForm('stage1')}
            </div>
          </div>

          <div class="config-column stage2-column">
            <div class="column-header">
              <h4>STRUCTN2V BRANCH (discovered mask)</h4>
            </div>
            <div class="column-content" id="stage2ConfigContent">
              ${this.renderStageConfigForm('stage2')}
            </div>
          </div>
        </div>
      `;
    } else {
      // N2V: Single column layout
      container.innerHTML = this.renderN2VConfigForm();
    }

    // Set up input change listeners
    this.setupConfigInputListeners();

    // Initialize parameter validation
    this.initValidation();
  }

  /**
   * Render N2V configuration form (single column)
   */
  renderN2VConfigForm() {
    return `
      <div class="config-form" id="stage1ConfigContent" data-stage="stage1">
        ${this._renderRecipeFormBody('stage1')}
      </div>
    `;
  }

  /**
   * Render a branch recipe form (autoStructN2V dual-column)
   * @param {string} stage - 'stage1' (N2V branch) or 'stage2' (StructN2V branch)
   */
  renderStageConfigForm(stage) {
    return `
      <div class="config-form" data-stage="${stage}">
        ${this._renderRecipeFormBody(stage)}
      </div>
    `;
  }

  /**
   * Shared recipe form body.
   *
   * The model architecture (features, depth, N2V2 fixes, norm layers,
   * masking strategy) is FIXED to the validated publication recipe and no
   * longer exposed; visible fields are the compute/budget knobs, with a
   * few legitimate tunables under Advanced.
   * @param {string} stage - 'stage1' or 'stage2'
   */
  _renderRecipeFormBody(stage) {
    const config = this.module.trainingConfig[stage] || {};
    const isStage1 = stage === 'stage1';

    // Patch size (Advanced): StructN2V branch defaults larger to give the
    // structural mask spatial context.
    const patchSizeOptions = isStage1
      ? [
          { v: 32, sel: config.patch_size === 32 },
          { v: 48, sel: config.patch_size === 48 },
          { v: 64, sel: config.patch_size === 64 || !config.patch_size },
          { v: 96, sel: config.patch_size === 96 },
          { v: 128, sel: config.patch_size === 128 }
        ]
      : [
          { v: 32, sel: config.patch_size === 32 },
          { v: 48, sel: config.patch_size === 48 },
          { v: 64, sel: config.patch_size === 64 },
          { v: 96, sel: config.patch_size === 96 },
          { v: 128, sel: config.patch_size === 128 || !config.patch_size },
          { v: 256, sel: config.patch_size === 256 }
        ];

    // Batch size: N2V branch dropdown (default 128); StructN2V branch
    // numeric input (default 24; larger patches need smaller batches)
    const batchSizeField = isStage1 ? `
            <select id="${stage}_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
              <option value="64" ${config.batch_size === 64 ? 'selected' : ''}>64</option>
              <option value="128" ${config.batch_size === 128 || !config.batch_size ? 'selected' : ''}>128</option>
            </select>
    ` : `
            <input type="number" id="${stage}_batch_size" data-param="batch_size"
                   value="${config.batch_size || 24}" min="1" max="256" step="1">
    `;

    return `
        <div class="config-group">
          <h3>Training Budget</h3>
          <div class="form-field">
            <label for="${stage}_epochs">Number of Epochs${Templates.renderHelpIcon('denoising-dl.step2.epochs')}</label>
            <input type="number" id="${stage}_epochs" data-param="epochs"
                   value="${config.epochs || 100}" min="10" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="${stage}_patches_per_image">Patches per Image${Templates.renderHelpIcon('denoising-dl.step2.patches-per-image')}</label>
            <input type="number" id="${stage}_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || (isStage1 ? 100 : 200)}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="${stage}_batch_size">Batch Size${Templates.renderHelpIcon('denoising-dl.step2.batch-size')}</label>
            ${batchSizeField}
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="${stage}_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="${stage}_early_stopping">Early Stopping${Templates.renderHelpIcon('denoising-dl.step2.early-stopping')}</label>
          </div>
          <div class="form-field">
            <label for="${stage}_early_stopping_patience">Early Stopping Patience${Templates.renderHelpIcon('denoising-dl.step2.early-stopping')}</label>
            <input type="number" id="${stage}_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="${stage}_advanced_body">
            <h3>
              <span class="collapsible-icon">${icon('caretRight')}</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="${stage}_advanced_body" style="display: none;">
            <p class="section-desc">
              The network architecture is fixed to the published recipe.
              These tunables change the training dynamics; the defaults are
              the validated values.
            </p>
            <div class="form-field">
              <label for="${stage}_patch_size">Patch Size${Templates.renderHelpIcon('denoising-dl.step2.patch-size')}</label>
              <select id="${stage}_patch_size" data-param="patch_size">
                ${patchSizeOptions.map(o => `<option value="${o.v}" ${o.sel ? 'selected' : ''}>${o.v}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label for="${stage}_learning_rate">Learning Rate${Templates.renderHelpIcon('denoising-dl.step2.learning-rate')}</label>
              <input type="number" id="${stage}_learning_rate" data-param="learning_rate"
                     value="${config.learning_rate != null ? config.learning_rate : 0.001}"
                     min="0.000001" max="0.01" step="0.0001">
            </div>
            <div class="form-field">
              <label for="${stage}_mask_percentage">Mask Percentage (%)${Templates.renderHelpIcon('denoising-dl.step2.mask-percentage')}</label>
              <input type="number" id="${stage}_mask_percentage" data-param="mask_percentage"
                     value="${config.mask_percentage != null ? config.mask_percentage : (isStage1 ? 1.5 : 15)}"
                     min="${isStage1 ? 0.5 : 5}" max="30" step="${isStage1 ? 0.5 : 1}">
            </div>
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_augmentation" data-param="use_augmentation"
                     ${config.use_augmentation !== false ? 'checked' : ''}>
              <label for="${stage}_use_augmentation">Apply Data Augmentation${Templates.renderHelpIcon('denoising-dl.step2.augmentation')}</label>
            </div>
          </div>
        </div>
    `;
  }

  /**
   * Render mask extractor configuration (autoStructN2V only)
   */
  renderMaskExtractorConfig() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    const config = this.module.trainingConfig.maskExtractor || {};

    container.innerHTML = `
      <div class="config-form mask-extractor-form">
        <div class="config-group">
          <h3>Noise Measurement${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.bg-side')}</h3>
          <p class="section-desc">
            The structural mask is measured on background regions of the raw
            stack. Tell the extractor which intensity side of your images is
            background — the one required input.
          </p>
          <div class="form-field radio-field" id="bgSideField">
            <label>Background side</label>
            <label class="radio-option">
              <input type="radio" name="mask_bg_side" data-param="bg_side" value="light"
                     ${config.bg_side === 'light' || !config.bg_side ? 'checked' : ''}>
              Light (dense EM: resin/background is bright)
            </label>
            <label class="radio-option">
              <input type="radio" name="mask_bg_side" data-param="bg_side" value="dark"
                     ${config.bg_side === 'dark' ? 'checked' : ''}>
              Dark (fluorescence-like: background is dark)
            </label>
            <label class="radio-option">
              <input type="radio" name="mask_bg_side" data-param="bg_side" value="off"
                     ${config.bg_side === 'off' ? 'checked' : ''}>
              Off (flatness-only selection)
            </label>
          </div>
        </div>
        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="maskExtractorBody">
            <h3>
              <span class="collapsible-icon">${icon('caretRight')}</span>
              Advanced Extractor Options
            </h3>
          </div>
          <div class="collapsible-body" id="maskExtractorBody" style="display: none;">
            <div class="form-field">
              <label for="mask_rho_floor">Correlation Floor (rho)${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.rho-floor')}</label>
              <input type="number" id="mask_rho_floor" data-param="rho_floor"
                     value="${config.rho_floor != null ? config.rho_floor : 0.05}" min="0" max="0.15" step="0.005">
              <span class="field-hint">Drop mask pixels whose noise correlation is below this (0 disables)</span>
            </div>
            <div class="form-field">
              <label for="mask_spine_thresh">Significance Threshold (|z|)${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.spine-thresh')}</label>
              <input type="number" id="mask_spine_thresh" data-param="spine_thresh"
                     value="${config.spine_thresh || 8}" min="4" max="12" step="0.5">
              <span class="field-hint">Certainty required for a correlation feature to enter the mask</span>
            </div>
            <div class="form-field">
              <label for="mask_max_pixels">Max Masked Pixels${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.max-pixels')}</label>
              <input type="number" id="mask_max_pixels" data-param="max_pixels"
                     value="${config.max_pixels != null ? config.max_pixels : ''}" min="5" max="50" step="1"
                     placeholder="no cap">
              <span class="field-hint">Optional cap on active mask pixels (empty = no cap)</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up collapsible toggle
    this.setupCollapsibleToggles();
    // Set up input listeners for mask config
    this.setupMaskConfigListeners();
  }

  /**
   * Set up collapsible section toggles
   */
  setupCollapsibleToggles() {
    document.querySelectorAll('[data-toggle]:not([data-toggle-initialized])').forEach(header => {
      // Mark as initialized to prevent duplicate listeners
      header.setAttribute('data-toggle-initialized', 'true');

      header.addEventListener('click', () => {
        const bodyId = header.getAttribute('data-toggle');
        const body = document.getElementById(bodyId);
        const icon = header.querySelector('.collapsible-icon');

        if (body) {
          const isVisible = body.style.display !== 'none';
          body.style.display = isVisible ? 'none' : 'block';
          if (icon) icon.textContent = isVisible ? '\u25B6' : '\u25BC';
        }
      });
    });
  }

  /**
   * Initialize parameter validation for all rendered config forms
   */
  initValidation() {
    this.destroyValidation();

    const dims = this.module.validationResult?.info?.dimensions;
    this.paramValidator = new ParameterValidator(dims || null);

    const stages = ['stage1'];
    if (this.module.selectedMethod === 'autostructn2v') {
      stages.push('stage2');
    }

    for (const stage of stages) {
      const container = document.getElementById(`${stage}ConfigContent`);
      if (!container) continue;

      const controller = new FormValidationController(this.paramValidator, {
        onValidationChange: () => this._updateConfigValidity()
      });
      controller.attachTo(container);

      const patchId = `${stage}_patch_size`;
      const patchesId = `${stage}_patches_per_image`;
      const epochsId = `${stage}_epochs`;
      const maskPctId = `${stage}_mask_percentage`;
      const patienceId = `${stage}_early_stopping_patience`;

      // Patch size: check image dims + extract-size divisibility. The U-Net
      // depth is fixed to the publication recipe (no longer user-exposed).
      controller.addFieldRule(patchId, (value) => {
        const config = this.module.trainingConfig[stage] || {};
        const pad = config.overlap_tile_pad ?? 16;
        const layers = config.num_layers || 2;
        return this.paramValidator.validatePatchSize(parseInt(value), {
          overlapTilePad: pad,
          numLayers: layers
        });
      });

      controller.addFieldRule(patchesId, (value) => {
        return this.paramValidator.validateRange(parseInt(value), 50, 500, 'Patches per image');
      });

      controller.addFieldRule(epochsId, (value) => {
        return this.paramValidator.validateRange(parseInt(value), 10, 500, 'Number of epochs');
      });

      const maskMin = stage === 'stage2' ? 5 : 0.5;
      controller.addFieldRule(maskPctId, (value) => {
        return this.paramValidator.validateRange(parseFloat(value), maskMin, 30, 'Mask percentage');
      });

      controller.addFieldRule(patienceId, (value) => {
        const el = document.getElementById(patienceId);
        if (el && el.disabled) return { valid: true, error: null };
        return this.paramValidator.validateRange(parseInt(value), 5, 50, 'Early stopping patience');
      });

      // Disable patch size options exceeding image dimensions
      const maxPatch = this.paramValidator.getMaxPatchSize();
      if (maxPatch != null) {
        controller.updateSelectOptions(patchId, maxPatch);
      }

      controller.validateAll();
      this.validationControllers.push(controller);
    }
  }

  /**
   * Destroy all validation controllers
   */
  destroyValidation() {
    for (const ctrl of this.validationControllers) {
      ctrl.destroy();
    }
    this.validationControllers = [];
  }

  /**
   * Update module's configValid flag based on all controllers
   */
  _updateConfigValidity() {
    this.module.configValid = this.validationControllers.every(c => c.isValid());
  }

  /**
   * Set up config input change listeners
   */
  setupConfigInputListeners() {
    // Stage 1 inputs
    document.querySelectorAll('#stage1ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage1', e.target));
    });

    // Stage 2 inputs (if present)
    document.querySelectorAll('#stage2ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage2', e.target));
    });

    // Early stopping toggle logic
    ['stage1', 'stage2'].forEach(stage => {
      const toggle = document.getElementById(`${stage}_early_stopping`);
      const patience = document.getElementById(`${stage}_early_stopping_patience`);
      if (toggle && patience) {
        toggle.addEventListener('change', () => {
          patience.disabled = !toggle.checked;
        });
      }
    });

    // Set up collapsible toggles
    this.setupCollapsibleToggles();
  }

  /**
   * Set up mask extractor config listeners
   */
  setupMaskConfigListeners() {
    document.querySelectorAll('#maskExtractorSection [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('maskExtractor', e.target));
    });
  }

  /**
   * Handle config input change
   * @param {string} stage - Stage identifier
   * @param {HTMLElement} input - Input element that changed
   */
  onConfigInputChange(stage, input) {
    const param = input.getAttribute('data-param');
    let value;

    if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'radio') {
      if (!input.checked) return;
      value = input.value;
    } else if (input.type === 'number') {
      value = input.value === '' ? null : parseFloat(input.value);
    } else {
      value = parseInt(input.value) || input.value;
    }

    this.module.trainingConfig[stage][param] = value;
    console.log(`[ConfigHandler] Config updated: ${stage}.${param} =`, value);
  }

  /**
   * Handle preset change
   * @param {string} presetName - Name of the preset to apply
   */
  onPresetChange(presetName) {
    console.log('[ConfigHandler] Preset changed to:', presetName);
    this.module.currentPreset = presetName;
    this.applyPreset(presetName);
    this.updatePresetDescription();
    this.renderConfigColumns();

    // Re-render mask extractor if visible
    if (this.module.selectedMethod === 'autostructn2v') {
      this.renderMaskExtractorConfig();
    }
  }

  /**
   * Apply a preset configuration. When autoStructN2V is the selected method,
   * Stage 1 receives the autoStructN2V-specific overrides (augmentation off,
   * ROI on, lower epoch count) on top of the N2V base values.
   * @param {string} presetName - Name of the preset to apply
   */
  applyPreset(presetName) {
    const preset = this.module.presets?.[presetName];
    if (!preset) {
      console.warn('[ConfigHandler] Preset not found:', presetName);
      return;
    }

    this.module.trainingConfig.stage1 = { ...preset.stage1 };
    this.module.trainingConfig.stage2 = { ...preset.stage2 };
    this.module.trainingConfig.maskExtractor = { ...preset.maskExtractor };

    console.log('[ConfigHandler] Applied preset:', presetName, 'method:', this.module.selectedMethod);
  }

  /**
   * Update preset description text
   */
  updatePresetDescription() {
    const descEl = document.getElementById('presetDescription');
    if (!descEl) return;

    const preset = this.module.presets?.[this.module.currentPreset];
    if (preset) {
      descEl.textContent = preset.description || '';
    }
  }

  /**
   * Save current configuration by reading from form
   */
  saveConfig() {
    // Read all current values from the form
    this.readConfigFromForm('stage1');
    if (this.module.selectedMethod === 'autostructn2v') {
      this.readConfigFromForm('stage2');
      this.readMaskConfigFromForm();
    }

    console.log('[ConfigHandler] Configuration after reading from form:', JSON.stringify(this.module.trainingConfig, null, 2));
  }

  /**
   * Read configuration values from form inputs
   * @param {string} stage - Stage identifier
   */
  readConfigFromForm(stage) {
    const container = document.getElementById(`${stage}ConfigContent`);
    if (!container) {
      console.warn(`[ConfigHandler] Container not found: ${stage}ConfigContent`);
      return;
    }

    const inputs = container.querySelectorAll('[data-param]');
    console.log(`[ConfigHandler] Found ${inputs.length} inputs in ${stage}ConfigContent`);

    inputs.forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else if (input.tagName === 'SELECT') {
        // Handle select elements - parse numeric values
        const rawValue = input.value;
        const numValue = parseFloat(rawValue);
        value = isNaN(numValue) ? rawValue : numValue;
      } else {
        value = parseInt(input.value) || input.value;
      }

      this.module.trainingConfig[stage][param] = value;
    });
  }

  /**
   * Read mask extractor configuration from form
   */
  readMaskConfigFromForm() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    container.querySelectorAll('[data-param]').forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'radio') {
        if (!input.checked) return;
        value = input.value;
      } else if (input.type === 'number') {
        value = input.value === '' ? null : parseFloat(input.value);
      } else {
        value = input.value;
      }

      this.module.trainingConfig.maskExtractor[param] = value;
    });
  }
}

export default ConfigHandler;
