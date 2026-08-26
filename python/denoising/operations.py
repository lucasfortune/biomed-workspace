"""
Special operations for the denoising package (routed v1.0).

Handles:
- extract_mask: standalone mask extraction + routing on the RAW stack
  (mask regeneration from the approval UI; seconds, no training)
- continue_training: run the single routed training after mask approval
  (replaces the old train_stage2_only / finalize_stage1_only pair;
  override_branch='n2v' covers the old "skip" semantics)
"""

import os
import json
import time
import traceback

import numpy as np

from autoStructN2V.pipeline.config import (validate_config,
                                           create_output_directories,
                                           EXTRACTOR_DEFAULTS)
from autoStructN2V.pipeline.runner import _automask_kwargs
from autoStructN2V.masking.autoextract import AutoMaskExtractor, RouteDecision
from autoStructN2V.utils.image import load_tiff_stack
from autoStructN2V.utils.training import set_seed

from .utils import emit_progress, emit_result, emit_error
from .training import (
    prepare_stack_and_stats,
    route_payload,
    save_route_artifacts,
    train_and_predict,
)


def extract_mask(config: dict):
    """
    Extract the structural mask and routing decision from the raw stack.

    Used by the regenerate-mask endpoint while the run is paused for
    approval. Runs in seconds on CPU; no training involved.

    Args:
        config: Configuration dictionary with:
            - input_path: Path to the RAW input stack (.tif)
            - output_dir: Directory to save the extracted mask into
            - extractor: Extractor parameters (bg_side required; unset keys
              fall back to the library defaults, rho_floor 0.05 included)
            - training_id: Optional session ID echoed in the payload
    """
    try:
        input_path = config['input_path']
        output_dir = config['output_dir']
        training_id = config.get('training_id')

        extractor_params = dict(EXTRACTOR_DEFAULTS)
        extractor_params.update(config.get('extractor') or {})
        if extractor_params.get('bg_side') not in ('light', 'dark', 'off', 'auto'):
            raise ValueError(
                "extractor.bg_side is required: 'light' (dense EM), 'dark' "
                f"(fluorescence-like), or 'off' (flatness-only). "
                f"Got {extractor_params.get('bg_side')!r}.")

        emit_progress('mask', {"status": "loading", "training_id": training_id})
        stack = load_tiff_stack(input_path)

        emit_progress('mask', {"status": "extracting", "training_id": training_id,
                               "numSlices": int(stack.shape[0])})
        extractor = AutoMaskExtractor(**_automask_kwargs(extractor_params))
        decision, info = extractor.route(stack, verbose=False)
        mask_rho2 = info.get('mask_rho2')
        mask_rho2 = float(mask_rho2) if mask_rho2 is not None else None

        os.makedirs(output_dir, exist_ok=True)
        mask_path = os.path.join(output_dir, 'extracted_mask.npy')
        np.save(mask_path, decision.mask)

        emit_result('mask', route_payload(training_id, decision, mask_path,
                                          mask_rho2))

    except Exception as e:
        emit_error('mask', str(e), traceback.format_exc())
        raise


def _decision_for_continue(config, experiment_dir):
    """Reconstruct the RouteDecision to train with after approval.

    override_branch='n2v' forces the plain-N2V branch (1x1 center kernel;
    the old "Skip Stage 2" semantics). Otherwise the approved kernel is
    loaded from mask_path; the branch follows from the kernel itself
    (>1 px -> structn2v). The original route metrics are carried over from
    route_decision.json when the kernel is unchanged; a regenerated kernel
    gets reason 'approved'.
    """
    saved = {}
    decision_path = os.path.join(experiment_dir, 'route_decision.json')
    if os.path.exists(decision_path):
        with open(decision_path) as fh:
            saved = json.load(fh)

    if config.get('override_branch') == 'n2v':
        return RouteDecision('n2v', RouteDecision.center_kernel(1),
                             'user_override', saved.get('metrics')), \
            saved.get('mask_rho2')

    mask_path = config.get('mask_path')
    if not mask_path or not os.path.exists(mask_path):
        raise FileNotFoundError(f"Approved mask file not found: {mask_path}")
    kernel = np.load(mask_path).astype(bool)
    if kernel.ndim != 2:
        raise ValueError(f"Expected a 2D mask kernel, got shape {kernel.shape}")

    branch = 'structn2v' if int(kernel.sum()) > 1 else 'n2v'
    unchanged = (saved.get('mask_shape') == list(kernel.shape)
                 and saved.get('mask_px') == int(kernel.sum())
                 and saved.get('branch') == branch)
    reason = saved.get('reason') if unchanged else 'approved'
    return RouteDecision(branch, kernel, reason or 'approved',
                         saved.get('metrics')), \
        (saved.get('mask_rho2') if unchanged else None)


def continue_training(config: dict):
    """
    Run the single routed training after the user approved the mask.

    Args:
        config: Configuration dictionary with:
            - training_id: The original training session ID
            - experiment_dir: Experiment directory from the paused run
              (holds config.json + route_decision.json)
            - mask_path: Path to the approved mask .npy (original routed
              mask or a regenerated one)
            - override_branch: Optional 'n2v' to force plain N2V regardless
              of the discovered mask (the old "skip" action)
    """
    training_id = config.get('training_id', f'train_{int(time.time())}')

    try:
        experiment_dir = config.get('experiment_dir')
        if not experiment_dir or not os.path.exists(experiment_dir):
            raise ValueError(f"Experiment directory not found: {experiment_dir}")

        config_path = os.path.join(experiment_dir, 'config.json')
        if not os.path.exists(config_path):
            raise FileNotFoundError(
                f"Saved training config not found: {config_path}")
        with open(config_path) as fh:
            cfg = json.load(fh)

        # Re-validate for robustness; the saved config is already resolved,
        # so this only re-checks paths and re-fills anything JSON dropped.
        cfg = validate_config(cfg)
        verbose = cfg.get('verbose', False)

        dirs = create_output_directories(cfg)
        set_seed(cfg['random_seed'])

        import torch
        emit_progress('init', {
            "training_id": training_id,
            "method": "autostructn2v",
            "mode": "routed_continue",
            "device": cfg['device'],
            "gpuAvailable": torch.cuda.is_available()
        })

        # Same deterministic split + saved zscore stats as the paused run
        # (prepare_stack_and_stats skips recomputation when _norm_stats is set).
        stack, slice_indices = prepare_stack_and_stats(cfg, verbose=verbose)

        decision, mask_rho2 = _decision_for_continue(config, experiment_dir)
        print(decision.message)

        # Refresh the route artifacts so routed_mask.npy is the kernel that
        # actually trains (it may have been regenerated or overridden).
        save_route_artifacts(dirs, decision, mask_rho2)

        return train_and_predict(cfg, dirs, stack, slice_indices, decision,
                                 training_id, 'autostructn2v', mask_rho2)

    except Exception as e:
        emit_error('training', str(e), traceback.format_exc())
        raise
