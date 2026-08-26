"""
Inference functions for the denoising package.

Handles:
- Single model inference (run_inference): routed v1.0 checkpoints AND
  legacy two-stage checkpoints (2D and 2.5D) through the same endpoint;
  the checkpoint's hparams decide which path runs.
- Sequential two-stage inference (run_sequential_inference): LEGACY
  imported stage1+stage2 model pairs only.
"""

import os
import json
import time
import traceback
from datetime import datetime

import torch
import numpy as np
import tifffile
from tiff_validation_utils import safe_imread

from autoStructN2V.models import create_model_from_config
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.pipeline.runner import _create_branch_model

from .utils import emit_progress, emit_result, emit_error, safe_load_checkpoint
from .models import CenterChannelWrapper


def _routed_branch(checkpoint):
    """Return the routed branch name for a v1.0 checkpoint, else None.

    Routed checkpoints persist the branch recipe under hparams['n2v'] or
    hparams['structn2v'] (plus the full 'recipes' dict); legacy two-stage
    checkpoints carry hparams['stage1'] / hparams['stage2'] instead.
    """
    if not isinstance(checkpoint, dict):
        return None
    hparams = checkpoint.get('hparams') or {}
    for branch in ('structn2v', 'n2v'):
        if isinstance(hparams.get(branch), dict):
            return branch
    return None


def _run_routed_inference(config, checkpoint, branch, inference_id, device):
    """Inference with a routed v1.0 checkpoint.

    The checkpoint's hparams are authoritative: branch recipe (architecture,
    patch_size, overlap_tile_pad, norm_type) and _norm_stats. Input slices
    are round-tripped through the same per-slice [0,1] normalization the
    model was trained on (load_tiff_stack convention) and the output keeps
    the input's native dtype.
    """
    hparams = checkpoint.get('hparams') or {}
    recipe = hparams[branch]
    norm_stats = hparams.get('_norm_stats')
    method = hparams.get('method') or ('n2v' if branch == 'n2v' else 'autostructn2v')

    emit_progress('inference', {
        "inference_id": inference_id,
        "status": "loading_model",
        "mode": "routed",
        "branch": branch,
        "device": str(device)
    })

    model = _create_branch_model(recipe, branch).to(device)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    patch_size = recipe['patch_size']
    # stride=patch_size//4 to soften stride-boundary seams (see training.py).
    predictor = AutoStructN2VPredictor(
        model=model,
        patch_size=patch_size,
        stride=max(1, patch_size // 4),
        mode='2d',
        norm_stats=norm_stats,
        overlap_tile_pad=recipe.get('overlap_tile_pad', 0),
    )

    emit_progress('inference', {
        "inference_id": inference_id,
        "status": "loading_data",
        "mode": "routed"
    })

    input_path = config['input_path']
    output_dir = config['output_dir']
    input_stack = safe_imread(input_path)
    if input_stack.ndim == 2:
        input_stack = input_stack[np.newaxis, ...]

    original_dtype = input_stack.dtype
    total_slices = len(input_stack)
    is_float = np.issubdtype(original_dtype, np.floating)

    emit_progress('inference', {
        "inference_id": inference_id,
        "status": "processing",
        "mode": "routed",
        "total_slices": total_slices
    })

    output_stack = np.zeros_like(input_stack)
    for z in range(total_slices):
        slice_data = input_stack[z].astype(np.float32)
        smin, smax = float(slice_data.min()), float(slice_data.max())
        slice_norm = (slice_data - smin) / (smax - smin + 1e-8)
        out_norm = predictor._predict_2d(slice_norm[np.newaxis, ...])[0]
        out_dn = np.clip(out_norm, 0.0, 1.0) * (smax - smin) + smin
        output_stack[z] = (out_dn if is_float else np.round(out_dn)).astype(original_dtype)
        emit_progress('inference', {
            "inference_id": inference_id,
            "current_slice": z + 1,
            "total_slices": total_slices,
            "progress_percent": ((z + 1) / total_slices) * 100.0,
            "mode": "routed",
        })

    os.makedirs(output_dir, exist_ok=True)
    method_prefix = 'n2v' if method == 'n2v' else 'asn2v'
    output_filename = f'{method_prefix}_denoised_{inference_id}.tif'
    output_path = os.path.join(output_dir, output_filename)
    tifffile.imwrite(output_path, output_stack)

    metadata = {
        "inference_id": inference_id,
        "method": method,
        "mode": "routed",
        "branch": branch,
        "input_path": input_path,
        "output_path": output_path,
        "model_path": config['model_path'],
        "slices_processed": total_slices,
        "completed_at": datetime.now().isoformat()
    }
    metadata_path = os.path.join(output_dir, 'inference_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=4)

    emit_result('inference', {
        "inference_id": inference_id,
        "outputPath": output_path,
        "metadataPath": metadata_path,
        "totalSlices": total_slices,
        "method": method,
        "mode": "routed",
        "branch": branch
    })


def _extract_training_hparams(checkpoint, stage):
    """Read norm_stats and overlap_tile_pad out of a saved checkpoint's hparams.

    Both fields are stashed in the trainer's `hparams` dict (the full training
    config) and persisted by `BaseTrainer.save_checkpoint`. They are needed at
    inference time so the predictor mirrors the training-time input pipeline.
    Returns (norm_stats, overlap_tile_pad) — either may be None/0 for models
    trained before the migration.
    """
    if not isinstance(checkpoint, dict):
        return None, 0
    hparams = checkpoint.get('hparams') or {}
    norm_stats = hparams.get('_norm_stats')
    stage_hp = hparams.get(stage) or {}
    overlap_tile_pad = int(stage_hp.get('overlap_tile_pad', 0))
    return norm_stats, overlap_tile_pad


def _stage_params_from_checkpoint(checkpoint, stage, fallback):
    """Build the `stage_params` dict for create_model_from_config.

    The frontend's `model_config` historically only forwarded four fields
    (features, num_layers, use_resize_conv, upsampling_mode), but the
    migration added architecture-changing knobs (`remove_top_skip`,
    `use_blurpool`, `activation`). Building the model from the frontend's
    fields alone would produce an architecture that doesn't match the
    checkpoint, causing `load_state_dict` to error out (or silently load
    a mismatched model on strict=False, which would yield garbage outputs).

    The checkpoint's `hparams[stage]` is the authoritative record of what
    architecture was actually trained, so we prefer those values and fall
    back to `model_config` (and finally library defaults) for any keys the
    checkpoint doesn't carry — keeping pre-migration models loadable.
    """
    hparams = checkpoint.get('hparams') if isinstance(checkpoint, dict) else None
    stage_hp = (hparams or {}).get(stage) or {}
    def pick(key, default):
        if key in stage_hp:
            return stage_hp[key]
        return fallback.get(key, default)
    return {
        'features': pick('features', 64),
        'num_layers': pick('num_layers', 2),
        'use_resize_conv': pick('use_resize_conv', True),
        'upsampling_mode': pick('upsampling_mode', 'bilinear'),
        'remove_top_skip': pick('remove_top_skip', False),
        'use_blurpool': pick('use_blurpool', False),
        'activation': pick('activation', 'elu'),
        'patch_size': pick('patch_size', 64),
    }


def _dtype_normalize(stack):
    """Apply the same [0,1] dtype-based normalization training uses.

    Returns (normalized_float32_stack, denorm_fn) where denorm_fn(arr) maps a
    float array in [0,1] back to the original dtype's range. Used at inference
    time when norm_stats is set, so the predictor sees the same input domain
    the train-time z-score stats were computed on.
    """
    original_dtype = stack.dtype
    stack_f = stack.astype(np.float32)
    # Clip before integer cast so unbounded predictions (z-score denorm can
    # return values slightly outside [0, 1]) don't wrap to the opposite end
    # of the dtype's range — e.g. 1.02 * 65535 = 66846 → casts to 1311 in
    # uint16, which renders as a black pixel where a bright one belongs.
    if original_dtype == np.uint8:
        norm = stack_f / 255.0
        def denorm(arr): return (np.clip(arr, 0.0, 1.0) * 255.0).astype(original_dtype)
    elif original_dtype == np.uint16:
        norm = stack_f / 65535.0
        def denorm(arr): return (np.clip(arr, 0.0, 1.0) * 65535.0).astype(original_dtype)
    elif np.issubdtype(original_dtype, np.floating):
        # Always rescale floats to [0, 1] via min-max — partial-range inputs
        # like [0, 0.4] would otherwise skip rescaling and feed values to the
        # predictor that fall in the far-negative regime after zscore.
        smin, smax = float(stack_f.min()), float(stack_f.max())
        norm = (stack_f - smin) / (smax - smin + 1e-8)
        def denorm(arr): return (np.clip(arr, 0.0, 1.0) * (smax - smin) + smin).astype(original_dtype)
    else:
        # Other integer types — match train-time min-max behaviour.
        smin, smax = float(stack_f.min()), float(stack_f.max())
        norm = (stack_f - smin) / (smax - smin + 1e-8)
        def denorm(arr): return (np.clip(arr, 0.0, 1.0) * (smax - smin) + smin).astype(original_dtype)
    return norm, denorm


def run_inference(config: dict):
    """
    Run inference with a trained model.

    Supports both 2D mode (per-slice processing) and 2.5D mode (triplet sliding window).

    Args:
        config: Configuration dictionary with:
            - model_path: Path to trained model checkpoint
            - input_path: Path to input TIFF stack
            - output_dir: Output directory for results
            - stage: Which model stage ('stage1' or 'stage2')
            - method: 'n2v' or 'autostructn2v'
            - mode: '2d' or '2.5d'
            - model_config: Model architecture parameters
    """
    inference_id = config.get('inference_id', f'infer_{int(time.time())}')

    try:
        model_path = config['model_path']
        input_path = config['input_path']
        output_dir = config['output_dir']
        stage = config.get('stage', 'stage1')  # Which model to use
        method = config.get('method', 'n2v')  # 'n2v' or 'autostructn2v'
        mode = config.get('mode', '2d')  # '2d' or '2.5d'

        # Get model config
        model_config = config.get('model_config', {})

        # Set device
        device = torch.device('cuda' if torch.cuda.is_available() and config.get('device', 'cuda') == 'cuda' else 'cpu')

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "loading_model",
            "mode": mode,
            "device": str(device)
        })

        # Load the checkpoint up front so we can derive the model architecture
        # from `hparams` (the authoritative record of what was trained) before
        # instantiating it. Otherwise architecture-changing N2V2 knobs the
        # frontend never forwarded — remove_top_skip, use_blurpool, activation
        # — would default to library values that don't match the saved
        # weights, breaking load_state_dict.
        checkpoint = safe_load_checkpoint(model_path, device)

        # Routed v1.0 checkpoints take the new path; legacy two-stage
        # checkpoints (2D and 2.5D) continue below unchanged.
        branch = _routed_branch(checkpoint)
        if branch is not None:
            return _run_routed_inference(config, checkpoint, branch,
                                         inference_id, device)

        stage_params = _stage_params_from_checkpoint(checkpoint, stage, model_config)
        inference_config = {
            'mode': mode,
            'run_stage2': method == 'autostructn2v',
            'stage1': stage_params,
            'stage2': stage_params,
        }

        # Build model (mode-aware) and load weights
        model = create_model_from_config(
            config=inference_config,
            stage=stage
        ).to(device)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()

        # For 2.5D autoStructN2V Stage 1, the model outputs 3 channels (for autocorrelation).
        # For inference, we only need the center channel. Wrap the model to extract it.
        inference_model = model
        if mode == '2.5d' and stage == 'stage1' and method == 'autostructn2v':
            print(f"[DEBUG] Wrapping Stage 1 model with CenterChannelWrapper for 2.5D inference")
            inference_model = CenterChannelWrapper(model)

        # Pull train-time normalization params out of the checkpoint so the
        # predictor reproduces the input pipeline the model was trained on.
        norm_stats, overlap_tile_pad = _extract_training_hparams(checkpoint, stage)
        if norm_stats is not None:
            print(f"[zscore] Inference using train stats mean={norm_stats['mean']:.6f}, std={norm_stats['std']:.6f}, overlap_tile_pad={overlap_tile_pad}")

        # Create predictor with mode. patch_size from stage_params (checkpoint)
        # so the predictor's tiling geometry matches what the model was trained
        # on. Routing from the frontend's model_config silently offsets the
        # valid-region / edge-band split when the frontend payload disagrees
        # with the checkpoint's train-time patch_size.
        patch_size = stage_params['patch_size']
        # stride=patch_size//4: smaller stride → each pixel averaged over ~4
        # patches → smoother blending across stride boundaries (the constant-
        # weight overlap-tile mask hard-averages contributing patches; with the
        # default //2 stride the rotating pair of patches at each boundary can
        # produce visible seams when the model isn't fully patch-position-
        # invariant). Cost: ~4x slower inference.
        predictor = AutoStructN2VPredictor(
            model=inference_model,
            patch_size=patch_size,
            stride=max(1, patch_size // 4),
            mode=mode,
            norm_stats=norm_stats,
            overlap_tile_pad=overlap_tile_pad,
        )

        # Load input
        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "loading_data",
            "mode": mode
        })

        input_stack = safe_imread(input_path)
        if input_stack.ndim == 2:
            input_stack = input_stack[np.newaxis, ...]

        total_slices = len(input_stack)

        # snake_case keys — match what the frontend InferenceHandler reads
        # (data.progress_percent, data.current_slice, data.total_slices).
        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "processing",
            "mode": mode,
            "total_slices": total_slices
        })

        # Two normalization regimes:
        #   • zscore: per-stack dtype rescale to [0,1], then predictor applies
        #     train-time mean/std internally. Stable across slices.
        #   • legacy (norm_stats=None): per-slice min-max — required for
        #     pre-migration models that were trained on per-slice-normalized
        #     data. Using a single per-stack min-max would compress dim slices
        #     into a tiny fraction of [0,1] on stacks with strong inter-slice
        #     brightness variation (deep z-stacks).
        if norm_stats is not None:
            input_norm, denorm = _dtype_normalize(input_stack)
            if mode == '2.5d':
                output_stack = predictor._predict_2_5d(input_norm)
            else:
                output_stack = predictor._predict_2d(input_norm)
            output_stack = denorm(output_stack)
            # Per-slice progress isn't available without a predictor callback;
            # emit start (above) and end markers only.
            emit_progress('inference', {
                "inference_id": inference_id,
                "current_slice": total_slices,
                "total_slices": total_slices,
                "progress_percent": 100.0,
                "mode": mode,
            })
        else:
            input_dtype = input_stack.dtype
            output_stack = np.zeros_like(input_stack, dtype=input_dtype)

            if mode == '2.5d':
                # 2.5D legacy: triplets need consistent scale across the
                # window, so per-slice norm would distort the relative
                # intensities the model was trained on. Fall back to per-stack
                # min-max here.
                input_min, input_max = input_stack.min(), input_stack.max()
                input_norm = (input_stack.astype(np.float32) - input_min) / (input_max - input_min + 1e-8)
                output_norm = predictor._predict_2_5d(input_norm)
                output_stack = (np.clip(output_norm, 0.0, 1.0) * (input_max - input_min) + input_min).astype(input_dtype)
                emit_progress('inference', {
                    "inference_id": inference_id,
                    "current_slice": total_slices,
                    "total_slices": total_slices,
                    "progress_percent": 100.0,
                    "mode": mode,
                })
            else:
                # 2D legacy: per-slice loop preserves the deleted per-slice
                # min-max behaviour AND gives the UI per-slice progress for
                # free. The predictor's _predict_2d handles overlap-tile
                # padding when given a single-slice stack.
                for z in range(total_slices):
                    slice_data = input_stack[z]
                    slice_min, slice_max = float(slice_data.min()), float(slice_data.max())
                    slice_norm = (slice_data.astype(np.float32) - slice_min) / (slice_max - slice_min + 1e-8)
                    out_norm = predictor._predict_2d(slice_norm[np.newaxis, ...])[0]
                    out_dn = np.clip(out_norm, 0.0, 1.0) * (slice_max - slice_min) + slice_min
                    output_stack[z] = out_dn.astype(input_dtype)
                    emit_progress('inference', {
                        "inference_id": inference_id,
                        "current_slice": z + 1,
                        "total_slices": total_slices,
                        "progress_percent": ((z + 1) / total_slices) * 100.0,
                        "mode": mode,
                    })

        # Save output with proper naming convention
        os.makedirs(output_dir, exist_ok=True)
        method_prefix = 'n2v' if method == 'n2v' else 'asn2v'
        mode_suffix = '_2.5d' if mode == '2.5d' else ''
        output_filename = f'{method_prefix}{mode_suffix}_denoised_{inference_id}.tif'
        output_path = os.path.join(output_dir, output_filename)
        tifffile.imwrite(output_path, output_stack)

        # Save metadata
        metadata = {
            "inference_id": inference_id,
            "method": method,
            "mode": mode,
            "input_path": input_path,
            "output_path": output_path,
            "model_path": model_path,
            "stage": stage,
            "slices_processed": total_slices,
            "completed_at": datetime.now().isoformat()
        }

        metadata_path = os.path.join(output_dir, 'inference_metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=4)

        emit_result('inference', {
            "inference_id": inference_id,
            "outputPath": output_path,
            "metadataPath": metadata_path,
            "totalSlices": total_slices,
            "method": method,
            "mode": mode
        })

    except Exception as e:
        emit_error('inference', str(e), traceback.format_exc())
        raise


def run_sequential_inference(config: dict):
    """
    Run sequential inference for autoStructN2V: Stage 1 (N2V) -> Stage 2 (Struct-N2V).

    This processes input data through both stages, using the output of Stage 1
    as input to Stage 2. Supports both 2D and 2.5D modes.

    Args:
        config: Configuration dictionary with:
            - stage1_model_path: Path to Stage 1 model checkpoint
            - stage2_model_path: Path to Stage 2 model checkpoint
            - input_path: Path to input TIFF stack
            - output_dir: Output directory for results
            - mode: '2d' or '2.5d'
            - stage1_config: Stage 1 model parameters
            - stage2_config: Stage 2 model parameters
    """
    inference_id = config.get('inference_id', f'infer_seq_{int(time.time())}')

    try:
        stage1_model_path = config['stage1_model_path']
        stage2_model_path = config['stage2_model_path']
        input_path = config['input_path']
        output_dir = config['output_dir']
        mode = config.get('mode', '2d')  # '2d' or '2.5d'

        stage1_config = config.get('stage1_config', {})
        stage2_config = config.get('stage2_config', {})

        # Set device
        device = torch.device('cuda' if torch.cuda.is_available() and config.get('device', 'cuda') == 'cuda' else 'cpu')

        # Load input data
        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage1",
            "status": "loading_data",
            "mode": mode
        })

        input_stack = safe_imread(input_path)
        if input_stack.ndim == 2:
            input_stack = input_stack[np.newaxis, ...]

        total_slices = len(input_stack)

        # Load BOTH checkpoints up front so the per-stage architecture (incl.
        # N2V2 knobs the frontend never forwards) is derived from each
        # checkpoint's own hparams. Otherwise the Stage 2 model could be built
        # with Stage 1's architecture (or vice versa), masking weight load
        # mismatches.
        stage1_checkpoint = safe_load_checkpoint(stage1_model_path, device)
        stage2_checkpoint = safe_load_checkpoint(stage2_model_path, device)
        inference_config = {
            'mode': mode,
            'run_stage2': True,  # Sequential means we have Stage 2
            'stage1': _stage_params_from_checkpoint(stage1_checkpoint, 'stage1', stage1_config),
            'stage2': _stage_params_from_checkpoint(stage2_checkpoint, 'stage2', stage2_config),
        }

        # =========== Stage 1: N2V ===========
        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage1",
            "status": "loading_model",
            "mode": mode,
            "device": str(device)
        })

        # Build Stage 1 model (mode-aware) and load its weights
        stage1_model = create_model_from_config(
            config=inference_config,
            stage='stage1'
        ).to(device)
        stage1_model.load_state_dict(stage1_checkpoint['model_state_dict'])
        stage1_model.eval()
        checkpoint = stage1_checkpoint  # alias used by downstream norm_stats lookup

        # For 2.5D autoStructN2V Stage 1, the model outputs 3 channels (for autocorrelation).
        # For inference, we only need the center channel. Wrap the model to extract it.
        stage1_inference_model = stage1_model
        if mode == '2.5d':
            # Check if model has 3 output channels (autoStructN2V Stage 1)
            # In 2.5D sequential inference, we always wrap Stage 1 since run_stage2=True
            print(f"[DEBUG] Wrapping Stage 1 model with CenterChannelWrapper for 2.5D inference")
            stage1_inference_model = CenterChannelWrapper(stage1_model)

        stage1_norm_stats, stage1_overlap_pad = _extract_training_hparams(checkpoint, 'stage1')

        # patch_size from checkpoint stage_params, not frontend config — see
        # corresponding change in run_inference for rationale.
        # stride=patch_size//4 to soften stride-boundary seams (see run_inference).
        patch_size = inference_config['stage1']['patch_size']
        stage1_predictor = AutoStructN2VPredictor(
            model=stage1_inference_model,
            patch_size=patch_size,
            stride=max(1, patch_size // 4),
            mode=mode,
            norm_stats=stage1_norm_stats,
            overlap_tile_pad=stage1_overlap_pad,
        )

        # Match training-time input domain (dtype-based [0,1]) when zscore is
        # active so the predictor's internal stats apply to the same scale they
        # were computed on. Otherwise keep the legacy per-stack min-max path.
        if stage1_norm_stats is not None:
            input_normalized, denorm = _dtype_normalize(input_stack)
        else:
            input_min, input_max = input_stack.min(), input_stack.max()
            input_normalized = (input_stack - input_min) / (input_max - input_min + 1e-8)
            input_normalized = input_normalized.astype(np.float32)
            input_dtype = input_stack.dtype
            def denorm(arr):
                return (arr * (input_max - input_min) + input_min).astype(input_dtype)

        # Defer to the predictor's slice-level routines for both modes so
        # overlap-tile padding + central-region weighting are handled
        # correctly. The per-slice denoise_tensor loop bypassed the outer-pad
        # band and left a black border the width of overlap_tile_pad.
        if mode == '2.5d':
            stage1_output = stage1_predictor._predict_2_5d(input_normalized)
        else:
            stage1_output = stage1_predictor._predict_2d(input_normalized)

        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage1",
            "status": "processing",
            "mode": mode,
            "progress_percent": 50
        })

        # Save Stage 1 intermediate output in the input's native dtype so it
        # renders correctly in viewers calibrated for the input range.
        mode_suffix = '_2.5d' if mode == '2.5d' else ''
        stage1_output_path = os.path.join(output_dir, f'stage1{mode_suffix}_denoised_{inference_id}.tif')
        tifffile.imwrite(stage1_output_path, denorm(stage1_output))

        # Release Stage 1 GPU resources before allocating Stage 2's model.
        # Without this, stage1_ckpt + stage1_model + stage1_predictor live
        # alongside stage2_ckpt + stage2_model and OOM small-VRAM GPUs.
        del stage1_checkpoint, stage1_model, stage1_inference_model, stage1_predictor
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # =========== Stage 2: Struct-N2V ===========
        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage2",
            "status": "loading_model",
            "mode": mode
        })

        # Build Stage 2 model (mode-aware) and load its weights from the
        # checkpoint loaded up front.
        stage2_model = create_model_from_config(
            config=inference_config,
            stage='stage2'
        ).to(device)
        stage2_model.load_state_dict(stage2_checkpoint['model_state_dict'])
        stage2_model.eval()
        checkpoint = stage2_checkpoint  # downstream norm_stats lookup

        stage2_norm_stats, stage2_overlap_pad = _extract_training_hparams(checkpoint, 'stage2')

        # patch_size from checkpoint stage_params (see Stage 1 above).
        # stride=patch_size//4 to soften stride-boundary seams (see run_inference).
        patch_size = inference_config['stage2']['patch_size']
        stage2_predictor = AutoStructN2VPredictor(
            model=stage2_model,
            patch_size=patch_size,
            stride=max(1, patch_size // 4),
            mode=mode,
            norm_stats=stage2_norm_stats,
            overlap_tile_pad=stage2_overlap_pad,
        )

        # Stage 1's output is already in the per-slice [0,1] domain Stage 2 was
        # trained on; both _predict_2d and _predict_2_5d apply zscore +
        # overlap-tile padding internally.
        if mode == '2.5d':
            stage2_output = stage2_predictor._predict_2_5d(stage1_output.astype(np.float32))
        else:
            stage2_output = stage2_predictor._predict_2d(stage1_output.astype(np.float32))

        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage2",
            "status": "processing",
            "mode": mode,
            "progress_percent": 100
        })

        # Save final output in the input's native dtype, matching single-stage
        # run_inference. Without denorm, viewers calibrated for uint16 render
        # the [0,1] float32 as near-black.
        output_filename = f'asn2v{mode_suffix}_denoised_{inference_id}.tif'
        output_path = os.path.join(output_dir, output_filename)
        tifffile.imwrite(output_path, denorm(stage2_output))

        # Save metadata
        metadata = {
            "inference_id": inference_id,
            "method": "autostructn2v",
            "mode": mode,
            "input_path": input_path,
            "output_path": output_path,
            "stage1_output_path": stage1_output_path,
            "stage1_model_path": stage1_model_path,
            "stage2_model_path": stage2_model_path,
            "slices_processed": total_slices,
            "completed_at": datetime.now().isoformat()
        }

        metadata_path = os.path.join(output_dir, 'inference_metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=4)

        emit_result('inference', {
            "inference_id": inference_id,
            "outputPath": output_path,
            "stage1OutputPath": stage1_output_path,
            "metadataPath": metadata_path,
            "totalSlices": total_slices,
            "method": "autostructn2v",
            "mode": mode
        })

    except Exception as e:
        emit_error('inference', str(e), traceback.format_exc())
        raise
