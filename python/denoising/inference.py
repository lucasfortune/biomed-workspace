"""
Inference functions for the denoising package.

Handles:
- Single model inference (run_inference)
- Sequential two-stage inference (run_sequential_inference)
- Both 2D and 2.5D modes
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

from .utils import emit_progress, emit_result, emit_error, safe_load_checkpoint
from .models import CenterChannelWrapper


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
    if original_dtype == np.uint8:
        norm = stack_f / 255.0
        def denorm(arr): return (arr * 255.0).astype(original_dtype)
    elif original_dtype == np.uint16:
        norm = stack_f / 65535.0
        def denorm(arr): return (arr * 65535.0).astype(original_dtype)
    elif np.issubdtype(original_dtype, np.floating) and (stack_f.max() > 1.0 or stack_f.min() < 0.0):
        smin, smax = float(stack_f.min()), float(stack_f.max())
        norm = (stack_f - smin) / (smax - smin + 1e-8)
        def denorm(arr): return (arr * (smax - smin) + smin).astype(original_dtype)
    else:
        norm = stack_f
        def denorm(arr): return arr.astype(original_dtype)
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

        # Create predictor with mode
        patch_size = model_config.get('patch_size', 64)
        predictor = AutoStructN2VPredictor(
            model=inference_model,
            patch_size=patch_size,
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

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "processing",
            "mode": mode,
            "totalSlices": total_slices
        })

        # Defer to the predictor's slice-level routines (_predict_2d /
        # _predict_2_5d) for both modes — those internals handle overlap-tile
        # padding, central-region patch weighting, and slice-level z-score
        # together. Looping `denoise_tensor` per slice here bypasses the
        # overlap-tile padding and produces a black border the width of
        # `overlap_tile_pad` around every output slice. Per-slice progress is
        # downgraded to start/end events; the predictor's tqdm still streams
        # progress to stdout for the operator log.
        if norm_stats is not None:
            input_norm, denorm = _dtype_normalize(input_stack)
        else:
            input_min, input_max = input_stack.min(), input_stack.max()
            input_norm = (input_stack - input_min) / (input_max - input_min + 1e-8)
            input_norm = input_norm.astype(np.float32)
            def denorm(arr):
                return (arr * (input_max - input_min) + input_min).astype(input_stack.dtype)

        if mode == '2.5d':
            output_stack = predictor._predict_2_5d(input_norm)
        else:
            output_stack = predictor._predict_2d(input_norm)

        output_stack = denorm(output_stack)

        emit_progress('inference', {
            "inference_id": inference_id,
            "currentSlice": total_slices,
            "totalSlices": total_slices,
            "progressPercent": 100.0,
            "mode": mode
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

        patch_size = stage1_config.get('patch_size', 64)
        stage1_predictor = AutoStructN2VPredictor(
            model=stage1_inference_model,
            patch_size=patch_size,
            mode=mode,
            norm_stats=stage1_norm_stats,
            overlap_tile_pad=stage1_overlap_pad,
        )

        # Match training-time input domain (dtype-based [0,1]) when zscore is
        # active so the predictor's internal stats apply to the same scale they
        # were computed on. Otherwise keep the legacy per-stack min-max path.
        if stage1_norm_stats is not None:
            input_normalized, _ = _dtype_normalize(input_stack)
        else:
            input_min, input_max = input_stack.min(), input_stack.max()
            input_normalized = (input_stack - input_min) / (input_max - input_min + 1e-8)
            input_normalized = input_normalized.astype(np.float32)

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

        # Save Stage 1 intermediate output
        mode_suffix = '_2.5d' if mode == '2.5d' else ''
        stage1_output_path = os.path.join(output_dir, f'stage1{mode_suffix}_denoised_{inference_id}.tif')
        tifffile.imwrite(stage1_output_path, stage1_output.astype(np.float32))

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

        patch_size = stage2_config.get('patch_size', 64)
        stage2_predictor = AutoStructN2VPredictor(
            model=stage2_model,
            patch_size=patch_size,
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

        # Save final output with proper naming convention
        output_filename = f'asn2v{mode_suffix}_denoised_{inference_id}.tif'
        output_path = os.path.join(output_dir, output_filename)
        tifffile.imwrite(output_path, stage2_output.astype(np.float32))

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
