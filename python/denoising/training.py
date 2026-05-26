"""
Training orchestration for the denoising package.

Contains the main run_training function that handles:
- Stage 1 (N2V) training
- Mask extraction
- Stage 2 (autoStructN2V) training
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

from autoStructN2V.pipeline.config import validate_config, create_output_directories
from autoStructN2V.pipeline.data import split_dataset, create_dataloaders, split_stack_indices
from autoStructN2V.models import create_model_from_config
from autoStructN2V.masking import StructuralNoiseExtractor
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.utils.image import load_and_normalize_image
from autoStructN2V.utils.training import set_seed

from .utils import (
    emit_progress,
    emit_result,
    emit_error,
    safe_load_checkpoint,
    convert_to_original_dtype,
    detect_pattern
)
from .models import CenterChannelWrapper, extract_triplet_patches
from .trainer import WebAutoStructN2VTrainer
from .data_prep import prepare_input_directory
from .output import finalize_training_output


def create_progress_callback(stage: str, training_id: str):
    """
    Create a progress callback function for the given stage.

    Args:
        stage: Training stage name ('stage1' or 'stage2')
        training_id: Unique training session ID

    Returns:
        Callback function that emits progress updates
    """
    start_time = time.time()

    def callback(epoch, total_epochs, train_loss, val_loss, lr, early_stopped=False):
        elapsed = time.time() - start_time
        remaining = (elapsed / epoch) * (total_epochs - epoch) if epoch > 0 else 0

        emit_progress(stage, {
            "training_id": training_id,
            "epoch": epoch,
            "totalEpochs": total_epochs,
            "trainLoss": float(train_loss),
            "valLoss": float(val_loss),
            "learningRate": float(lr),
            "timeElapsed": elapsed,
            "timeRemaining": remaining,
            "earlyStopped": early_stopped
        })

    return callback


def run_training(config: dict):
    """
    Run training with progress callbacks.

    This is a modified version of run_pipeline that emits progress.
    Supports both 2D mode (directory of images) and 2.5D mode (TIFF stack).

    Args:
        config: Training configuration dictionary

    Returns:
        dict: Results dictionary with paths to models, outputs, and metadata
    """
    training_id = config.get('training_id', f'train_{int(time.time())}')
    method = config.get('method', 'n2v')  # 'n2v' or 'autostructn2v'
    mode = config.get('mode', '2d')  # '2d' or '2.5d'

    # Map method to stage flags
    run_stage1 = True
    run_stage2 = method == 'autostructn2v'

    # Update config with stage flags
    config['run_stage1'] = run_stage1
    config['run_stage2'] = run_stage2

    try:
        # Prepare input directory (extract TIFF stacks if needed for 2D, or pass directly for 2.5D)
        # This must be done before validate_config since it may change input_dir
        prepared_input, extracted_images_dir, original_num_slices = prepare_input_directory(config)

        # For 2.5D mode, use input_data instead of input_dir
        if mode == '2.5d':
            config['input_data'] = prepared_input  # Stack file path
            # Remove input_dir to avoid confusion
            if 'input_dir' in config:
                del config['input_dir']
        else:
            config['input_dir'] = prepared_input

        print(f"[DEBUG] mode: {mode}")
        print(f"[DEBUG] prepared_input: {prepared_input}")
        print(f"[DEBUG] extracted_images_dir: {extracted_images_dir}")
        print(f"[DEBUG] original_num_slices: {original_num_slices}")

        # Web-app defaults for the migrated autoStructN2V features. These flip
        # the library's conservative defaults to the publication-recommended
        # values so every web-app training run benefits from the upstream
        # improvements:
        #   - z-score input normalization (CAREamics-style)
        #   - overlap-tile patching (eliminates patch-edge artifact)
        #   - N2V2 architectural fixes (top-skip removal + blurpool) — both
        #     attack the checkerboard pattern that resize-conv alone doesn't
        #     fully suppress.
        # Library defaults are conservative ('unit', 0, False, False, 'elu');
        # we override before validate_config so the saved config.json reflects
        # what was actually used, and the checkpoint's hparams carry these for
        # inference-time reconstruction. `setdefault` means a UI/wrapper that
        # explicitly sets any of these still wins.
        config.setdefault('normalize_method', 'zscore')
        for _stage in ('stage1', 'stage2'):
            config.setdefault(_stage, {})
            config[_stage].setdefault('overlap_tile_pad', 4)
            config[_stage].setdefault('remove_top_skip', True)
            config[_stage].setdefault('use_blurpool', True)

        # Validate configuration
        config = validate_config(config)
        verbose = config.get('verbose', False)

        # Pre-flight: extract_size = patch_size + 2*overlap_tile_pad must be
        # divisible by 2^num_layers so the U-Net skip-concat shapes match.
        # Pre-migration users with patch_size=64, num_layers=4 had 64 % 16 == 0
        # (fine). With overlap_tile_pad=4 the extract size becomes 72, and
        # 72 % 16 == 8 — the failure surfaces deep in the decoder as a cryptic
        # tensor-size mismatch on the first forward pass.
        for _s in ('stage1', 'stage2'):
            _ps = config[_s]['patch_size']
            _pad = config[_s].get('overlap_tile_pad', 0)
            _nl = config[_s]['num_layers']
            _es = _ps + 2 * _pad
            _div = 2 ** _nl
            if _es % _div != 0:
                raise ValueError(
                    f"{_s} extract_size={_es} (patch_size={_ps} + 2*overlap_tile_pad={_pad}) "
                    f"is not divisible by 2^num_layers={_div}. Adjust patch_size, "
                    f"overlap_tile_pad, or num_layers so the U-Net skip connections align."
                )

        # Create output directories
        dirs = create_output_directories(config)

        # Set random seed
        set_seed(config['random_seed'])

        # Set device
        device = torch.device(config['device'] if torch.cuda.is_available() and config['device'] == 'cuda' else 'cpu')
        emit_progress('init', {
            "training_id": training_id,
            "device": str(device),
            "method": method,
            "mode": mode,
            "gpuAvailable": torch.cuda.is_available()
        })

        # Split dataset (different approach for 2D vs 2.5D)
        emit_progress('data', {"training_id": training_id, "status": "splitting", "mode": mode})

        if mode == '2.5d':
            # 2.5D mode: Split by z-indices, load stack
            stack = safe_imread(config['input_data'])
            if stack.ndim == 2:
                stack = stack[np.newaxis, ...]  # Add z dimension

            # CRITICAL: Normalize stack to 0-1 range (same as 2D mode does via load_and_normalize_image)
            # Without this, loss values are huge (e.g., 20000+ for unnormalized 16-bit data)
            original_dtype = stack.dtype
            stack = stack.astype(np.float32)
            if original_dtype == np.uint8:
                stack = stack / 255.0
            elif original_dtype == np.uint16:
                stack = stack / 65535.0
            elif np.issubdtype(original_dtype, np.floating):
                # Float data - use min-max normalization if not already in [0,1]
                if stack.max() > 1.0 or stack.min() < 0.0:
                    stack = (stack - stack.min()) / (stack.max() - stack.min() + 1e-8)
            else:
                # Other integer types - use min-max normalization
                stack = (stack - stack.min()) / (stack.max() - stack.min() + 1e-8)

            print(f"[DEBUG] Stack normalized: dtype={original_dtype} -> float32, range=[{stack.min():.4f}, {stack.max():.4f}]")

            num_slices = stack.shape[0]
            slice_indices = split_stack_indices(
                num_slices,
                config['split_ratio'],
                config['random_seed'],
                verbose=verbose
            )

            # Store stack, indices, original dtype, and original stack path for later use
            loaded_stack = stack
            stack_path = config['input_data']  # Keep path for inference
            image_paths = None  # Not used in 2.5D mode
            original_stack_dtype = original_dtype  # Store for output conversion

            print(f"[DEBUG] 2.5D mode: stack shape={stack.shape}, split indices: train={len(slice_indices['train'])}, val={len(slice_indices['val'])}, test={len(slice_indices['test'])}")
        else:
            # 2D mode: Split by files
            image_paths = split_dataset(
                config['input_dir'],
                dirs,
                config['split_ratio'],
                config['image_extension'],
                config['random_seed'],
                verbose=verbose
            )
            loaded_stack = None
            slice_indices = None
            original_stack_dtype = None  # Will detect from first image if needed

        # Compute train-derived z-score stats when normalize_method == 'zscore'.
        # Matches autoStructN2V/pipeline/runner.py:348-353 for stack mode and
        # extends the same computation to 2D path mode (which the upstream
        # currently raises NotImplementedError for). The stats are stashed in
        # config['_norm_stats'], which is read by create_dataloaders (data.py:279)
        # and threaded into datasets, the trainer, and the predictor below.
        # save_checkpoint persists `hparams=config`, so `_norm_stats` travels
        # with the model and is read back at inference time.
        if config.get('normalize_method') == 'zscore':
            if mode == '2.5d':
                train_slices = loaded_stack[slice_indices['train']]
                if np.isnan(train_slices).any():
                    raise ValueError(
                        "Training stack contains NaN values; cannot compute "
                        "zscore statistics. Clean the input or switch "
                        "normalize_method to 'unit'."
                    )
                mean = float(train_slices.mean())
                std = float(train_slices.std())
            else:
                # Stream the (already dtype-normalized [0,1]) training images
                # via the library's loader so the stats are computed on the
                # same domain the dataset will see.
                train_paths = image_paths[0]
                running_sum = 0.0
                running_sq = 0.0
                running_n = 0
                for p in train_paths:
                    img = load_and_normalize_image(p)
                    # Refuse silently dropping NaN — a poisoned mean/std would
                    # propagate to every output pixel of the trained model.
                    if np.isnan(img).any():
                        raise ValueError(
                            f"Training image contains NaN values: {p}. "
                            "Clean the input or switch normalize_method to 'unit'."
                        )
                    running_sum += float(img.sum())
                    running_sq += float((img.astype(np.float64) ** 2).sum())
                    running_n += int(img.size)
                if running_n == 0:
                    raise ValueError("zscore normalization requested but no training images found")
                mean = running_sum / running_n
                var = max(running_sq / running_n - mean * mean, 0.0)
                std = float(np.sqrt(var))
            # Near-zero std (e.g. constant-intensity stack) makes the
            # (x - mean) / (std + eps) transform blow up by ~1e6 and the
            # model converges to a near-constant output.
            if std < 1e-8:
                raise ValueError(
                    "Training data has near-zero standard deviation; cannot "
                    "zscore normalize. Use normalize_method='unit' or check "
                    "that the input is not a constant-intensity stack."
                )
            config['_norm_stats'] = {'mean': mean, 'std': std, 'eps': 1e-6}
            print(f"[zscore] Train stats computed: mean={mean:.6f}, std={std:.6f} (mode={mode})")

        # Save configuration
        config_path = os.path.join(dirs['experiment'], 'config.json')
        with open(config_path, 'w') as f:
            # Convert non-serializable objects
            config_serializable = {}
            for k, v in config.items():
                if isinstance(v, (dict, list, str, int, float, bool, type(None))):
                    config_serializable[k] = v
                else:
                    config_serializable[k] = str(v)
            json.dump(config_serializable, f, indent=4)

        # Initialize results
        results = {
            'experiment_dir': dirs['experiment'],
            'training_id': training_id,
            'method': method,
            'stages_run': [],
            'extracted_images_dir': extracted_images_dir,
            'original_num_slices': original_num_slices,
            'training_results': {}  # Will hold stage1 and stage2 training metrics
        }

        denoised_patches = None
        stage1_checkpoint_path = None

        # =====================================================================
        # Stage 1: Standard Noise2Void
        # =====================================================================
        if run_stage1:
            emit_progress('stage1', {
                "training_id": training_id,
                "status": "starting",
                "mode": mode,
                "totalEpochs": config['stage1'].get('num_epochs', config.get('num_epochs', 100))
            })

            # Create dataloaders (different for 2D vs 2.5D)
            if mode == '2.5d':
                # 2.5D mode: stack-based dataloaders
                train_loader, val_loader, test_loader = create_dataloaders(
                    config=config,
                    stage="stage1",
                    stack=loaded_stack,
                    slice_indices=slice_indices,
                    verbose=verbose
                )
            else:
                # 2D mode: path-based dataloaders
                train_loader, val_loader, test_loader = create_dataloaders(
                    image_paths, config, "stage1", verbose=verbose
                )

            # Create model (mode-aware: 2.5D uses 3 input channels)
            stage1_model = create_model_from_config(
                config=config,
                stage='stage1'
            )

            # Create optimizer and scheduler
            optimizer = torch.optim.Adam(stage1_model.parameters(), lr=config['stage1']['learning_rate'])
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
                optimizer, mode='min', factor=0.5, patience=5
            )

            # Create trainer with progress callback
            stage1_trainer = WebAutoStructN2VTrainer(
                model=stage1_model,
                optimizer=optimizer,
                scheduler=scheduler,
                device=device,
                hparams=config,
                stage='stage1',
                experiment_name=os.path.join(dirs['stage1']['logs'], datetime.now().strftime("%Y%m%d-%H%M%S")),
                norm_stats=config.get('_norm_stats'),
                progress_callback=create_progress_callback('stage1', training_id)
            )

            # Train
            denoised_patches, stage1_training_results = stage1_trainer.train(train_loader, val_loader, test_loader)

            # Store training metrics
            results['training_results']['stage1'] = stage1_training_results

            # Save model
            stage1_checkpoint_path = os.path.join(dirs['stage1']['model'], 'stage1_model.pth')
            stage1_trainer.save_checkpoint(stage1_checkpoint_path)

            # Emit completion
            emit_result('stage1', {
                "training_id": training_id,
                "modelPath": stage1_checkpoint_path,
                "experimentDir": dirs['experiment']
            })

            results['stage1_model_path'] = stage1_checkpoint_path
            results['stages_run'].append('stage1')

            # Run inference on training data with stage 1 model
            emit_progress('stage1_inference', {"training_id": training_id, "status": "starting", "mode": mode})

            # Load trained model for inference (mode-aware)
            stage1_trained_model = create_model_from_config(
                config=config,
                stage='stage1'
            ).to(device)

            checkpoint = safe_load_checkpoint(stage1_checkpoint_path, device)
            stage1_trained_model.load_state_dict(checkpoint['model_state_dict'])
            stage1_trained_model.eval()

            # For 2.5D autoStructN2V Stage 1, the model outputs 3 channels (for autocorrelation).
            # For inference, we only need the center channel. Wrap the model to extract it.
            inference_model = stage1_trained_model
            if mode == '2.5d' and run_stage2:
                print(f"[DEBUG] Wrapping Stage 1 model with CenterChannelWrapper for 2.5D inference")
                inference_model = CenterChannelWrapper(stage1_trained_model)

            # Create predictor with mode (2.5D uses triplet sliding window).
            # stride=patch_size//4 (instead of the library default //2) so each
            # pixel is covered by ~4 patches rather than 2. The constant-weight
            # overlap-tile mask hard-averages contributing patches, and at every
            # stride boundary the contributing pair rotates — visible as patch
            # edges when the model isn't fully patch-position-invariant
            # (especially with deeper U-Nets / larger patches / undertrained
            # weights). 4-way averaging makes each transition 25% rather than
            # 50% of the blended value, dramatically reducing visible seams.
            # Cost: 4x more patches → ~4x slower inference.
            _stage1_ps = config['stage1']['patch_size']
            predictor = AutoStructN2VPredictor(
                model=inference_model,
                patch_size=_stage1_ps,
                stride=max(1, _stage1_ps // 4),
                mode=mode,
                norm_stats=config.get('_norm_stats'),
                overlap_tile_pad=config['stage1'].get('overlap_tile_pad', 0),
            )

            stage1_denoised_dir = os.path.join(dirs['data'], 'stage1_denoised')
            os.makedirs(stage1_denoised_dir, exist_ok=True)

            if mode == '2.5d':
                # 2.5D mode: Process entire stack
                print(f"[DEBUG] 2.5D mode stage1 inference on stack shape={loaded_stack.shape}")

                # Denoise the stack using internal method (stack is already normalized in memory)
                # Note: predictor.denoise_stack() expects a file path, but we already have the
                # normalized array in memory, so we use _predict_2_5d() directly
                denoised_stack = predictor._predict_2_5d(loaded_stack)

                # Convert back to original dtype before saving
                if original_stack_dtype is not None:
                    denoised_stack_output = convert_to_original_dtype(denoised_stack, original_stack_dtype)
                    output_dtype_str = str(original_stack_dtype)
                else:
                    denoised_stack_output = denoised_stack.astype(np.float32)
                    output_dtype_str = 'float32'

                # Save denoised stack
                stage1_denoised_path = os.path.join(stage1_denoised_dir, 'stage1_denoised_stack.tif')
                tifffile.imwrite(stage1_denoised_path, denoised_stack_output)

                results['stage1_denoised_stack_path'] = stage1_denoised_path
                print(f"[DEBUG] Saved 2.5D denoised stack to {stage1_denoised_path} (dtype: {output_dtype_str})")

                # Store denoised stack for mask extraction
                denoised_stack_for_mask = denoised_stack

            else:
                # 2D mode: Process directory by directory
                print(f"[DEBUG] stage1_denoised_dir: {stage1_denoised_dir}")
                print(f"[DEBUG] image_paths structure: {[(name, len(paths)) for name, paths in zip(['train', 'val', 'test'], image_paths)]}")

                for split_name, split_paths in zip(['train', 'val', 'test'], image_paths):
                    split_output_dir = os.path.join(stage1_denoised_dir, split_name)
                    os.makedirs(split_output_dir, exist_ok=True)
                    input_split_dir = os.path.dirname(split_paths[0]) if split_paths else None
                    print(f"[DEBUG] Processing {split_name}: input_dir={input_split_dir}, output_dir={split_output_dir}, num_files={len(split_paths)}")
                    if input_split_dir and os.path.exists(input_split_dir):
                        input_files = os.listdir(input_split_dir)
                        print(f"[DEBUG] Files in {split_name} input dir: {input_files}")
                        predictor.process_directory(input_split_dir, split_output_dir, show=False)
                        output_files = os.listdir(split_output_dir)
                        print(f"[DEBUG] Files in {split_name} output dir after processing: {output_files}")

                denoised_stack_for_mask = None

            results['stage1_denoised_dir'] = stage1_denoised_dir

            emit_progress('stage1_inference', {"training_id": training_id, "status": "complete", "mode": mode})

            # Cleanup
            del stage1_model, stage1_trainer, optimizer, scheduler
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        # =====================================================================
        # Stage 2: Structured Noise2Void (if autoStructN2V)
        # =====================================================================
        if run_stage2:
            emit_progress('mask', {"training_id": training_id, "status": "extracting", "mode": mode})

            # Extract mask from denoised patches
            extractor_config = config['stage2']['extractor']
            extractor = StructuralNoiseExtractor(
                norm_autocorr=extractor_config.get('norm_autocorr', True),
                log_autocorr=extractor_config.get('log_autocorr', True),
                crop_autocorr=extractor_config.get('crop_autocorr', True),
                adapt_autocorr=extractor_config.get('adapt_autocorr', True),
                adapt_CB=extractor_config.get('adapt_CB', 50.0),
                adapt_DF=extractor_config.get('adapt_DF', 0.95),
                center_size=extractor_config.get('center_size', 10),
                base_percentile=extractor_config.get('base_percentile', 50),
                percentile_decay=extractor_config.get('percentile_decay', 1.15),
                center_ratio_threshold=extractor_config.get('center_ratio_threshold', 0.3),
                use_center_proximity=extractor_config.get('use_center_proximity', True),
                center_proximity_threshold=extractor_config.get('center_proximity_threshold', 0.95),
                keep_center_component_only=extractor_config.get('keep_center_component_only', True),
                max_true_pixels=extractor_config.get('max_true_pixels', 25)
            )

            # Extract mask (different method for 2D vs 2.5D). The small kernel
            # returned by extract_mask / extract_mask_3d is what the migrated
            # library expects downstream — the dataset's _build_mask_pool calls
            # create_full_mask internally per pool entry so that each training
            # patch sees a different random placement. Pre-expanding here would
            # collapse all 32 pool entries to the same mask.
            if mode == '2.5d':
                # 2.5D mode: Use 3D mask extraction from triplet patches
                # Extract triplet patches from the denoised stack for 3D autocorrelation
                triplet_patches = extract_triplet_patches(
                    denoised_stack_for_mask,
                    patch_size=config['stage2']['patch_size'],
                    num_patches=config['stage2'].get('patches_per_image', 100) * 10
                )
                struct_mask, autocorr_data = extractor.extract_mask_3d(triplet_patches, verbose)

                # Save the triplet patches for mask regeneration
                denoised_patches_path = os.path.join(dirs['stage2']['model'], 'denoised_triplet_patches_for_mask.npy')
                os.makedirs(os.path.dirname(denoised_patches_path), exist_ok=True)
                np.save(denoised_patches_path, triplet_patches)
                print(f"Saved {len(triplet_patches)} triplet patches for 2.5D mask regeneration to {denoised_patches_path}")
            else:
                # 2D mode: Standard 2D mask extraction
                struct_mask, autocorr_data = extractor.extract_mask(denoised_patches, verbose)

                # Save the denoised patches used for mask extraction
                denoised_patches_path = os.path.join(dirs['stage2']['model'], 'denoised_patches_for_mask.npy')
                os.makedirs(os.path.dirname(denoised_patches_path), exist_ok=True)
                np.save(denoised_patches_path, denoised_patches)
                print(f"Saved {len(denoised_patches)} denoised patches for mask regeneration to {denoised_patches_path}")

            # Save mask (structure depends on mode)
            mask_save_path = os.path.join(dirs['stage2']['model'], 'stage2_mask.npy')
            os.makedirs(os.path.dirname(mask_save_path), exist_ok=True)
            np.save(mask_save_path, struct_mask)

            # Check for empty mask (only center pixel or < 2 active pixels).
            # Non-square kernels (e.g. (7, 9) for anisotropic noise) need
            # per-axis center indexing — using shape[0]//2 for both axes
            # would address the wrong pixel when ph_h != ph_w.
            if mode == '2.5d':
                # For 3D mask, check center slice
                active_pixels = int(np.sum(struct_mask[1]))  # Center slice
                kh, kw = struct_mask.shape[1], struct_mask.shape[2]
                center_only = bool(active_pixels == 1 and struct_mask[1, kh // 2, kw // 2])
                is_empty = bool(active_pixels < 2 or center_only)
                # For 2.5D, maskArray is a list of 3 2D arrays
                mask_array_for_viz = [s.astype(int).tolist() for s in struct_mask]
            else:
                active_pixels = int(np.sum(struct_mask))
                kh, kw = struct_mask.shape
                center_only = bool(active_pixels == 1 and struct_mask[kh // 2, kw // 2])
                is_empty = bool(active_pixels < 2 or center_only)
                mask_array_for_viz = struct_mask.astype(int).tolist()
            # kernelSize kept for back-compat; new kernelHeight/kernelWidth
            # carry the true rectangular dimensions for the frontend grid.
            kernel_size = int(max(kh, kw))

            emit_result('mask', {
                "training_id": training_id,
                "mode": mode,
                "kernelSize": kernel_size,
                "kernelHeight": int(kh),
                "kernelWidth": int(kw),
                "activePixels": active_pixels,
                "centerOnly": center_only,
                "isEmpty": is_empty,
                "maskPath": mask_save_path,
                "pattern": detect_pattern(struct_mask[1] if mode == '2.5d' else struct_mask),
                "maskArray": mask_array_for_viz  # 2D or 3D array for visualization
            })

            results['mask_path'] = mask_save_path
            results['mask_info'] = {
                'active_pixels': active_pixels,
                'kernel_size': kernel_size,
                'kernel_height': int(kh),
                'kernel_width': int(kw),
                'is_empty': is_empty
            }

            # Check if we should pause for user approval of mask before Stage 2
            # If pauseAfterMask is True and mask is not empty, pause here
            if config.get('pauseAfterMask', False) and not is_empty:
                emit_result('paused', {
                    "training_id": training_id,
                    "mode": mode,
                    "reason": "awaiting_mask_approval",
                    "stage1ModelPath": results.get('stage1_model_path'),
                    "stage1DenoisedDir": results.get('stage1_denoised_dir'),
                    "maskPath": mask_save_path,
                    "kernelSize": kernel_size,
                    "kernelHeight": int(kh),
                    "kernelWidth": int(kw),
                    "activePixels": active_pixels,
                    "pattern": detect_pattern(struct_mask[1] if mode == '2.5d' else struct_mask),
                    "maskArray": mask_array_for_viz
                })
                # Return here - Stage 2 will be triggered separately via continue-training
                results['paused_at_mask'] = True
                return results

            # If mask is effectively empty, we can skip stage 2
            if active_pixels < 2 or center_only:
                emit_progress('stage2', {
                    "training_id": training_id,
                    "status": "skipped",
                    "reason": "empty_mask"
                })
            else:
                # Proceed with stage 2 training
                emit_progress('stage2', {
                    "training_id": training_id,
                    "status": "starting",
                    "mode": mode,
                    "totalEpochs": config['stage2'].get('num_epochs', config.get('num_epochs', 100))
                })

                # Create dataloaders with the small structural kernel returned by
                # extract_mask. The dataset's _build_mask_pool calls
                # create_full_mask internally per pool entry, producing 32
                # distinct full masks at init that are randomly sampled per
                # __getitem__ (A1 mask-diversity fix from the migration).
                if mode == '2.5d':
                    # 2.5D mode: stack-based dataloaders
                    stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                        config=config,
                        stage="stage2",
                        stack=loaded_stack,
                        slice_indices=slice_indices,
                        structured_mask=struct_mask,
                        verbose=verbose
                    )
                else:
                    # 2D mode: path-based dataloaders
                    stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                        image_paths,
                        config,
                        "stage2",
                        structured_mask=struct_mask,
                        verbose=verbose
                    )

                # Create model (mode-aware: 2.5D uses 3 input channels, 1 output for Stage 2)
                stage2_model = create_model_from_config(
                    config=config,
                    stage='stage2'
                )

                # Create optimizer and scheduler
                stage2_optimizer = torch.optim.Adam(
                    stage2_model.parameters(),
                    lr=config['stage2']['learning_rate']
                )
                stage2_scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
                    stage2_optimizer, mode='min', factor=0.5, patience=5
                )

                # Create trainer with progress callback
                stage2_trainer = WebAutoStructN2VTrainer(
                    model=stage2_model,
                    optimizer=stage2_optimizer,
                    scheduler=stage2_scheduler,
                    device=device,
                    hparams=config,
                    stage='stage2',
                    experiment_name=os.path.join(dirs['stage2']['logs'], datetime.now().strftime("%Y%m%d-%H%M%S")),
                    norm_stats=config.get('_norm_stats'),
                    progress_callback=create_progress_callback('stage2', training_id)
                )

                # Train
                _, stage2_training_results = stage2_trainer.train(stage2_train_loader, stage2_val_loader, stage2_test_loader)

                # Store training metrics
                results['training_results']['stage2'] = stage2_training_results

                # Save model
                stage2_checkpoint_path = os.path.join(dirs['stage2']['model'], 'stage2_model.pth')
                stage2_trainer.save_checkpoint(stage2_checkpoint_path)

                # Emit completion
                emit_result('stage2', {
                    "training_id": training_id,
                    "modelPath": stage2_checkpoint_path
                })

                results['stage2_model_path'] = stage2_checkpoint_path
                results['stages_run'].append('stage2')

                # Cleanup
                del stage2_model, stage2_trainer, stage2_optimizer, stage2_scheduler
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        # =====================================================================
        # Stage 2 Denoising (if autoStructN2V)
        # =====================================================================
        # After Stage 2 training, run inference on training data to get stage2 denoised output
        if run_stage2 and 'stage2' in results['stages_run']:
            emit_progress('stage2_inference', {"training_id": training_id, "status": "starting", "mode": mode})

            # Load stage 2 trained model for inference (mode-aware)
            stage2_trained_model = create_model_from_config(
                config=config,
                stage='stage2'
            ).to(device)

            checkpoint = safe_load_checkpoint(results['stage2_model_path'], device)
            stage2_trained_model.load_state_dict(checkpoint['model_state_dict'])
            stage2_trained_model.eval()

            # Create predictor with mode (2.5D uses triplet sliding window).
            # stride=patch_size//4 — see Stage 1 above for rationale.
            _stage2_ps = config['stage2']['patch_size']
            predictor = AutoStructN2VPredictor(
                model=stage2_trained_model,
                patch_size=_stage2_ps,
                stride=max(1, _stage2_ps // 4),
                mode=mode,
                norm_stats=config.get('_norm_stats'),
                overlap_tile_pad=config['stage2'].get('overlap_tile_pad', 0),
            )

            stage2_denoised_dir = os.path.join(dirs['data'], 'stage2_denoised')
            os.makedirs(stage2_denoised_dir, exist_ok=True)

            if mode == '2.5d':
                # 2.5D mode: Process entire stack
                print(f"[DEBUG] 2.5D mode stage2 inference on stack shape={loaded_stack.shape}")

                # Denoise the original stack with stage 2 model using internal method
                # Note: predictor.denoise_stack() expects a file path, but we already have the
                # normalized array in memory, so we use _predict_2_5d() directly
                denoised_stack = predictor._predict_2_5d(loaded_stack)

                # Save denoised stack
                stage2_denoised_path = os.path.join(stage2_denoised_dir, 'stage2_denoised_stack.tif')
                from autoStructN2V.utils.image import save_tiff_stack
                save_tiff_stack(stage2_denoised_path, denoised_stack, dtype='float32')

                results['stage2_denoised_stack_path'] = stage2_denoised_path
                print(f"[DEBUG] Saved 2.5D stage2 denoised stack to {stage2_denoised_path}")
            else:
                # 2D mode: Process directory by directory
                for split_name, split_paths in zip(['train', 'val', 'test'], image_paths):
                    split_output_dir = os.path.join(stage2_denoised_dir, split_name)
                    os.makedirs(split_output_dir, exist_ok=True)
                    input_split_dir = os.path.dirname(split_paths[0]) if split_paths else None
                    if input_split_dir and os.path.exists(input_split_dir):
                        predictor.process_directory(input_split_dir, split_output_dir, show=False)

            results['stage2_denoised_dir'] = stage2_denoised_dir

            emit_progress('stage2_inference', {"training_id": training_id, "status": "complete", "mode": mode})

            # Cleanup
            del stage2_trained_model
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        # =====================================================================
        # Finalize Output: Create TIFF stacks and cleanup
        # =====================================================================
        output_files = finalize_training_output(config, dirs, results, method, training_id)
        results['output_files'] = output_files

        # Emit final completion
        emit_result('complete', {
            "training_id": training_id,
            "method": method,
            "stagesRun": results['stages_run'],
            "outputFiles": output_files
        })

        return results

    except Exception as e:
        emit_error('training', str(e), traceback.format_exc())
        raise
