"""
Special operations for the denoising package.

Handles:
- extract_mask: Standalone mask extraction
- run_stage2_only: Resume Stage 2 after mask approval
- finalize_stage1_only: Skip Stage 2 and finalize with Stage 1 only
"""

import os
import json
import ast
import glob
import traceback
from datetime import datetime

import torch
import numpy as np
import tifffile
from tiff_validation_utils import safe_imread

from autoStructN2V.pipeline.config import validate_config
from autoStructN2V.pipeline.data import create_dataloaders, split_stack_indices
from autoStructN2V.models import create_model_from_config
from autoStructN2V.masking import (
    StructuralNoiseExtractor,
)
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.utils.image import load_and_normalize_image

from .utils import (
    emit_progress,
    emit_result,
    emit_error,
    safe_load_checkpoint,
    sanitize_config,
    convert_to_original_dtype,
    detect_pattern
)
from .models import extract_triplet_patches
from .trainer import WebAutoStructN2VTrainer
from .training import create_progress_callback
from .output import finalize_training_output


def extract_mask(config: dict):
    """
    Extract structural noise mask from images.

    If denoised_patches_path is provided and exists, uses those exact patches
    (same as initial training). Otherwise falls back to sampling from images.

    Supports both 2D mode (2D patches) and 2.5D mode (triplet patches).

    Args:
        config: Configuration dictionary with:
            - input_path: Path to input images
            - output_dir: Output directory for mask
            - extractor: Extractor parameters
            - denoised_patches_path: Optional path to saved patches
            - mode: '2d' or '2.5d'
            - patch_size: Patch size for sampling
    """
    try:
        input_path = config['input_path']
        output_dir = config['output_dir']
        extractor_params = config.get('extractor', {})
        denoised_patches_path = config.get('denoised_patches_path')
        mode = config.get('mode', '2d')  # '2d' or '2.5d'

        emit_progress('mask', {"status": "loading", "mode": mode})

        patches = None

        # First try to load saved denoised patches (for exact match with training)
        if denoised_patches_path and os.path.exists(denoised_patches_path):
            print(f"Loading saved denoised patches from {denoised_patches_path}")
            patches = np.load(denoised_patches_path)
            print(f"Loaded {len(patches)} patches (same as initial training)")

            # Detect if these are triplet patches (3D) based on shape
            if patches.ndim == 4 and patches.shape[1] == 3:
                print("Detected triplet patches (2.5D mode)")
                mode = '2.5d'
        else:
            # Fallback: sample patches from Stage 1 denoised output
            print(f"No saved patches found, sampling from {input_path}")
            images = safe_imread(input_path)
            if images.ndim == 2:
                images = images[np.newaxis, ...]

            # Use a fixed random seed for deterministic patch sampling
            np.random.seed(42)

            patch_size = config.get('patch_size', 64)

            if mode == '2.5d':
                # 2.5D mode: Sample triplet patches (uses local extract_triplet_patches function)
                patches = extract_triplet_patches(
                    images,
                    patch_size=patch_size,
                    num_patches=500
                )
                print(f"Sampled {len(patches)} triplet patches for 2.5D mask extraction")
            else:
                # 2D mode: Sample 2D patches
                patches_list = []
                patches_per_slice = 50

                for img in images[:min(len(images), 10)]:
                    img_norm = (img - img.min()) / (img.max() - img.min() + 1e-8)
                    h, w = img_norm.shape

                    for _ in range(patches_per_slice):
                        if h >= patch_size and w >= patch_size:
                            top = np.random.randint(0, h - patch_size + 1)
                            left = np.random.randint(0, w - patch_size + 1)
                            patch = img_norm[top:top+patch_size, left:left+patch_size]
                            patches_list.append(patch)

                patches = np.array(patches_list)
                print(f"Sampled {len(patches)} patches from denoised output")

            # Reset random state
            np.random.seed(None)

        emit_progress('mask', {"status": "extracting", "mode": mode, "numPatches": len(patches)})

        # Create extractor with all parameters matching training mode
        extractor = StructuralNoiseExtractor(
            norm_autocorr=extractor_params.get('norm_autocorr', True),
            log_autocorr=extractor_params.get('log_autocorr', True),
            crop_autocorr=extractor_params.get('crop_autocorr', True),
            adapt_autocorr=extractor_params.get('adapt_autocorr', True),
            adapt_CB=extractor_params.get('adapt_CB', 50.0),
            adapt_DF=extractor_params.get('adapt_DF', 0.95),
            center_size=extractor_params.get('center_size', 10),
            base_percentile=extractor_params.get('base_percentile', 50),
            percentile_decay=extractor_params.get('percentile_decay', 1.15),
            center_ratio_threshold=extractor_params.get('center_ratio_threshold', 0.3),
            use_center_proximity=extractor_params.get('use_center_proximity', True),
            center_proximity_threshold=extractor_params.get('center_proximity_threshold', 0.95),
            keep_center_component_only=extractor_params.get('keep_center_component_only', True),
            max_true_pixels=extractor_params.get('max_true_pixels', 25)
        )

        # Extract mask (different method for 2D vs 2.5D). _tighten_to_bounding_rect
        # can yield rectangular kernels (e.g. (7, 3) for vertical noise) — track
        # height and width independently and let the frontend lay out the grid
        # with the true rectangle, not a square.
        if mode == '2.5d':
            struct_mask, _ = extractor.extract_mask_3d(patches, verbose=False)
            # For 3D mask, center slice contains the main pattern
            active_pixels = int(np.sum(struct_mask[1]))  # Center slice
            kh, kw = int(struct_mask.shape[1]), int(struct_mask.shape[2])
            mask_array_for_viz = [s.astype(int).tolist() for s in struct_mask]
            pattern = detect_pattern(struct_mask[1])
        else:
            struct_mask, _ = extractor.extract_mask(patches, verbose=False)
            active_pixels = int(np.sum(struct_mask))
            kh, kw = int(struct_mask.shape[0]), int(struct_mask.shape[1])
            mask_array_for_viz = struct_mask.astype(int).tolist()
            pattern = detect_pattern(struct_mask)
        kernel_size = max(kh, kw)  # back-compat scalar; truth is kh × kw

        # Save mask
        os.makedirs(output_dir, exist_ok=True)
        mask_path = os.path.join(output_dir, 'extracted_mask.npy')
        np.save(mask_path, struct_mask)

        # Generate preview image
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        preview_path = os.path.join(output_dir, 'mask_preview.png')

        if mode == '2.5d':
            # For 2.5D, show all 3 slices
            fig, axes = plt.subplots(1, 3, figsize=(12, 4))
            for i, (ax, label) in enumerate(zip(axes, ['Z-1', 'Z (center)', 'Z+1'])):
                ax.imshow(struct_mask[i], cmap='gray')
                ax.set_title(f'{label}\nActive: {int(np.sum(struct_mask[i]))}')
                ax.axis('off')
            plt.suptitle(f'Extracted 3D Mask ({kh}x{kw})\nTotal active (center): {active_pixels}')
        else:
            plt.figure(figsize=(6, 6))
            plt.imshow(struct_mask, cmap='gray')
            plt.title(f'Extracted Mask ({kh}x{kw})\nActive pixels: {active_pixels}')
            plt.axis('off')

        plt.savefig(preview_path, bbox_inches='tight', dpi=100)
        plt.close()

        emit_result('mask', {
            "maskPath": mask_path,
            "previewPath": preview_path,
            "mode": mode,
            "kernelSize": kernel_size,
            "kernelHeight": kh,
            "kernelWidth": kw,
            "activePixels": active_pixels,
            "pattern": pattern,
            "maskArray": mask_array_for_viz  # 2D or 3D array for visualization
        })

    except Exception as e:
        emit_error('mask', str(e), traceback.format_exc())
        raise


def run_stage2_only(config: dict):
    """
    Run Stage 2 training only, using existing Stage 1 output and approved mask.

    This mode is used to resume training after the user has approved the mask
    during the pauseAfterMask workflow.

    Args:
        config: Configuration dictionary with:
            - training_id: The original training ID
            - experiment_dir: Path to the experiment directory from Stage 1
            - stage1_model_path: Path to Stage 1 model checkpoint
            - stage1_denoised_dir: Path to Stage 1 denoised images
            - mask_path: Path to the approved mask .npy file

    Returns:
        dict: Results dictionary with output file paths
    """
    training_id = config.get('training_id')
    experiment_dir = config.get('experiment_dir')
    stage1_model_path = config.get('stage1_model_path')
    stage1_denoised_dir = config.get('stage1_denoised_dir')
    mask_path = config.get('mask_path')

    if not all([training_id, experiment_dir, mask_path]):
        emit_error('stage2', 'Missing required config: training_id, experiment_dir, and mask_path are required')
        raise ValueError('Missing required config for Stage 2 only mode')

    try:
        # Load original config from experiment directory
        original_config_path = os.path.join(experiment_dir, 'config.json')
        if os.path.exists(original_config_path):
            with open(original_config_path) as f:
                original_config = json.load(f)
            # Merge with provided config (provided config takes precedence)
            for key, value in original_config.items():
                if key not in config:
                    config[key] = value

        config = sanitize_config(config)

        # For Stage 2 only mode, we need to set the input correctly for validate_config
        # The data was already prepared during Stage 1 in experiment_dir/data/
        mode = config.get('mode', '2d')
        data_dir = os.path.join(experiment_dir, 'data')

        if mode == '2.5d':
            # For 2.5D, keep input_data (original stack path) and remove input_dir
            if 'input_dir' in config:
                del config['input_dir']
        else:
            # For 2D mode, point input_dir to the data directory (which is a valid directory)
            # This satisfies validate_config's directory check
            config['input_dir'] = data_dir
            if 'input_data' in config:
                del config['input_data']

        # Apply the same web-app-flavored defaults as run_training() (zscore,
        # overlap-tile padding, N2V2 architectural fixes). Stage-2-only mode
        # inherits most of its config from the saved Stage-1 config.json, but
        # the shallow merge in this function only fills missing top-level keys,
        # so we re-apply here to backfill anything the user-provided continue
        # payload supplied a partial stage dict for. Matches training.py.
        config.setdefault('normalize_method', 'zscore')
        for _stage in ('stage1', 'stage2'):
            config.setdefault(_stage, {})
            config[_stage].setdefault('overlap_tile_pad', 4)
            config[_stage].setdefault('remove_top_skip', True)
            config[_stage].setdefault('use_blurpool', True)

        # Validate config to ensure all defaults are set (including masking_strategy)
        config = validate_config(config)
        verbose = config.get('verbose', False)

        # Set device
        device = torch.device(config.get('device', 'cuda') if torch.cuda.is_available() and config.get('device') == 'cuda' else 'cpu')
        emit_progress('init', {
            "training_id": training_id,
            "device": str(device),
            "method": "autostructn2v",
            "mode": "stage2_only",
            "gpuAvailable": torch.cuda.is_available()
        })

        # Load mask
        if not os.path.exists(mask_path):
            emit_error('stage2', f'Mask file not found: {mask_path}')
            raise FileNotFoundError(f'Mask file not found: {mask_path}')

        struct_mask = np.load(mask_path)
        mode = config.get('mode', '2d')

        # The small structural kernel is what the migrated library expects —
        # the dataset's _build_mask_pool calls create_full_mask internally per
        # pool entry. See companion change in training.py.

        # Reconstruct directory structure
        dirs = {
            'experiment': experiment_dir,
            'data': os.path.join(experiment_dir, 'data'),
            'stage1': {
                'model': os.path.join(experiment_dir, 'models', 'stage1'),
                'logs': os.path.join(experiment_dir, 'logs', 'stage1')
            },
            'stage2': {
                'model': os.path.join(experiment_dir, 'models', 'stage2'),
                'logs': os.path.join(experiment_dir, 'logs', 'stage2')
            }
        }

        # Ensure stage2 directories exist
        os.makedirs(dirs['stage2']['model'], exist_ok=True)
        os.makedirs(dirs['stage2']['logs'], exist_ok=True)

        # For 2.5D mode, load the stack and create slice indices
        # For 2D mode, reconstruct image_paths from data directories
        data_dir = dirs['data']
        image_extension = config.get('image_extension', '.tif')

        if mode == '2.5d':
            # 2.5D mode: Load stack and split indices
            stack_path = config.get('input_data')
            if not stack_path or not os.path.exists(stack_path):
                emit_error('stage2', f'Stack file not found for 2.5D mode: {stack_path}')
                raise FileNotFoundError(f'Stack file not found: {stack_path}')

            stack = safe_imread(stack_path)
            if stack.ndim == 2:
                stack = stack[np.newaxis, ...]

            # Normalize stack (same as during Stage 1 training)
            original_dtype = stack.dtype
            stack = stack.astype(np.float32)
            if original_dtype == np.uint8:
                stack = stack / 255.0
            elif original_dtype == np.uint16:
                stack = stack / 65535.0
            elif np.issubdtype(original_dtype, np.floating):
                if stack.max() > 1.0 or stack.min() < 0.0:
                    stack = (stack - stack.min()) / (stack.max() - stack.min() + 1e-8)
            else:
                stack = (stack - stack.min()) / (stack.max() - stack.min() + 1e-8)

            print(f"[DEBUG] Stage 2 only: Loaded stack shape={stack.shape}, normalized range=[{stack.min():.4f}, {stack.max():.4f}]")
            original_stack_dtype = original_dtype  # Store for output conversion

            # Split into indices
            num_slices = stack.shape[0]

            # Parse split_ratio if it's a string (from JSON serialization)
            split_ratio = config.get('split_ratio', (0.7, 0.15, 0.15))
            if isinstance(split_ratio, str):
                # Parse string like "(0.7, 0.15, 0.15)" back to tuple
                try:
                    split_ratio = ast.literal_eval(split_ratio)
                except (ValueError, SyntaxError):
                    print(f"[WARNING] Could not parse split_ratio '{split_ratio}', using default (0.7, 0.15, 0.15)")
                    split_ratio = (0.7, 0.15, 0.15)

            slice_indices = split_stack_indices(
                num_slices,
                split_ratio,
                config['random_seed'],
                verbose=verbose
            )

            loaded_stack = stack
            image_paths = None
        else:
            # 2D mode: Reconstruct image_paths from data directories
            image_paths = []
            for split_name in ['train', 'val', 'test']:
                split_dir = os.path.join(data_dir, split_name)
                if os.path.exists(split_dir):
                    paths = sorted(glob.glob(os.path.join(split_dir, f'*{image_extension}')))
                    image_paths.append(paths)
                else:
                    image_paths.append([])

            loaded_stack = None
            slice_indices = None
            original_stack_dtype = None  # Not tracked for 2D mode

        # Initialize results
        results = {
            'experiment_dir': experiment_dir,
            'training_id': training_id,
            'method': 'autostructn2v',
            'stages_run': ['stage1'],  # Stage 1 already completed
            'stage1_model_path': stage1_model_path,
            'stage1_denoised_dir': stage1_denoised_dir,
            'mask_path': mask_path,
            'training_results': {}  # Will hold stage2 training metrics
        }

        # For 2.5D mode, check if Stage 1 denoised stack exists
        if mode == '2.5d':
            stage1_denoised_stack_path = os.path.join(stage1_denoised_dir, 'stage1_denoised_stack.tif')
            if os.path.exists(stage1_denoised_stack_path):
                results['stage1_denoised_stack_path'] = stage1_denoised_stack_path
                print(f"[DEBUG] Found Stage 1 denoised stack: {stage1_denoised_stack_path}")

        # Backfill `_norm_stats` when zscore was declared (either by the merge
        # from Stage 1's config or by our setdefault for pre-migration runs)
        # but the original training never persisted train stats. Without this,
        # the predictor reads `_extract_training_hparams → (None, 4)` and
        # silently skips zscore even though hparams claims it's on — making
        # the declaration a lie.
        if config.get('normalize_method') == 'zscore' and not config.get('_norm_stats'):
            print("[zscore] Stage 2 only: original config missing _norm_stats; recomputing from data")
            if mode == '2.5d':
                train_slices = loaded_stack[slice_indices['train']]
                if np.isnan(train_slices).any():
                    raise ValueError(
                        "Stage 2 stack contains NaN values; cannot compute "
                        "zscore statistics. Clean the input or switch "
                        "normalize_method to 'unit'."
                    )
                mean = float(train_slices.mean())
                std = float(train_slices.std())
            else:
                train_paths = image_paths[0]
                running_sum = 0.0
                running_sq = 0.0
                running_n = 0
                for p in train_paths:
                    img = load_and_normalize_image(p)
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
            if std < 1e-8:
                raise ValueError(
                    "Stage 2 training data has near-zero standard deviation; "
                    "cannot zscore normalize. Use normalize_method='unit' or "
                    "check the input data."
                )
            config['_norm_stats'] = {'mean': mean, 'std': std, 'eps': 1e-6}
            print(f"[zscore] Stage 2 only: stats computed mean={mean:.6f}, std={std:.6f}")

        # =====================================================================
        # Stage 2: Structured Noise2Void
        # =====================================================================
        emit_progress('stage2', {
            "training_id": training_id,
            "status": "starting",
            "totalEpochs": config['stage2'].get('num_epochs', config.get('num_epochs', 100))
        })

        # Create dataloaders with the small structural kernel. The dataset's
        # _build_mask_pool calls create_full_mask internally per pool entry.
        if mode == '2.5d':
            # 2.5D mode: Use stack and slice_indices
            stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                config=config,
                stage="stage2",
                structured_mask=struct_mask,
                verbose=verbose,
                stack=loaded_stack,
                slice_indices=slice_indices
            )
        else:
            # 2D mode: Use image_paths
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

        # Create trainer with progress callback. norm_stats was computed during
        # Stage 1 and persisted via the experiment's config.json; we read it
        # back so the aux-PSNR path uses identical (mean, std) to training.
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
        # Stage 2 Denoising
        # =====================================================================
        emit_progress('stage2_inference', {"training_id": training_id, "status": "starting"})

        # Load stage 2 trained model for inference (mode-aware for correct channels)
        stage2_trained_model = create_model_from_config(
            config=config,
            stage='stage2'
        ).to(device)

        checkpoint = safe_load_checkpoint(results['stage2_model_path'], device)
        stage2_trained_model.load_state_dict(checkpoint['model_state_dict'])
        stage2_trained_model.eval()

        # Create predictor and denoise. stride=patch_size//4 to soften
        # stride-boundary seams from constant-weight overlap-tile blending
        # (see training.py for the full rationale).
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
            # 2.5D mode: Use stack-based inference
            # The stack is already loaded in loaded_stack
            print(f"[DEBUG] Stage 2 inference: 2.5D mode with stack shape {loaded_stack.shape}")

            # Use the _predict_2_5d method for triplet-based inference
            stage2_denoised_stack = predictor._predict_2_5d(loaded_stack)

            # Convert back to original dtype before saving
            if original_stack_dtype is not None:
                stage2_denoised_output = convert_to_original_dtype(stage2_denoised_stack, original_stack_dtype)
                output_dtype_str = str(original_stack_dtype)
            else:
                stage2_denoised_output = stage2_denoised_stack.astype(np.float32)
                output_dtype_str = 'float32'

            # Save the denoised stack
            stage2_output_path = os.path.join(stage2_denoised_dir, 'stage2_denoised.tif')
            tifffile.imwrite(stage2_output_path, stage2_denoised_output)
            print(f"[DEBUG] Stage 2 denoised stack saved to {stage2_output_path} (dtype: {output_dtype_str})")

            results['stage2_denoised_stack_path'] = stage2_output_path
        else:
            # 2D mode: Process directories
            for split_name, split_paths in zip(['train', 'val', 'test'], image_paths):
                split_output_dir = os.path.join(stage2_denoised_dir, split_name)
                os.makedirs(split_output_dir, exist_ok=True)
                input_split_dir = os.path.dirname(split_paths[0]) if split_paths else None
                if input_split_dir and os.path.exists(input_split_dir):
                    predictor.process_directory(input_split_dir, split_output_dir, show=False)

        results['stage2_denoised_dir'] = stage2_denoised_dir

        emit_progress('stage2_inference', {"training_id": training_id, "status": "complete"})

        # Cleanup
        del stage2_trained_model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # =====================================================================
        # Finalize Output: Create TIFF stacks and cleanup
        # =====================================================================
        output_files = finalize_training_output(config, dirs, results, 'autostructn2v', training_id)
        results['output_files'] = output_files

        # Emit final completion
        emit_result('complete', {
            "training_id": training_id,
            "method": 'autostructn2v',
            "stagesRun": results['stages_run'],
            "outputFiles": output_files
        })

        return results

    except Exception as e:
        emit_error('stage2', str(e), traceback.format_exc())
        raise


def finalize_stage1_only(config: dict):
    """
    Finalize training with Stage 1 results only.

    Called when user chooses to skip Stage 2 after mask extraction.
    This function:
    1. Collects Stage 1 denoised output
    2. Copies model to final location
    3. Saves config
    4. Cleans up all intermediate files

    Args:
        config: Configuration dictionary with:
            - training_id: The training session ID
            - experiment_dir: Path to experiment directory
            - stage1_model_path: Path to Stage 1 model
            - stage1_denoised_dir: Path to Stage 1 denoised images (2D mode)
            - stage1_denoised_stack_path: Path to Stage 1 denoised stack (2.5D mode)
            - workspace_dir: Workspace directory for final output
            - mode: '2d' or '2.5d'
            - method: Should be 'autostructn2v' (N2V doesn't have skip option)

    Returns:
        dict: Output files dictionary with paths to final outputs
    """
    import time
    training_id = config.get('training_id', f'train_{int(time.time())}')

    emit_progress('finalize', {
        "training_id": training_id,
        "status": "starting",
        "message": "Finalizing Stage 1 results (Stage 2 skipped)"
    })

    try:
        # Build dirs dictionary (normally created by create_output_directories)
        experiment_dir = config.get('experiment_dir')
        if not experiment_dir or not os.path.exists(experiment_dir):
            raise ValueError(f"Experiment directory not found: {experiment_dir}")

        dirs = {
            'experiment': experiment_dir,
            'data': os.path.join(experiment_dir, 'data'),
            'stage1': os.path.join(experiment_dir, 'stage1'),
            'stage1_model': os.path.join(experiment_dir, 'stage1', 'model'),
        }

        # Build results dictionary from config paths
        results = {
            'stages_run': ['stage1'],  # Only Stage 1 was run
            'stage1_model_path': config.get('stage1_model_path'),
        }

        mode = config.get('mode', '2d')

        # Handle denoised output paths based on mode
        if mode == '2.5d':
            # 2.5D mode: Look for complete stack file
            stage1_stack_path = config.get('stage1_denoised_stack_path')
            if not stage1_stack_path:
                # Try to find it in the experiment directory
                stage1_stack_path = os.path.join(experiment_dir, 'data', 'stage1_denoised', 'stage1_denoised_stack.tif')
            if os.path.exists(stage1_stack_path):
                results['stage1_denoised_stack_path'] = stage1_stack_path
            else:
                emit_progress('finalize', {
                    "training_id": training_id,
                    "status": "warning",
                    "message": f"Stage 1 denoised stack not found at {stage1_stack_path}"
                })
        else:
            # 2D mode: Look for directory with individual slices
            stage1_denoised_dir = config.get('stage1_denoised_dir')
            if not stage1_denoised_dir:
                stage1_denoised_dir = os.path.join(experiment_dir, 'data', 'stage1_denoised')
            if os.path.exists(stage1_denoised_dir):
                results['stage1_denoised_dir'] = stage1_denoised_dir
            else:
                emit_progress('finalize', {
                    "training_id": training_id,
                    "status": "warning",
                    "message": f"Stage 1 denoised directory not found at {stage1_denoised_dir}"
                })

        # Check for extracted_images directory (2D mode creates this)
        extracted_images_dir = config.get('extracted_images_dir')
        if not extracted_images_dir:
            # Try common locations
            workspace_dir = config.get('workspace_dir', os.path.dirname(experiment_dir))
            possible_paths = [
                os.path.join(workspace_dir, 'uploads', 'raw', 'extracted_images'),
                os.path.join(workspace_dir, 'extracted_images'),
                os.path.join(os.path.dirname(experiment_dir), 'extracted_images')
            ]
            for p in possible_paths:
                if os.path.exists(p):
                    extracted_images_dir = p
                    break
        if extracted_images_dir:
            results['extracted_images_dir'] = extracted_images_dir

        # Call the finalization function (same as used after full training)
        output_files = finalize_training_output(
            config,
            dirs,
            results,
            'autostructn2v',  # Method is autoStructN2V since N2V doesn't have skip
            training_id
        )

        # Emit final completion
        emit_result('complete', {
            "training_id": training_id,
            "method": 'autostructn2v',
            "stagesRun": ['stage1'],
            "stage2Skipped": True,
            "outputFiles": output_files
        })

        return output_files

    except Exception as e:
        emit_error('finalize', str(e), traceback.format_exc())
        raise
