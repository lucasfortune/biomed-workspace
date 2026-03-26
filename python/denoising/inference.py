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

        # Build config for create_model_from_config (needs stage-specific nested dict)
        stage_params = {
            'features': model_config.get('features', 64),
            'num_layers': model_config.get('num_layers', 2),
            'use_resize_conv': model_config.get('use_resize_conv', True),
            'upsampling_mode': model_config.get('upsampling_mode', 'bilinear')
        }
        inference_config = {
            'mode': mode,
            'run_stage2': method == 'autostructn2v',
            'stage1': stage_params,
            'stage2': stage_params
        }

        # Load model (mode-aware)
        model = create_model_from_config(
            config=inference_config,
            stage=stage
        ).to(device)

        checkpoint = safe_load_checkpoint(model_path, device)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()

        # For 2.5D autoStructN2V Stage 1, the model outputs 3 channels (for autocorrelation).
        # For inference, we only need the center channel. Wrap the model to extract it.
        inference_model = model
        if mode == '2.5d' and stage == 'stage1' and method == 'autostructn2v':
            print(f"[DEBUG] Wrapping Stage 1 model with CenterChannelWrapper for 2.5D inference")
            inference_model = CenterChannelWrapper(model)

        # Create predictor with mode
        patch_size = model_config.get('patch_size', 64)
        predictor = AutoStructN2VPredictor(model=inference_model, patch_size=patch_size, mode=mode)

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

        if mode == '2.5d':
            # 2.5D mode: Use predictor's internal _predict_2_5d method (triplet sliding window)
            # Note: denoise_stack() expects a file path, but we have the array in memory
            # Normalize input
            input_min, input_max = input_stack.min(), input_stack.max()
            input_norm = (input_stack - input_min) / (input_max - input_min + 1e-8)
            input_norm = input_norm.astype(np.float32)

            # Denoise using 2.5D sliding window (use internal method for array input)
            output_stack = predictor._predict_2_5d(input_norm)

            # Rescale to original range
            output_stack = output_stack * (input_max - input_min) + input_min
            output_stack = output_stack.astype(input_stack.dtype)

            emit_progress('inference', {
                "inference_id": inference_id,
                "currentSlice": total_slices,
                "totalSlices": total_slices,
                "progressPercent": 100.0,
                "mode": mode
            })
        else:
            # 2D mode: Process each slice independently
            output_stack = []

            for i, slice_img in enumerate(input_stack):
                # Normalize
                slice_norm = (slice_img - slice_img.min()) / (slice_img.max() - slice_img.min() + 1e-8)
                slice_norm = slice_norm.astype(np.float32)

                # Convert to tensor and denoise
                slice_tensor = torch.from_numpy(slice_norm).unsqueeze(0).unsqueeze(0)  # Add batch and channel dims
                denoised_tensor = predictor.denoise_tensor(slice_tensor)
                denoised = denoised_tensor.squeeze().cpu().numpy()

                # Rescale to original range
                denoised_rescaled = denoised * (slice_img.max() - slice_img.min()) + slice_img.min()
                output_stack.append(denoised_rescaled.astype(slice_img.dtype))

                # Emit progress
                if (i + 1) % 5 == 0 or i == total_slices - 1:
                    emit_progress('inference', {
                        "inference_id": inference_id,
                        "currentSlice": i + 1,
                        "totalSlices": total_slices,
                        "progressPercent": round((i + 1) / total_slices * 100, 1),
                        "mode": mode
                    })

            output_stack = np.array(output_stack)

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

        # Build config for create_model_from_config (needs stage-specific nested dicts)
        inference_config = {
            'mode': mode,
            'run_stage2': True,  # Sequential means we have Stage 2
            'stage1': {
                'features': stage1_config.get('features', 64),
                'num_layers': stage1_config.get('num_layers', 2),
                'use_resize_conv': stage1_config.get('use_resize_conv', True),
                'upsampling_mode': stage1_config.get('upsampling_mode', 'bilinear')
            },
            'stage2': {
                'features': stage2_config.get('features', 64),
                'num_layers': stage2_config.get('num_layers', 2),
                'use_resize_conv': stage2_config.get('use_resize_conv', True),
                'upsampling_mode': stage2_config.get('upsampling_mode', 'bilinear')
            }
        }

        # =========== Stage 1: N2V ===========
        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage1",
            "status": "loading_model",
            "mode": mode,
            "device": str(device)
        })

        # Load Stage 1 model (mode-aware)
        stage1_model = create_model_from_config(
            config=inference_config,
            stage='stage1'
        ).to(device)

        checkpoint = safe_load_checkpoint(stage1_model_path, device)
        stage1_model.load_state_dict(checkpoint['model_state_dict'])
        stage1_model.eval()

        # For 2.5D autoStructN2V Stage 1, the model outputs 3 channels (for autocorrelation).
        # For inference, we only need the center channel. Wrap the model to extract it.
        stage1_inference_model = stage1_model
        if mode == '2.5d':
            # Check if model has 3 output channels (autoStructN2V Stage 1)
            # In 2.5D sequential inference, we always wrap Stage 1 since run_stage2=True
            print(f"[DEBUG] Wrapping Stage 1 model with CenterChannelWrapper for 2.5D inference")
            stage1_inference_model = CenterChannelWrapper(stage1_model)

        patch_size = stage1_config.get('patch_size', 64)
        stage1_predictor = AutoStructN2VPredictor(model=stage1_inference_model, patch_size=patch_size, mode=mode)

        # Normalize input
        input_min, input_max = input_stack.min(), input_stack.max()
        input_normalized = (input_stack - input_min) / (input_max - input_min + 1e-8)
        input_normalized = input_normalized.astype(np.float32)

        # Process Stage 1
        if mode == '2.5d':
            # 2.5D mode: Use predictor's internal _predict_2_5d method
            # Note: denoise_stack() expects a file path, but we have the array in memory
            stage1_output = stage1_predictor._predict_2_5d(input_normalized)

            emit_progress('inference', {
                "inference_id": inference_id,
                "stage": "stage1",
                "status": "processing",
                "mode": mode,
                "progress_percent": 50
            })
        else:
            # 2D mode: Process each slice independently
            stage1_output = []
            for i, img in enumerate(input_normalized):
                img_tensor = torch.from_numpy(img).unsqueeze(0).unsqueeze(0)
                denoised_tensor = stage1_predictor.denoise_tensor(img_tensor)
                denoised = denoised_tensor.squeeze().cpu().numpy()
                stage1_output.append(denoised)

                progress_percent = ((i + 1) / total_slices) * 50
                emit_progress('inference', {
                    "inference_id": inference_id,
                    "stage": "stage1",
                    "status": "processing",
                    "mode": mode,
                    "current_slice": i + 1,
                    "total_slices": total_slices,
                    "progress_percent": progress_percent
                })

            stage1_output = np.array(stage1_output)

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

        # Load Stage 2 model (mode-aware)
        stage2_model = create_model_from_config(
            config=inference_config,
            stage='stage2'
        ).to(device)

        checkpoint = safe_load_checkpoint(stage2_model_path, device)
        stage2_model.load_state_dict(checkpoint['model_state_dict'])
        stage2_model.eval()

        patch_size = stage2_config.get('patch_size', 64)
        stage2_predictor = AutoStructN2VPredictor(model=stage2_model, patch_size=patch_size, mode=mode)

        # Process Stage 2 using Stage 1 output
        if mode == '2.5d':
            # 2.5D mode: Use predictor's internal _predict_2_5d method
            # Note: denoise_stack() expects a file path, but we have the array in memory
            stage2_output = stage2_predictor._predict_2_5d(stage1_output)

            emit_progress('inference', {
                "inference_id": inference_id,
                "stage": "stage2",
                "status": "processing",
                "mode": mode,
                "progress_percent": 100
            })
        else:
            # 2D mode: Process each slice independently
            stage2_output = []
            for i, img in enumerate(stage1_output):
                img_float = img.astype(np.float32)
                img_tensor = torch.from_numpy(img_float).unsqueeze(0).unsqueeze(0)
                denoised_tensor = stage2_predictor.denoise_tensor(img_tensor)
                denoised = denoised_tensor.squeeze().cpu().numpy()
                stage2_output.append(denoised)

                progress_percent = 50 + ((i + 1) / total_slices) * 50
                emit_progress('inference', {
                    "inference_id": inference_id,
                    "stage": "stage2",
                    "status": "processing",
                    "mode": mode,
                    "current_slice": i + 1,
                    "total_slices": total_slices,
                    "progress_percent": progress_percent
                })

            stage2_output = np.array(stage2_output)

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
