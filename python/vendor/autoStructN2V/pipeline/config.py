# autoStructN2V/pipeline/config.py
"""Configuration for the ROUTED pipeline (restructure 2026-07-31, built 2026-08-25).

The pipeline is one routed decision followed by ONE training run:

    resolve mask (extractor on raw / file / center-only)
        -> RouteDecision (branch: 'structn2v' | 'n2v')
        -> train the branch's recipe
        -> predict, save, report

Schema (all keys optional unless marked; defaults below):

    {
      'input_data': '<stack.tif>',          # REQUIRED: multi-page TIFF (N, H, W)
      'clean_data': None,                   # optional GT stack (aux PSNR only)
      'output_dir': './results', 'experiment_name': '...',
      'random_seed': 42, 'device': 'cuda', 'split_ratio': (0.7, 0.15, 0.15),
      'verbose': False, 'num_epochs': 100,
      'early_stopping': True, 'early_stopping_patience': 10,
      'normalize_method': 'unit' | 'zscore',
      'use_aux_psnr_for_scheduling': False,

      'mask': {
        'source': 'extractor' | 'file' | 'center',
        'file_path': None,                  # source='file' (manual StructN2V baseline)
        'center_size': 1,                   # source='center' (plain-N2V baseline)
        'extractor': {                      # source='extractor' (the method)
          'extractor_input': 'raw',         # 'raw' (method default, restructure
                                            # §3.3) | 'denoised' | 'compare'
          'denoised_stack_path': None,      # required for 'denoised'/'compare'
          'bg_side': <REQUIRED>,            # 'light' | 'dark' | 'off'
          ... all AutoMaskExtractor knobs (mask_style, spine_thresh, rho_floor,
              bg_box, sigma, tile_sizes, thresh, max_pixels, ...)
        },
      },

      'recipes': {
        'n2v':       { ...training recipe for the N2V branch... },
        'structn2v': { ...training recipe for the StructN2V branch... },
      },
    }

Legacy two-stage configs (run_stage1/run_stage2 + stage1/stage2 blocks, e.g.
``known_good_config.py``) are auto-translated by ``validate_config`` — see
``_translate_legacy_config``. The two-stage ORCHESTRATION itself is retired.

Only 2D stack mode is supported (paper scope 2026-08-25; 2.5D = future work).
"""
import copy
import os

from ..masking.autoextract import validate_input_choice


# ---------------------------------------------------------------------------
# Recipe defaults (the two branch training recipes, formerly stage1/stage2)
# ---------------------------------------------------------------------------
_ARCH_DEFAULTS = {
    'use_resize_conv': True,
    'upsampling_mode': 'bilinear',
    'remove_top_skip': False,
    'use_blurpool': False,
    'activation': 'elu',
    'norm_type': 'batch',
    'num_groups': 8,
    'init_scale': 1.0,
    'overlap_tile_pad': 0,
}

N2V_RECIPE_DEFAULTS = {
    'features': 64, 'num_layers': 2, 'patch_size': 32, 'batch_size': 4,
    'learning_rate': 1e-4, 'patches_per_image': 100,
    'mask_percentage': 15.0, 'masking_strategy': 3,
    'use_augmentation': True,
    **_ARCH_DEFAULTS,
}

STRUCTN2V_RECIPE_DEFAULTS = {
    'features': 64, 'num_layers': 2, 'patch_size': 64, 'batch_size': 2,
    'learning_rate': 1e-5, 'patches_per_image': 200,
    'mask_percentage': 10.0, 'masking_strategy': 3,
    'use_augmentation': True,
    **_ARCH_DEFAULTS,
}

EXTRACTOR_DEFAULTS = {
    # 'raw' is the method default (restructure plan §3.3: the input source is an
    # experiment axis, no longer a required per-run decision).
    'extractor_input': 'raw',
    'denoised_stack_path': None,
    'bg_side': None,                 # REQUIRED user input when source='extractor'
    'bg_box': None,
    # Mask style: 'spine' (line-summary, sign-agnostic; default since 2026-08-25)
    # or 'region' (legacy positive-only; ablation arm).
    'mask_style': 'spine', 'spine_thresh': 8.0,
    # Effect-size floor: drop mask lags with |rho| below this. SHIPPED at 0.05
    # (E1 mask sweep, 2026-08-25: floored variant wins or ties strict on 5/6
    # volumes and has the best mean Pearson of any arm, oracle included; the
    # suspected banding leak did not materialize). None disables. May
    # disconnect the mask (connectivity rule struck).
    'rho_floor': 0.05,
    'sigma': 'auto', 'struct_keep': 'otsu', 'acf_crop': 10,
    'tile_sizes': [64, 48, 32, 24], 'purities': [0.95, 0.85, 0.75, 0.6],
    'min_tiles': 4, 'detrend': True, 'bg_erode': 1, 'enhance_kw': None,
    'thresh': 8.0, 'robust': True, 'close_gaps': True, 'bridge': True,
    'thin_n': 3, 'value_k': 3.0, 'value_ref': 'zmap', 'protect_extent': True,
    'max_pixels': None, 'tighten_output_mask': True,
}

TOP_DEFAULTS = {
    'experiment_name': 'autoStructN2V_experiment',
    'output_dir': './results',
    'clean_data': None,
    'random_seed': 42,
    'device': 'cuda',
    'split_ratio': (0.7, 0.15, 0.15),
    'verbose': False,
    'num_epochs': 100,
    'early_stopping': True,
    'early_stopping_patience': 10,
    'normalize_method': 'unit',      # publication recipe overrides to 'zscore'
    'use_aux_psnr_for_scheduling': False,
    'mode': '2d',
}


def _merge_defaults(dst, defaults):
    for k, v in defaults.items():
        if k not in dst:
            dst[k] = copy.deepcopy(v)
        elif isinstance(v, dict) and isinstance(dst[k], dict):
            _merge_defaults(dst[k], v)
    return dst


def _translate_legacy_config(cfg):
    """Map a pre-restructure two-stage config onto the routed schema, in place.

    stage1 -> recipes.n2v ; stage2 -> recipes.structn2v ; the mask block derives
    from run_stage1/run_stage2 + stage2.mask_source:
      * run_stage2 and mask_source='extractor'  -> mask.source='extractor'
      * run_stage2 and mask_source='file'       -> mask.source='file'
      * run_stage2 and mask_source='stage1'     -> RETIRED (raises)
      * run_stage2=False (stage-1-only N2V run) -> mask.source='center'
    The legacy 'legacy_extractor' block (ring-Otsu) is dropped: that path is
    retired with the restructure.
    """
    print("[config] legacy two-stage config detected -> translating to the "
          "routed schema (stage1->recipes.n2v, stage2->recipes.structn2v).")
    recipes = cfg.setdefault('recipes', {})
    mask = cfg.setdefault('mask', {})

    stage1 = cfg.pop('stage1', {}) or {}
    stage2 = cfg.pop('stage2', {}) or {}
    center_size = stage1.pop('mask_center_size', 1)
    mask_source = stage2.pop('mask_source', 'extractor')
    mask_file_path = stage2.pop('mask_file_path', None)
    extractor = stage2.pop('extractor', None)
    stage2.pop('legacy_extractor', None)
    for legacy_key in ('use_roi', 'roi_threshold', 'scale_factor', 'select_background'):
        stage1.pop(legacy_key, None)
        stage2.pop(legacy_key, None)

    recipes.setdefault('n2v', {}).update(
        {k: v for k, v in stage1.items() if k not in recipes.get('n2v', {})})
    recipes.setdefault('structn2v', {}).update(
        {k: v for k, v in stage2.items() if k not in recipes.get('structn2v', {})})

    run_stage2 = cfg.pop('run_stage2', True)
    cfg.pop('run_stage1', None)
    if not run_stage2:
        mask.setdefault('source', 'center')
        mask.setdefault('center_size', center_size)
    elif mask_source == 'file':
        mask.setdefault('source', 'file')
        mask.setdefault('file_path', mask_file_path)
    elif mask_source == 'extractor':
        mask.setdefault('source', 'extractor')
        if extractor:
            mask.setdefault('extractor', {})
            for k, v in extractor.items():
                mask['extractor'].setdefault(k, v)
    else:
        raise ValueError(
            f"legacy mask_source={mask_source!r} is retired with the restructure "
            "(the ring-Otsu 'stage1' path no longer exists). Use 'extractor' or 'file'.")
    cfg.pop('image_extension', None)
    cfg.pop('input_dir', None)
    return cfg


def validate_config(config):
    """Validate and complete a routed-pipeline configuration.

    Accepts the routed schema (module docstring) or a legacy two-stage config
    (auto-translated). Returns a completed deep copy.
    """
    cfg = copy.deepcopy(config)

    if 'stage1' in cfg or 'stage2' in cfg or 'run_stage1' in cfg or 'run_stage2' in cfg:
        _translate_legacy_config(cfg)

    _merge_defaults(cfg, TOP_DEFAULTS)
    cfg.setdefault('mask', {})
    cfg['mask'].setdefault('source', 'extractor')
    cfg['mask'].setdefault('file_path', None)
    cfg['mask'].setdefault('center_size', 1)
    _merge_defaults(cfg['mask'].setdefault('extractor', {}), EXTRACTOR_DEFAULTS)
    cfg.setdefault('recipes', {})
    _merge_defaults(cfg['recipes'].setdefault('n2v', {}), N2V_RECIPE_DEFAULTS)
    _merge_defaults(cfg['recipes'].setdefault('structn2v', {}), STRUCTN2V_RECIPE_DEFAULTS)

    # --- mode: 2D stack only ------------------------------------------------
    if cfg.get('mode', '2d') != '2d':
        raise ValueError(
            "The routed pipeline supports mode='2d' only (paper scope 2026-08-25; "
            "2.5D is future work).")

    # --- input --------------------------------------------------------------
    input_path = cfg.get('input_data')
    if not input_path:
        raise ValueError("'input_data' (path to a multi-page TIFF stack) is required.")
    if not os.path.exists(input_path):
        raise ValueError(f"Input file not found: {input_path}")
    if not str(input_path).lower().endswith(('.tif', '.tiff')):
        raise ValueError(f"Input file must be a TIFF (.tif/.tiff): {input_path}")

    # --- normalize_method ---------------------------------------------------
    if cfg['normalize_method'] not in ('unit', 'zscore'):
        raise ValueError(
            f"normalize_method must be 'unit' or 'zscore', got {cfg['normalize_method']!r}")

    # --- mask block ---------------------------------------------------------
    source = cfg['mask']['source']
    if source not in ('extractor', 'file', 'center'):
        raise ValueError(
            f"mask.source must be 'extractor', 'file' or 'center', got {source!r}")
    if source == 'file':
        fp = cfg['mask']['file_path']
        if not fp:
            raise ValueError("mask.source='file' requires mask.file_path (.npy)")
        if not os.path.exists(fp):
            raise ValueError(f"Mask file not found: {fp}")
        if not str(fp).endswith('.npy'):
            raise ValueError("mask.file_path must be a .npy file")
    if source == 'center':
        cs = cfg['mask']['center_size']
        if not isinstance(cs, int) or cs < 1 or cs % 2 == 0:
            raise ValueError(f"mask.center_size must be a positive odd int, got {cs!r}")
    if source == 'extractor':
        ex = cfg['mask']['extractor']
        validate_input_choice(ex.get('extractor_input'),
                              where="config['mask']['extractor']['extractor_input']")
        if ex.get('extractor_input') in ('denoised', 'compare') and \
                not ex.get('denoised_stack_path'):
            raise ValueError(
                f"extractor_input={ex['extractor_input']!r} requires "
                "mask.extractor.denoised_stack_path (the routed pipeline no longer "
                "produces a Stage-1 denoised stack inline; precompute one with a "
                "mask.source='center' run).")
        if ex.get('bg_side') not in ('light', 'dark', 'off', 'auto'):
            raise ValueError(
                "mask.extractor.bg_side is a required user input: 'light' (EM/COSEM), "
                "'dark' (confocal), or 'off' (flatness-only; correct for PhantEM "
                f"synthetic volumes). Got {ex.get('bg_side')!r}.")
        if ex.get('mask_style') not in ('spine', 'region'):
            raise ValueError(
                f"mask.extractor.mask_style must be 'spine' or 'region', "
                f"got {ex.get('mask_style')!r}")

    # --- recipes ------------------------------------------------------------
    for branch, recipe in cfg['recipes'].items():
        if branch not in ('n2v', 'structn2v'):
            raise ValueError(f"unknown recipe {branch!r}; expected 'n2v'/'structn2v'")
        if recipe.get('upsampling_mode') not in ('bilinear', 'nearest', 'bicubic'):
            raise ValueError(
                f"recipes.{branch}.upsampling_mode invalid: {recipe.get('upsampling_mode')!r}")
        if recipe.get('activation') not in ('elu', 'relu'):
            raise ValueError(
                f"recipes.{branch}.activation must be 'elu' or 'relu'")
        if recipe.get('norm_type') not in ('batch', 'group', 'instance', 'none'):
            raise ValueError(
                f"recipes.{branch}.norm_type invalid: {recipe.get('norm_type')!r}")
        ng = recipe.get('num_groups')
        if not isinstance(ng, int) or ng <= 0:
            raise ValueError(f"recipes.{branch}.num_groups must be a positive int")

    if not str(cfg['output_dir']).endswith('/'):
        cfg['output_dir'] = str(cfg['output_dir']) + '/'
    return cfg


def create_output_directories(config):
    """Create the (flat, routed) output tree.

    results/<experiment>/{model, logs, final_results}  — no stage subtrees.
    """
    experiment_dir = os.path.join(config['output_dir'], config['experiment_name'])
    dirs = {
        'experiment': experiment_dir,
        'model': os.path.join(experiment_dir, 'model'),
        'logs': os.path.join(experiment_dir, 'logs'),
        'final_results': os.path.join(experiment_dir, 'final_results'),
    }
    for p in dirs.values():
        os.makedirs(p, exist_ok=True)
    return dirs
