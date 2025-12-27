#!/usr/bin/env python3
"""
Web integration wrapper for autoStructN2V.

This wrapper provides a web-friendly interface to the autoStructN2V library,
with progress emission and error handling for real-time updates via Socket.IO.

Usage:
    python autostructn2v_wrapper.py --config config.json --mode train
    python autostructn2v_wrapper.py --config config.json --mode inference
    python autostructn2v_wrapper.py --config config.json --mode extract_mask
"""

import sys
import os
import json
import argparse
import traceback
import time
from pathlib import Path
from datetime import datetime

import torch
import numpy as np

# Add the autoStructN2V library to path
AUTOSTRUCTN2V_PATH = Path(__file__).parent.parent / 'docs' / 'autoStructN2V' / 'codebase'
sys.path.insert(0, str(AUTOSTRUCTN2V_PATH))

try:
    from autoStructN2V.pipeline import run_pipeline
    from autoStructN2V.pipeline.config import validate_config, create_output_directories
    from autoStructN2V.pipeline.data import split_dataset, create_dataloaders
    from autoStructN2V.models import create_model
    from autoStructN2V.trainers import AutoStructN2VTrainer
    from autoStructN2V.trainers.callbacks import EarlyStopping
    from autoStructN2V.masking import StructuralNoiseExtractor, create_full_mask
    from autoStructN2V.inference import AutoStructN2VPredictor
    from autoStructN2V.utils.training import set_seed
    from autoStructN2V.utils.image import load_and_normalize_image
except ImportError as e:
    print(f"DENOISING_ERROR:{json.dumps({'stage': 'init', 'message': f'Failed to import autoStructN2V: {str(e)}', 'details': traceback.format_exc()})}", flush=True)
    sys.exit(1)


# =============================================================================
# Progress Emission Functions
# =============================================================================

def emit_progress(stage: str, data: dict):
    """Emit progress message for Node.js to parse."""
    message = {"stage": stage, **data}
    print(f"DENOISING_PROGRESS:{json.dumps(message)}", flush=True)


def emit_result(stage: str, data: dict):
    """Emit result message for Node.js to parse."""
    message = {"stage": stage, **data}
    print(f"DENOISING_RESULT:{json.dumps(message)}", flush=True)


def emit_error(stage: str, message: str, details: str = None):
    """Emit error message for Node.js to parse."""
    data = {"stage": stage, "message": message}
    if details:
        data["details"] = details
    print(f"DENOISING_ERROR:{json.dumps(data)}", flush=True)


# =============================================================================
# Custom Trainer with Progress Callbacks
# =============================================================================

class WebAutoStructN2VTrainer(AutoStructN2VTrainer):
    """
    Extended trainer with web progress callbacks.

    Overrides the train method to emit progress after each epoch.
    """

    def __init__(self, *args, progress_callback=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.progress_callback = progress_callback
        self.start_time = None

    def train(self, train_loader, val_loader, test_loader=None):
        """
        Main training loop with progress emission.
        """
        # Validate inputs based on stage
        if self.stage == 'stage2' and test_loader is None:
            raise ValueError("test_loader is required for stage2 training")

        # Set up early stopping
        patience = self.hparams.get('early_stopping_patience', 10)
        min_delta = self.hparams.get('early_stopping_min_delta', 0.001)
        early_stopping = EarlyStopping(patience=patience, min_delta=min_delta)

        # Path to save best model
        os.makedirs(self.log_dir, exist_ok=True)
        best_model_path = os.path.join(self.log_dir, 'best_model.pth')

        # Get number of epochs
        num_epochs = self.hparams.get('num_epochs', 100)

        # Track timing
        self.start_time = time.time()

        # Emit training start
        if self.progress_callback:
            self.progress_callback(0, num_epochs, 0, 0, self.optimizer.param_groups[0]['lr'])

        # Main training loop
        print(f"Training {self.stage} model...")
        best_val_loss = float('inf')
        train_loss_history = []
        val_loss_history = []

        for epoch in range(num_epochs):
            # Training phase
            train_loss = self.train_epoch(train_loader)
            self.writer.add_scalar('Loss/train', train_loss, epoch)
            train_loss_history.append(train_loss)

            # Validation phase
            val_loss = self.validate_epoch(val_loader)
            self.writer.add_scalar('Loss/val', val_loss, epoch)
            val_loss_history.append(val_loss)

            # Learning rate scheduling
            self.scheduler.step(val_loss)
            current_lr = self.optimizer.param_groups[0]['lr']
            self.writer.add_scalar('LR', current_lr, epoch)

            # Log test images periodically
            if test_loader and epoch % 5 == 0:
                patch_size = self._get_param('patch_size', 64)
                stride = patch_size // 2
                self.log_test_images(test_loader, self.writer, epoch, patch_size, stride)

            # Emit progress
            if self.progress_callback:
                self.progress_callback(epoch + 1, num_epochs, train_loss, val_loss, current_lr)

            # Model saving and early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                self.save_checkpoint(best_model_path)

            if early_stopping(val_loss) and self.hparams.get('early_stopping', True):
                print(f"Early stopping triggered at epoch {epoch}")
                # Emit final progress
                if self.progress_callback:
                    self.progress_callback(epoch + 1, num_epochs, train_loss, val_loss, current_lr, early_stopped=True)
                break

        elapsed = time.time() - self.start_time
        print(f"Training completed. Final losses - Training: {train_loss:.4f}, Validation: {val_loss:.4f}")
        print(f"Total training time: {elapsed/60:.1f} minutes")

        # For stage1, we need to generate denoised patches for mask extraction
        if self.stage == 'stage1':
            print("Generating denoised patches for potential mask extraction...")
            denoised_patches = self._generate_denoised_patches(train_loader)
            return denoised_patches

        return None

    def _generate_denoised_patches(self, train_loader):
        """Generate denoised patches using the trained model."""
        self.model.eval()
        denoised_patches = []

        with torch.no_grad():
            for batch in train_loader:
                inputs = batch['image'].to(self.device)
                outputs = self.model(inputs)

                # Convert to numpy
                for output in outputs:
                    patch = output.cpu().numpy().squeeze()
                    denoised_patches.append(patch)

                # Limit number of patches for memory efficiency
                if len(denoised_patches) >= 500:
                    break

        return np.array(denoised_patches)


# =============================================================================
# TIFF Stack Handling
# =============================================================================

def extract_tiff_stack_to_directory(input_path: str, output_dir: str) -> str:
    """
    Extract a TIFF stack to individual 2D TIF files in a directory.

    The autoStructN2V library expects a directory of individual 2D images,
    not a single TIFF stack file.

    Args:
        input_path: Path to TIFF stack file
        output_dir: Base output directory for the experiment

    Returns:
        str: Path to directory containing extracted images
    """
    import tifffile

    emit_progress('data', {"status": "extracting_stack"})

    # Read the stack
    stack = tifffile.imread(input_path)

    # Handle 2D images (single slice)
    if stack.ndim == 2:
        stack = stack[np.newaxis, ...]

    # Create output directory for extracted images
    extracted_dir = os.path.join(output_dir, 'extracted_images')
    os.makedirs(extracted_dir, exist_ok=True)

    # Extract each slice
    num_slices = len(stack)
    for i, slice_img in enumerate(stack):
        output_path = os.path.join(extracted_dir, f'slice_{i:04d}.tif')
        tifffile.imwrite(output_path, slice_img)

        # Emit progress every 10 slices
        if (i + 1) % 10 == 0 or i == num_slices - 1:
            emit_progress('data', {
                "status": "extracting_stack",
                "current": i + 1,
                "total": num_slices
            })

    emit_progress('data', {
        "status": "extraction_complete",
        "numSlices": num_slices,
        "extractedDir": extracted_dir
    })

    return extracted_dir


def prepare_input_directory(config: dict) -> str:
    """
    Prepare input directory for training.

    If input_dir points to a single TIFF file (stack), extract it.
    If input_dir is already a directory, use it as-is.

    Args:
        config: Training configuration

    Returns:
        str: Path to directory containing training images
    """
    input_dir = config.get('input_dir', '')
    output_dir = config.get('output_dir', '')

    # Check if input_dir is a file (TIFF stack)
    if os.path.isfile(input_dir):
        # It's a file - extract the stack
        return extract_tiff_stack_to_directory(input_dir, output_dir)

    # Check if input_dir contains a single TIFF file
    if os.path.isdir(input_dir):
        tif_files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.tif', '.tiff'))]
        if len(tif_files) == 1:
            # Single file in directory - might be a stack
            single_file = os.path.join(input_dir, tif_files[0])
            import tifffile
            stack = tifffile.imread(single_file)
            if stack.ndim == 3 and stack.shape[0] > 1:
                # It's a stack - extract it
                return extract_tiff_stack_to_directory(single_file, output_dir)

    # input_dir is a directory with multiple images - use as-is
    return input_dir


# =============================================================================
# Training Functions
# =============================================================================

def create_progress_callback(stage: str, training_id: str):
    """Create a progress callback function for the given stage."""
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
    """
    training_id = config.get('training_id', f'train_{int(time.time())}')
    method = config.get('method', 'n2v')  # 'n2v' or 'autostructn2v'

    # Map method to stage flags
    run_stage1 = True
    run_stage2 = method == 'autostructn2v'

    # Update config with stage flags
    config['run_stage1'] = run_stage1
    config['run_stage2'] = run_stage2

    try:
        # Prepare input directory (extract TIFF stacks if needed)
        # This must be done before validate_config since it may change input_dir
        prepared_input_dir = prepare_input_directory(config)
        config['input_dir'] = prepared_input_dir

        # Validate configuration
        config = validate_config(config)
        verbose = config.get('verbose', False)

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
            "gpuAvailable": torch.cuda.is_available()
        })

        # Split dataset
        emit_progress('data', {"training_id": training_id, "status": "splitting"})
        image_paths = split_dataset(
            config['input_dir'],
            dirs,
            config['split_ratio'],
            config['image_extension'],
            config['random_seed'],
            verbose=verbose
        )

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
            'stages_run': []
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
                "totalEpochs": config['stage1'].get('num_epochs', config.get('num_epochs', 100))
            })

            # Create dataloaders
            train_loader, val_loader, test_loader = create_dataloaders(
                image_paths, config, "stage1", verbose=verbose
            )

            # Create model
            stage1_model = create_model(
                'stage1',
                features=config['stage1']['features'],
                num_layers=config['stage1']['num_layers'],
                use_resize_conv=config['stage1'].get('use_resize_conv', True),
                upsampling_mode=config['stage1'].get('upsampling_mode', 'bilinear')
            )

            # Create optimizer and scheduler
            optimizer = torch.optim.Adam(stage1_model.parameters(), lr=config['stage1']['learning_rate'])
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
                optimizer, mode='min', factor=0.5, patience=5, verbose=True
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
                progress_callback=create_progress_callback('stage1', training_id)
            )

            # Train
            denoised_patches = stage1_trainer.train(train_loader, val_loader, test_loader)

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
            emit_progress('stage1_inference', {"training_id": training_id, "status": "starting"})

            # Load trained model for inference
            stage1_trained_model = create_model(
                'stage1',
                features=config['stage1']['features'],
                num_layers=config['stage1']['num_layers'],
                use_resize_conv=config['stage1'].get('use_resize_conv', True),
                upsampling_mode=config['stage1'].get('upsampling_mode', 'bilinear')
            ).to(device)

            checkpoint = torch.load(stage1_checkpoint_path, map_location=device)
            stage1_trained_model.load_state_dict(checkpoint['model_state_dict'])
            stage1_trained_model.eval()

            # Create predictor and denoise
            predictor = AutoStructN2VPredictor(
                model=stage1_trained_model,
                patch_size=config['stage1']['patch_size']
            )

            stage1_denoised_dir = os.path.join(dirs['data'], 'stage1_denoised')
            os.makedirs(stage1_denoised_dir, exist_ok=True)

            for split_name, split_paths in zip(['train', 'val', 'test'], image_paths):
                split_output_dir = os.path.join(stage1_denoised_dir, split_name)
                os.makedirs(split_output_dir, exist_ok=True)
                input_split_dir = os.path.dirname(split_paths[0]) if split_paths else None
                if input_split_dir and os.path.exists(input_split_dir):
                    predictor.process_directory(input_split_dir, split_output_dir, show=False)

            results['stage1_denoised_dir'] = stage1_denoised_dir

            emit_progress('stage1_inference', {"training_id": training_id, "status": "complete"})

            # Cleanup
            del stage1_model, stage1_trainer, optimizer, scheduler
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        # =====================================================================
        # Stage 2: Structured Noise2Void (if autoStructN2V)
        # =====================================================================
        if run_stage2:
            emit_progress('mask', {"training_id": training_id, "status": "extracting"})

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

            struct_mask, autocorr_data = extractor.extract_mask(denoised_patches, verbose)

            # Create full mask
            full_mask, prediction_kernel = create_full_mask(
                struct_mask,
                config['stage2']['patch_size'],
                config['stage2']['mask_percentage'],
                verbose
            )

            # Save mask
            mask_save_path = os.path.join(dirs['stage2']['model'], 'stage2_mask.npy')
            os.makedirs(os.path.dirname(mask_save_path), exist_ok=True)
            np.save(mask_save_path, struct_mask)

            # Check for empty mask (only center pixel or < 2 active pixels)
            active_pixels = np.sum(struct_mask)
            kernel_size = struct_mask.shape[0]
            center_only = active_pixels == 1 and struct_mask[kernel_size//2, kernel_size//2]

            emit_result('mask', {
                "training_id": training_id,
                "kernelSize": int(kernel_size),
                "activePixels": int(active_pixels),
                "centerOnly": bool(center_only),
                "isEmpty": active_pixels < 2 or center_only,
                "maskPath": mask_save_path,
                "pattern": _detect_pattern(struct_mask)
            })

            results['mask_path'] = mask_save_path
            results['mask_info'] = {
                'active_pixels': int(active_pixels),
                'kernel_size': int(kernel_size),
                'is_empty': active_pixels < 2 or center_only
            }

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
                    "totalEpochs": config['stage2'].get('num_epochs', config.get('num_epochs', 100))
                })

                # Create dataloaders with structured mask
                stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                    image_paths,
                    config,
                    "stage2",
                    structured_mask=full_mask,
                    prediction_kernel=prediction_kernel,
                    verbose=verbose
                )

                # Create model
                stage2_model = create_model(
                    'stage2',
                    features=config['stage2']['features'],
                    num_layers=config['stage2']['num_layers'],
                    use_resize_conv=config['stage2'].get('use_resize_conv', True),
                    upsampling_mode=config['stage2'].get('upsampling_mode', 'bilinear')
                )

                # Create optimizer and scheduler
                stage2_optimizer = torch.optim.Adam(
                    stage2_model.parameters(),
                    lr=config['stage2']['learning_rate']
                )
                stage2_scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
                    stage2_optimizer, mode='min', factor=0.5, patience=5, verbose=True
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
                    progress_callback=create_progress_callback('stage2', training_id)
                )

                # Train
                stage2_trainer.train(stage2_train_loader, stage2_val_loader, stage2_test_loader)

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

        # Emit final completion
        emit_result('complete', {
            "training_id": training_id,
            "method": method,
            "experimentDir": dirs['experiment'],
            "stagesRun": results['stages_run']
        })

        # Save results summary
        results_path = os.path.join(dirs['experiment'], 'results.json')
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=4)

        return results

    except Exception as e:
        emit_error('training', str(e), traceback.format_exc())
        raise


def _detect_pattern(mask: np.ndarray) -> str:
    """Detect the pattern type of a mask kernel."""
    if mask.size == 0:
        return "empty"

    active = np.sum(mask)
    if active == 0:
        return "empty"
    if active == 1:
        return "single_pixel"

    h, w = mask.shape
    center = (h // 2, w // 2)

    # Check for cross pattern
    horizontal = mask[center[0], :].sum()
    vertical = mask[:, center[1]].sum()

    if horizontal > active * 0.6 or vertical > active * 0.6:
        if horizontal > vertical:
            return "horizontal_line"
        elif vertical > horizontal:
            return "vertical_line"
        else:
            return "cross"

    # Check for diagonal
    diag1 = np.trace(mask)
    diag2 = np.trace(np.fliplr(mask))

    if diag1 > active * 0.5 or diag2 > active * 0.5:
        return "diagonal"

    return "irregular"


# =============================================================================
# Inference Functions
# =============================================================================

def run_inference(config: dict):
    """Run inference with a trained model."""
    inference_id = config.get('inference_id', f'infer_{int(time.time())}')

    try:
        model_path = config['model_path']
        input_path = config['input_path']
        output_dir = config['output_dir']
        stage = config.get('stage', 'stage1')  # Which model to use

        # Get model config
        model_config = config.get('model_config', {})

        # Set device
        device = torch.device('cuda' if torch.cuda.is_available() and config.get('device', 'cuda') == 'cuda' else 'cpu')

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "loading_model",
            "device": str(device)
        })

        # Load model
        model = create_model(
            stage,
            features=model_config.get('features', 64),
            num_layers=model_config.get('num_layers', 2),
            use_resize_conv=model_config.get('use_resize_conv', True),
            upsampling_mode=model_config.get('upsampling_mode', 'bilinear')
        ).to(device)

        checkpoint = torch.load(model_path, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()

        # Create predictor
        patch_size = model_config.get('patch_size', 64)
        predictor = AutoStructN2VPredictor(model=model, patch_size=patch_size)

        # Load input
        import tifffile

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "loading_data"
        })

        input_stack = tifffile.imread(input_path)
        if input_stack.ndim == 2:
            input_stack = input_stack[np.newaxis, ...]

        total_slices = len(input_stack)
        output_stack = []

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "processing",
            "totalSlices": total_slices
        })

        # Process each slice
        for i, slice_img in enumerate(input_stack):
            # Normalize
            slice_norm = (slice_img - slice_img.min()) / (slice_img.max() - slice_img.min() + 1e-8)
            slice_norm = slice_norm.astype(np.float32)

            # Denoise
            denoised = predictor.predict(slice_norm)

            # Rescale to original range
            denoised_rescaled = denoised * (slice_img.max() - slice_img.min()) + slice_img.min()
            output_stack.append(denoised_rescaled.astype(slice_img.dtype))

            # Emit progress
            if (i + 1) % 5 == 0 or i == total_slices - 1:
                emit_progress('inference', {
                    "inference_id": inference_id,
                    "currentSlice": i + 1,
                    "totalSlices": total_slices,
                    "progressPercent": round((i + 1) / total_slices * 100, 1)
                })

        # Save output
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, 'denoised.tif')
        output_stack = np.array(output_stack)
        tifffile.imwrite(output_path, output_stack)

        # Save metadata
        metadata = {
            "inference_id": inference_id,
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
            "slicesProcessed": total_slices
        })

    except Exception as e:
        emit_error('inference', str(e), traceback.format_exc())
        raise


# =============================================================================
# Mask Extraction Functions
# =============================================================================

def extract_mask(config: dict):
    """Extract structural noise mask from images."""
    try:
        input_path = config['input_path']
        output_dir = config['output_dir']
        extractor_params = config.get('extractor', {})

        emit_progress('mask', {"status": "loading"})

        # Load images
        import tifffile
        images = tifffile.imread(input_path)
        if images.ndim == 2:
            images = images[np.newaxis, ...]

        # Extract patches
        patch_size = config.get('patch_size', 64)
        patches = []

        for img in images[:min(len(images), 10)]:  # Use up to 10 slices
            img_norm = (img - img.min()) / (img.max() - img.min() + 1e-8)
            h, w = img_norm.shape

            for _ in range(20):  # 20 patches per image
                if h >= patch_size and w >= patch_size:
                    top = np.random.randint(0, h - patch_size + 1)
                    left = np.random.randint(0, w - patch_size + 1)
                    patch = img_norm[top:top+patch_size, left:left+patch_size]
                    patches.append(patch)

        patches = np.array(patches)

        emit_progress('mask', {"status": "extracting", "numPatches": len(patches)})

        # Create extractor
        extractor = StructuralNoiseExtractor(
            norm_autocorr=extractor_params.get('norm_autocorr', True),
            log_autocorr=extractor_params.get('log_autocorr', True),
            adapt_autocorr=extractor_params.get('adapt_autocorr', True),
            base_percentile=extractor_params.get('base_percentile', 50),
            percentile_decay=extractor_params.get('percentile_decay', 1.15),
            max_true_pixels=extractor_params.get('max_true_pixels', 25)
        )

        # Extract mask
        struct_mask, _ = extractor.extract_mask(patches, verbose=False)

        # Save mask
        os.makedirs(output_dir, exist_ok=True)
        mask_path = os.path.join(output_dir, 'extracted_mask.npy')
        np.save(mask_path, struct_mask)

        # Generate preview image
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        preview_path = os.path.join(output_dir, 'mask_preview.png')
        plt.figure(figsize=(6, 6))
        plt.imshow(struct_mask, cmap='gray')
        plt.title(f'Extracted Mask ({struct_mask.shape[0]}x{struct_mask.shape[1]})\nActive pixels: {np.sum(struct_mask)}')
        plt.axis('off')
        plt.savefig(preview_path, bbox_inches='tight', dpi=100)
        plt.close()

        emit_result('mask', {
            "maskPath": mask_path,
            "previewPath": preview_path,
            "kernelSize": int(struct_mask.shape[0]),
            "activePixels": int(np.sum(struct_mask)),
            "pattern": _detect_pattern(struct_mask)
        })

    except Exception as e:
        emit_error('mask', str(e), traceback.format_exc())
        raise


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='autoStructN2V Web Wrapper')
    parser.add_argument('--config', required=True, help='Path to config JSON file')
    parser.add_argument('--mode', required=True, choices=['train', 'inference', 'extract_mask'],
                        help='Operation mode')

    args = parser.parse_args()

    # Load config
    try:
        with open(args.config) as f:
            config = json.load(f)
    except Exception as e:
        emit_error('init', f'Failed to load config: {str(e)}')
        sys.exit(1)

    # Run appropriate mode
    try:
        if args.mode == 'train':
            run_training(config)
        elif args.mode == 'inference':
            run_inference(config)
        elif args.mode == 'extract_mask':
            extract_mask(config)
    except Exception as e:
        # Error already emitted in the function
        sys.exit(1)


if __name__ == '__main__':
    main()
