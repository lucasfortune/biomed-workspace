# autoStructN2V/pipeline/runner.py
"""The ROUTED AutoStructN2V pipeline (restructure 2026-07-31, built 2026-08-25).

Three linear steps, no stage sequencing:

  1. RESOLVE THE MASK -> a ``RouteDecision``:
       * mask.source='extractor' : AutoMaskExtractor on the raw stack (the
         method). Abstain reasons become routes to the N2V branch (1x1 kernel).
       * mask.source='file'      : load a manual kernel -> StructN2V branch
         (the manual-StructN2V baseline).
       * mask.source='center'    : 1x1 (or center_size) kernel -> N2V branch
         (the plain-N2V baseline).
  2. TRAIN ONE MODEL with the branch's recipe (config['recipes'][branch]).
  3. PREDICT the full stack, save results + the routing decision.

The two-stage orchestration (run_stage1/run_stage2, Stage-1 denoise-then-
extract, the abstain HALT) is retired; the ``extractor_input='compare'`` review
halt is kept as a review tool (it never trains). Legacy two-stage configs are
auto-translated by ``validate_config``.
"""
import json
import os
from datetime import datetime

import numpy as np
import torch

from ..utils.training import set_seed
from ..models import AutoStructN2VModel
from ..trainers import AutoStructN2VTrainer
from ..inference import AutoStructN2VPredictor
from ..masking.autoextract import (AutoMaskExtractor, RouteDecision,
                                   InputDecisionRequired, review_extractor_inputs)
from ..utils.image import load_tiff_stack

from .config import validate_config, create_output_directories
from .data import split_stack_indices, create_routed_dataloaders


def load_mask_from_file(mask_file_path, verbose=False):
    """Load a masking kernel from a .npy file (bool-coerced)."""
    if not os.path.exists(mask_file_path):
        raise FileNotFoundError(f"Mask file not found: {mask_file_path}")
    mask = np.load(mask_file_path)
    if mask.dtype != bool:
        print(f"Warning: Converting mask from {mask.dtype} to bool")
        mask = mask.astype(bool)
    if mask.ndim != 2:
        raise ValueError(f"Expected a 2D mask kernel, got shape {mask.shape}")
    if verbose:
        print(f"Loaded mask from {mask_file_path}: shape {mask.shape}, "
              f"{int(mask.sum())} true px")
    return mask


def _automask_kwargs(extractor_config):
    """Map ``config['mask']['extractor']`` to ``AutoMaskExtractor`` kwargs.

    Uses the SAME defaults as the frozen ``AutoMaskExtractor.__init__``
    signature. Tuple-valued knobs may arrive as lists from JSON; coerced back.
    The ``extractor_input`` / ``denoised_stack_path`` keys are pipeline-level
    routing choices, not extractor kwargs, and are excluded here.
    """
    ec = extractor_config
    return dict(
        bg_side=ec.get('bg_side'),
        bg_box=ec.get('bg_box'),
        mask_style=ec.get('mask_style', 'spine'),
        spine_thresh=ec.get('spine_thresh', 8.0),
        rho_floor=ec.get('rho_floor', None),
        sigma=ec.get('sigma', 'auto'),
        struct_keep=ec.get('struct_keep', 'otsu'),
        acf_crop=ec.get('acf_crop', 10),
        tile_sizes=tuple(ec.get('tile_sizes', (64, 48, 32, 24))),
        purities=tuple(ec.get('purities', (0.95, 0.85, 0.75, 0.6))),
        min_tiles=ec.get('min_tiles', 4),
        detrend=ec.get('detrend', True),
        bg_erode=ec.get('bg_erode', 1),
        enhance_kw=ec.get('enhance_kw', None),
        thresh=ec.get('thresh', 8.0),
        robust=ec.get('robust', True),
        close_gaps=ec.get('close_gaps', True),
        bridge=ec.get('bridge', True),
        thin_n=ec.get('thin_n', 3),
        value_k=ec.get('value_k', 3.0),
        value_ref=ec.get('value_ref', 'zmap'),
        protect_extent=ec.get('protect_extent', True),
        max_pixels=ec.get('max_pixels', None),
        tighten_output_mask=ec.get('tighten_output_mask', True),
    )


def resolve_route(config, stack, dirs=None, verbose=False):
    """Step 1: resolve the mask source into a ``RouteDecision``.

    Returns a ``RouteDecision`` — or an ``InputDecisionRequired`` sentinel when
    ``extractor_input='compare'`` (review mode: characterise both inputs, write
    the review artifacts, train nothing).
    """
    mask_cfg = config['mask']
    source = mask_cfg['source']

    if source == 'center':
        kernel = RouteDecision.center_kernel(mask_cfg['center_size'])
        return RouteDecision('n2v', kernel, 'center_only')

    if source == 'file':
        kernel = load_mask_from_file(mask_cfg['file_path'], verbose)
        return RouteDecision('structn2v', kernel, 'manual')

    # source == 'extractor'
    ec = mask_cfg['extractor']
    extractor = AutoMaskExtractor(**_automask_kwargs(ec))
    mode = ec['extractor_input']

    if mode == 'compare':
        denoised = load_tiff_stack(ec['denoised_stack_path'])
        out_dir = os.path.join(dirs['experiment'] if dirs else '.', 'mask_review')
        return review_extractor_inputs(
            extractor, {'raw': stack, 'denoised': denoised}, out_dir,
            label=config.get('experiment_name'), verbose=verbose)

    if mode == 'denoised':
        read_stack = load_tiff_stack(ec['denoised_stack_path'])
    else:  # 'raw' — the method default
        read_stack = stack

    decision, _ = extractor.route(read_stack, verbose=verbose)
    return decision


def _create_branch_model(recipe, branch):
    """Instantiate the (2D, 1-in/1-out) model for a branch recipe."""
    return AutoStructN2VModel(
        features=recipe['features'],
        num_layers=recipe['num_layers'],
        in_channels=1, out_channels=1,
        stage=branch,
        use_resize_conv=recipe['use_resize_conv'],
        upsampling_mode=recipe['upsampling_mode'],
        remove_top_skip=recipe['remove_top_skip'],
        use_blurpool=recipe['use_blurpool'],
        activation=recipe['activation'],
        norm_type=recipe['norm_type'],
        num_groups=recipe['num_groups'],
        init_scale=recipe['init_scale'],
    )


def run_pipeline(config):
    """Run the routed AutoStructN2V pipeline. Returns a summary dict."""
    config = validate_config(config)
    verbose = config.get('verbose', False)

    dirs = create_output_directories(config)
    set_seed(config['random_seed'])
    device = torch.device(config['device'] if torch.cuda.is_available()
                          and config['device'] == 'cuda' else 'cpu')
    print(f"Using device: {device}")

    # ---- load data ---------------------------------------------------------
    print(f"\nLoading TIFF stack from: {config['input_data']}")
    stack = load_tiff_stack(config['input_data'])
    print(f"Stack shape: {stack.shape} (slices, height, width)")

    clean_stack = None
    if config.get('clean_data'):
        print(f"Loading clean reference stack (aux PSNR): {config['clean_data']}")
        clean_stack = load_tiff_stack(config['clean_data'])
        if clean_stack.shape != stack.shape:
            print(f"Warning: clean stack shape {clean_stack.shape} != noisy "
                  f"{stack.shape}; disabling aux PSNR.")
            clean_stack = None

    slice_indices = split_stack_indices(
        num_slices=stack.shape[0], split_ratio=config['split_ratio'],
        seed=config['random_seed'], verbose=verbose)

    if config['normalize_method'] == 'zscore':
        train_slices = stack[slice_indices['train']]
        config['_norm_stats'] = {'mean': float(train_slices.mean()),
                                 'std': float(train_slices.std()), 'eps': 1e-6}
        print(f"Normalization (zscore): train mean={config['_norm_stats']['mean']:.6f}, "
              f"std={config['_norm_stats']['std']:.6f}")

    # ---- save the resolved config ------------------------------------------
    def _json_safe(v):
        if isinstance(v, tuple):
            return list(v)
        if isinstance(v, dict):
            return {k: _json_safe(x) for k, x in v.items()}
        if isinstance(v, (list, str, int, float, bool, type(None))):
            return v
        return str(v)
    with open(os.path.join(dirs['experiment'], 'config.json'), 'w') as fh:
        json.dump({k: _json_safe(v) for k, v in config.items()}, fh, indent=4)

    summary = {'experiment_dir': dirs['experiment'], 'config': config}

    # ---- step 1: route -----------------------------------------------------
    print("\n" + "=" * 40)
    print("Step 1: Resolve mask -> route")
    print("=" * 40)
    decision = resolve_route(config, stack, dirs=dirs, verbose=verbose)

    if isinstance(decision, InputDecisionRequired):
        # Review mode: nothing trained; the user inspects and re-runs.
        print("\n" + "!" * 40)
        print("REVIEW HALT — extractor input source undecided")
        print("!" * 40)
        print(decision.message)
        summary.update(halted=True, halt_reason=decision.reason,
                       mask_review_dir=decision.review_dir,
                       mask_review_figure=decision.figure_path)
        return summary

    print(decision.message)
    branch = decision.branch
    recipe = config['recipes'][branch]
    kernel = decision.mask

    mask_path = os.path.join(dirs['model'], 'routed_mask.npy')
    np.save(mask_path, kernel)
    with open(os.path.join(dirs['experiment'], 'route_decision.json'), 'w') as fh:
        json.dump({'branch': branch, 'reason': decision.reason,
                   'mask_px': int(kernel.sum()), 'mask_shape': list(kernel.shape),
                   'metrics': {k: (float(v) if isinstance(v, (int, float)) else v)
                               for k, v in decision.metrics.items()}}, fh, indent=2)

    summary.update(branch=branch, route_reason=decision.reason,
                   route_metrics=decision.metrics, mask_path=mask_path)

    # ---- step 2: train the selected branch ---------------------------------
    print("\n" + "=" * 40)
    print(f"Step 2: Train the {branch} branch")
    print("=" * 40)
    train_loader, val_loader, test_loader = create_routed_dataloaders(
        config, recipe, kernel, stack, slice_indices, verbose=verbose)

    model = _create_branch_model(recipe, branch)
    if verbose:
        total_params = sum(p.numel() for p in model.parameters())
        print(f"Model parameters: {total_params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=recipe['learning_rate'])
    # Tier A2 scheduler settings (see 2026-05-14 finding S1): wide patience +
    # LR floor; applied to both branches under the routed pipeline.
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.1, patience=20, min_lr=1e-6)

    hparams = dict(config)
    hparams[branch] = recipe                # trainer reads hparams[<stage key>]
    trainer = AutoStructN2VTrainer(
        model=model, optimizer=optimizer, scheduler=scheduler, device=device,
        hparams=hparams, stage=branch,
        experiment_name=os.path.join(dirs['logs'], datetime.now().strftime('%Y%m%d-%H%M%S')),
        clean_stack=clean_stack,
        val_indices=slice_indices['val'],
        aux_psnr_indices=list(slice_indices['train']) + list(slice_indices['val']),
        norm_stats=config.get('_norm_stats'),
    )
    trainer.train(train_loader, val_loader, test_loader)

    checkpoint_path = os.path.join(dirs['model'], 'model.pth')
    trainer.save_checkpoint(checkpoint_path)
    print(f"Saved model to {checkpoint_path}")
    summary['model_path'] = checkpoint_path

    # ---- step 3: predict the full stack ------------------------------------
    print("\n" + "=" * 40)
    print("Step 3: Predict")
    print("=" * 40)
    trained = _create_branch_model(recipe, branch).to(device)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    trained.load_state_dict(checkpoint['model_state_dict'])
    trained.eval()

    predictor = AutoStructN2VPredictor(
        model=trained, patch_size=recipe['patch_size'], mode='2d',
        norm_stats=config.get('_norm_stats'),
        overlap_tile_pad=recipe.get('overlap_tile_pad', 0))
    output_path = os.path.join(dirs['final_results'], 'denoised_stack.tif')
    predictor.denoise_stack(input_path=config['input_data'],
                            output_path=output_path, dtype='float32')
    summary['final_results_dir'] = dirs['final_results']
    summary['denoised_stack'] = output_path

    print("\n" + "=" * 40)
    print("Pipeline Complete")
    print("=" * 40)
    print(f"Experiment: {config['experiment_name']}")
    print(f"Route: {branch} ({decision.reason}); mask {kernel.shape}, "
          f"{int(kernel.sum())} px")
    print(f"Denoised stack: {output_path}")
    return summary
