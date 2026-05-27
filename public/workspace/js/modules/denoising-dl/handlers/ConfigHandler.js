/**
 * ConfigHandler.js - Configuration Management for DL Denoising Module
 *
 * Handles configuration rendering, preset management, and form handling
 * for training parameters.
 */

import Templates from '../templates/Templates.js';

class ConfigHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
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
   * Get fallback default presets — mirrors config/denoising_presets.json.
   * Used only when the backend fetch fails.
   */
  getDefaultPresets() {
    const n2vStage1 = (epochs) => ({
      patch_size: 64,
      patches_per_image: 100,
      batch_size: 128,
      mask_percentage: 1.5,
      mask_center_size: 1,
      masking_strategy: 3,
      use_augmentation: true,
      features: 32,
      num_layers: 2,
      activation: 'relu',
      remove_top_skip: true,
      use_blurpool: true,
      learning_rate: 0.0004,
      epochs,
      early_stopping: true,
      early_stopping_patience: 10,
      normalize_method: 'zscore',
      overlap_tile_pad: 16,
      use_resize_conv: true,
      upsampling_mode: 'bilinear',
      use_roi: false
    });

    const stage2 = (epochs) => ({
      patch_size: 128,
      patches_per_image: 200,
      batch_size: 24,
      mask_percentage: 15.0,
      masking_strategy: 4,
      mask_source: 'stage1',
      use_augmentation: false,
      features: 32,
      num_layers: 2,
      activation: 'relu',
      remove_top_skip: true,
      use_blurpool: true,
      learning_rate: 0.000075,
      epochs,
      early_stopping: true,
      early_stopping_patience: 10,
      normalize_method: 'zscore',
      overlap_tile_pad: 16,
      use_resize_conv: true,
      upsampling_mode: 'bilinear',
      use_roi: false
    });

    const sharedMaskExtractor = () => ({
      adaptive_thresholding: true,
      adapt_CB: 50.0,
      adapt_DF: 0.65,
      center_size: 15,
      base_percentile: 50,
      percentile_decay: 1.035,
      center_ratio_threshold: 0.2,
      use_center_proximity: true,
      center_proximity_threshold: 0.95,
      keep_center_component_only: true,
      max_masked_pixels: 25,
      norm_autocorr: true,
      log_autocorr: true,
      crop_autocorr: true,
      window: 'tukey',
      window_alpha: 0.25
    });

    const autostructOverrides = (epochs) => ({
      use_augmentation: false,
      use_roi: true,
      roi_threshold: 0.5,
      scale_factor: 0.25,
      select_background: true,
      epochs
    });

    return {
      fast: {
        name: 'Fast',
        description: 'Quick training for testing and previewing results. Lower quality but faster iteration.',
        stage1: { ...n2vStage1(100), stage1_autostruct_overrides: autostructOverrides(50) },
        stage2: stage2(50),
        maskExtractor: sharedMaskExtractor()
      },
      balanced: {
        name: 'Balanced',
        description: 'Good balance between training time and denoising quality. Recommended for most use cases.',
        stage1: { ...n2vStage1(200), stage1_autostruct_overrides: autostructOverrides(100) },
        stage2: stage2(100),
        maskExtractor: sharedMaskExtractor()
      },
      high_quality: {
        name: 'High Quality',
        description: 'Maximum denoising quality. Longer training time but best results.',
        stage1: { ...n2vStage1(400), stage1_autostruct_overrides: autostructOverrides(150) },
        stage2: stage2(200),
        maskExtractor: sharedMaskExtractor()
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
        ? '<strong>(autoStructN2V - Two Stage Training)</strong>'
        : '<strong>(N2V - Single Stage Training)</strong>';
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
      // autoStructN2V: Two-column layout per spec 3.3.2
      container.innerHTML = `
        <div class="config-columns dual-column">
          <div class="config-column stage1-column">
            <div class="column-header">
              <h4>STAGE 1</h4>
            </div>
            <div class="column-content" id="stage1ConfigContent">
              ${this.renderStageConfigForm('stage1')}
            </div>
          </div>

          <div class="config-column stage2-column">
            <div class="column-header">
              <h4>STAGE 2</h4>
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
  }

  /**
   * Render N2V configuration form (single column)
   */
  renderN2VConfigForm() {
    const config = this.module.trainingConfig.stage1 || {};

    return `
      <div class="config-form" id="stage1ConfigContent" data-stage="stage1">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="stage1_patch_size">Patch Size${Templates.renderHelpIcon('denoising-dl.step2.patch-size')}</label>
            <select id="stage1_patch_size" data-param="patch_size">
              <option value="32" ${config.patch_size === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.patch_size === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.patch_size === 64 || !config.patch_size ? 'selected' : ''}>64</option>
              <option value="96" ${config.patch_size === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.patch_size === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_patches_per_image">Patches per Image${Templates.renderHelpIcon('denoising-dl.step2.patches-per-image')}</label>
            <input type="number" id="stage1_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || 100}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="stage1_batch_size">Batch Size${Templates.renderHelpIcon('denoising-dl.step2.batch-size')}</label>
            <select id="stage1_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
              <option value="64" ${config.batch_size === 64 ? 'selected' : ''}>64</option>
              <option value="128" ${config.batch_size === 128 || !config.batch_size ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_mask_percentage">Mask Percentage (%)${Templates.renderHelpIcon('denoising-dl.step2.mask-percentage')}</label>
            <input type="number" id="stage1_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage != null ? config.mask_percentage : 1.5}" min="0.5" max="30" step="0.5">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_use_augmentation" data-param="use_augmentation"
                   ${config.use_augmentation !== false ? 'checked' : ''}>
            <label for="stage1_use_augmentation">Apply Data Augmentation${Templates.renderHelpIcon('denoising-dl.step2.augmentation')}</label>
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="stage1_features">Number of Features${Templates.renderHelpIcon('denoising-dl.step2.features')}</label>
            <select id="stage1_features" data-param="features">
              <option value="32" ${config.features === 32 || !config.features ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_num_layers">Number of Layers${Templates.renderHelpIcon('denoising-dl.step2.num-layers')}</label>
            <select id="stage1_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 || !config.num_layers ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 ? 'selected' : ''}>4</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="stage1_learning_rate">Learning Rate${Templates.renderHelpIcon('denoising-dl.step2.learning-rate')}</label>
            <select id="stage1_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
              <option value="0.0004" ${config.learning_rate === 0.0004 || !config.learning_rate ? 'selected' : ''}>4e-4</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_epochs">Number of Epochs${Templates.renderHelpIcon('denoising-dl.step2.epochs')}</label>
            <input type="number" id="stage1_epochs" data-param="epochs"
                   value="${config.epochs || 200}" min="10" max="500" step="10">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="stage1_early_stopping">Early Stopping${Templates.renderHelpIcon('denoising-dl.step2.early-stopping')}</label>
          </div>
          <div class="form-field">
            <label for="stage1_early_stopping_patience">Early Stopping Patience${Templates.renderHelpIcon('denoising-dl.step2.early-stopping')}</label>
            <input type="number" id="stage1_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="stage1_advanced_body">
            <h3>
              <span class="collapsible-icon">&#9654;</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="stage1_advanced_body" style="display: none;">
            <div class="form-field checkbox-field">
              <input type="checkbox" id="stage1_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="stage1_use_resize_conv">Resize Convolution${Templates.renderHelpIcon('denoising-dl.step2.resize-conv')}</label>
            </div>
            <div class="form-field">
              <label for="stage1_upsampling_mode">Upsampling Mode${Templates.renderHelpIcon('denoising-dl.step2.upsampling-mode')}</label>
              <select id="stage1_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
            <div class="form-field">
              <label for="stage1_masking_strategy">Masking Strategy${Templates.renderHelpIcon('denoising-dl.step2.masking-strategy')}</label>
              <select id="stage1_masking_strategy" data-param="masking_strategy">
                <option value="0" ${config.masking_strategy === 0 ? 'selected' : ''}>Local Mean</option>
                <option value="1" ${config.masking_strategy === 1 ? 'selected' : ''}>Zeros</option>
                <option value="2" ${config.masking_strategy === 2 ? 'selected' : ''}>Random</option>
                <option value="3" ${config.masking_strategy === 3 || config.masking_strategy === undefined ? 'selected' : ''}>UPS 5×5</option>
                <option value="4" ${config.masking_strategy === 4 ? 'selected' : ''}>UPS center + struct neighbors</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a stage configuration form for autoStructN2V
   * @param {string} stage - Stage identifier ('stage1' or 'stage2')
   */
  renderStageConfigForm(stage) {
    const config = this.module.trainingConfig[stage] || {};
    const isStage1 = stage === 'stage1';

    // Patch size: Stage 1 keeps 32–128 with default 64; Stage 2 adds 256 with default 256
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

    // Batch size: Stage 1 dropdown (default 128); Stage 2 numeric input (default 24)
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

    // Learning rate: Stage 1 dropdown (default 4e-4); Stage 2 numeric input (default 7.5e-5)
    const learningRateField = isStage1 ? `
            <select id="${stage}_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
              <option value="0.0004" ${config.learning_rate === 0.0004 || !config.learning_rate ? 'selected' : ''}>4e-4</option>
            </select>
    ` : `
            <input type="number" id="${stage}_learning_rate" data-param="learning_rate"
                   value="${config.learning_rate || 0.000075}" min="0.000001" max="0.01" step="0.000001">
    `;

    return `
      <div class="config-form" data-stage="${stage}">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="${stage}_patch_size">Patch Size${Templates.renderHelpIcon('denoising-dl.step2.patch-size')}</label>
            <select id="${stage}_patch_size" data-param="patch_size">
              ${patchSizeOptions.map(o => `<option value="${o.v}" ${o.sel ? 'selected' : ''}>${o.v}</option>`).join('')}
            </select>
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
          <div class="form-field">
            <label for="${stage}_mask_percentage">Mask Percentage (%)${Templates.renderHelpIcon('denoising-dl.step2.mask-percentage')}</label>
            <input type="number" id="${stage}_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage != null ? config.mask_percentage : (isStage1 ? 1.5 : 15)}"
                   min="${isStage1 ? 0.5 : 5}" max="30" step="${isStage1 ? 0.5 : 1}">
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="${stage}_features">Number of Features${Templates.renderHelpIcon('denoising-dl.step2.features')}</label>
            <select id="${stage}_features" data-param="features">
              <option value="32" ${config.features === 32 || !config.features ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_num_layers">Number of Layers${Templates.renderHelpIcon('denoising-dl.step2.num-layers')}</label>
            <select id="${stage}_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 || !config.num_layers ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 ? 'selected' : ''}>4</option>
              <option value="5" ${config.num_layers === 5 ? 'selected' : ''}>5</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="${stage}_learning_rate">Learning Rate${Templates.renderHelpIcon('denoising-dl.step2.learning-rate')}</label>
            ${learningRateField}
          </div>
          <div class="form-field">
            <label for="${stage}_epochs">Number of Epochs${Templates.renderHelpIcon('denoising-dl.step2.epochs')}</label>
            <input type="number" id="${stage}_epochs" data-param="epochs"
                   value="${config.epochs || (isStage1 ? 100 : 100)}" min="10" max="500" step="10">
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
              <span class="collapsible-icon">&#9654;</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="${stage}_advanced_body" style="display: none;">
            ${isStage1 ? `
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_roi" data-param="use_roi"
                     ${config.use_roi !== false ? 'checked' : ''}>
              <label for="${stage}_use_roi">ROI Selection${Templates.renderHelpIcon('denoising-dl.step2.roi-selection')}</label>
            </div>
            <div class="form-field">
              <label for="${stage}_roi_threshold">ROI Threshold${Templates.renderHelpIcon('denoising-dl.step2.roi-selection')}</label>
              <input type="number" id="${stage}_roi_threshold" data-param="roi_threshold"
                     value="${config.roi_threshold || 0.5}" min="0.3" max="0.7" step="0.1"
                     ${config.use_roi === false ? 'disabled' : ''}>
            </div>
            ` : `
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_augmentation" data-param="use_augmentation"
                     ${config.use_augmentation !== false ? 'checked' : ''}>
              <label for="${stage}_use_augmentation">Apply Data Augmentation${Templates.renderHelpIcon('denoising-dl.step2.augmentation')}</label>
            </div>
            `}
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="${stage}_use_resize_conv">Resize Convolution${Templates.renderHelpIcon('denoising-dl.step2.resize-conv')}</label>
            </div>
            <div class="form-field">
              <label for="${stage}_upsampling_mode">Upsampling Mode${Templates.renderHelpIcon('denoising-dl.step2.upsampling-mode')}</label>
              <select id="${stage}_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
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
        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="maskExtractorBody">
            <h3>
              <span class="collapsible-icon">&#9654;</span>
              Mask Extractor Configuration
            </h3>
          </div>
          <div class="collapsible-body" id="maskExtractorBody" style="display: none;">
            <p class="section-desc">
              Configure how structural noise patterns are detected between Stage 1 and Stage 2.
            </p>
            <div class="form-field checkbox-field">
              <input type="checkbox" id="mask_adaptive_thresholding" data-param="adaptive_thresholding"
                     ${config.adaptive_thresholding !== false ? 'checked' : ''}>
              <label for="mask_adaptive_thresholding">Adaptive Thresholding${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.adaptive')}</label>
            </div>
            <div class="form-field">
              <label for="mask_base_percentile">Base Percentile (%)${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.base-percentile')}</label>
              <input type="number" id="mask_base_percentile" data-param="base_percentile"
                     value="${config.base_percentile || 50}" min="30" max="70" step="1">
              <span class="field-hint">Threshold for noise detection (30-70)</span>
            </div>
            <div class="form-field">
              <label for="mask_percentile_decay">Percentile Decay${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.percentile-decay')}</label>
              <input type="number" id="mask_percentile_decay" data-param="percentile_decay"
                     value="${config.percentile_decay || 1.15}" min="1.0" max="1.3" step="0.01">
              <span class="field-hint">Decay rate for adaptive threshold</span>
            </div>
            <div class="form-field">
              <label for="mask_max_masked_pixels">Max Masked Pixels${Templates.renderHelpIcon('denoising-dl.step2.mask-extractor.max-pixels')}</label>
              <input type="number" id="mask_max_masked_pixels" data-param="max_masked_pixels"
                     value="${config.max_masked_pixels || 25}" min="5" max="50" step="1">
              <span class="field-hint">Maximum number of active pixels in the mask</span>
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
    } else if (input.type === 'number') {
      value = parseFloat(input.value);
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

    // Strip the override sub-object before copying — it must not leak into
    // the config that gets sent to the backend.
    const { stage1_autostruct_overrides, ...stage1Base } = preset.stage1 || {};
    this.module.trainingConfig.stage1 = { ...stage1Base };

    if (this.module.selectedMethod === 'autostructn2v' && stage1_autostruct_overrides) {
      Object.assign(this.module.trainingConfig.stage1, stage1_autostruct_overrides);
    }

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

      // For autoStructN2V, Stage 1 should NOT use data augmentation
      // (augmentation can interfere with structural noise pattern detection)
      this.module.trainingConfig.stage1.use_augmentation = false;
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
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else {
        value = input.value;
      }

      this.module.trainingConfig.maskExtractor[param] = value;
    });
  }
}

export default ConfigHandler;
