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
import glob
from pathlib import Path
from datetime import datetime

import torch
import numpy as np
import tifffile

# Add the autoStructN2V 2.5D library to path
AUTOSTRUCTN2V_PATH = Path(__file__).parent.parent / 'docs' / 'autoStructN2V_2.5D' / 'autoStructN2V'
sys.path.insert(0, str(AUTOSTRUCTN2V_PATH.parent))  # Add parent so 'autoStructN2V' package is importable

try:
    from autoStructN2V.pipeline import run_pipeline
    from autoStructN2V.pipeline.config import validate_config, create_output_directories
    from autoStructN2V.pipeline.data import split_dataset, create_dataloaders, split_stack_indices
    from autoStructN2V.models import create_model, create_model_from_config
    from autoStructN2V.trainers import AutoStructN2VTrainer
    from autoStructN2V.trainers.callbacks import EarlyStopping
    from autoStructN2V.masking import (
        StructuralNoiseExtractor,
        create_full_mask,
        # 2.5D specific imports
        create_stage1_mask_kernel_3d,
        create_full_mask_3d,
        create_random_mask_3d
    )
    from autoStructN2V.inference import AutoStructN2VPredictor
    from autoStructN2V.utils.training import set_seed
    from autoStructN2V.utils.image import load_tiff_stack, save_tiff_stack
except ImportError as e:
    print(f"DENOISING_ERROR:{json.dumps({'stage': 'init', 'message': f'Failed to import autoStructN2V: {str(e)}', 'details': traceback.format_exc()})}", flush=True)
    sys.exit(1)


# =============================================================================
# Safe Model Loading
# =============================================================================

def safe_load_checkpoint(model_path, device='cpu'):
    """
    Safely load a PyTorch checkpoint with fallback for legacy models.

    Tries weights_only=True first for security, falls back to weights_only=False
    only if necessary (e.g., for models containing numpy objects).
    """
    import warnings
    try:
        return torch.load(model_path, map_location=device, weights_only=True)
    except Exception:
        warnings.warn(
            f"Loading checkpoint with weights_only=False. Ensure {model_path} is from a trusted source.",
            UserWarning
        )
        return torch.load(model_path, map_location=device, weights_only=False)


# =============================================================================
# Model Wrappers for Inference
# =============================================================================

class CenterChannelWrapper(torch.nn.Module):
    """
    Wrapper that extracts only the center channel from a 3-channel output model.

    In 2.5D mode, Stage 1 models for autoStructN2V are trained with out_channels=3
    (for 3D autocorrelation analysis). During inference, we only need the center
    channel (index 1) which predicts the center slice of the triplet.

    This wrapper makes a 3-channel output model compatible with the predictor
    which expects 1-channel output.
    """
    def __init__(self, model, output_channels=3):
        super().__init__()
        self.model = model
        self.output_channels = output_channels

    def forward(self, x):
        output = self.model(x)
        # If model outputs 3 channels, extract only the center channel (index 1)
        if output.shape[1] == 3:
            return output[:, 1:2, :, :]  # Keep dims: (B, 1, H, W)
        return output


def extract_triplet_patches(stack, patch_size, num_patches, seed=None):
    """
    Extract random triplet patches from a 3D stack for 2.5D mask extraction.

    Each triplet consists of 3 consecutive slices (z-1, z, z+1) centered
    at a random position. Used for 3D autocorrelation analysis in mask extraction.

    Args:
        stack (numpy.ndarray): Input stack of shape (Z, H, W)
        patch_size (int): Size of square patches to extract
        num_patches (int): Number of triplet patches to extract
        seed (int, optional): Random seed for reproducibility

    Returns:
        numpy.ndarray: Array of triplet patches of shape (num_patches, 3, patch_size, patch_size)
    """
    if seed is not None:
        np.random.seed(seed)

    num_slices, height, width = stack.shape

    # Valid ranges for center slice (must be able to form triplet)
    min_z = 1
    max_z = num_slices - 2  # Exclusive upper bound for center slice

    if max_z < min_z:
        raise ValueError(f"Stack too shallow for triplet extraction: {num_slices} slices, need at least 3")

    # Valid ranges for patch position
    max_y = height - patch_size
    max_x = width - patch_size

    if max_y < 0 or max_x < 0:
        raise ValueError(f"Image too small for patch_size={patch_size}: {height}x{width}")

    triplet_patches = []

    for _ in range(num_patches):
        # Random center slice index
        z = np.random.randint(min_z, max_z + 1)

        # Random patch position
        y = np.random.randint(0, max_y + 1)
        x = np.random.randint(0, max_x + 1)

        # Extract triplet patch: (3, patch_size, patch_size)
        triplet = stack[z-1:z+2, y:y+patch_size, x:x+patch_size]
        triplet_patches.append(triplet)

    return np.array(triplet_patches)


# =============================================================================
# Progress Emission Functions
# =============================================================================

def convert_to_original_dtype(data: np.ndarray, original_dtype) -> np.ndarray:
    """
    Convert normalized float32 data back to the original dtype.

    Args:
        data: Normalized float32 data in range [0, 1]
        original_dtype: Original numpy dtype to convert to

    Returns:
        Data converted back to original dtype
    """
    # Clip to valid range first
    data = np.clip(data, 0, 1)

    if original_dtype == np.uint8:
        return (data * 255.0).astype(np.uint8)
    elif original_dtype == np.uint16:
        return (data * 65535.0).astype(np.uint16)
    elif np.issubdtype(original_dtype, np.floating):
        # Keep as float, but use the original float type
        return data.astype(original_dtype)
    else:
        # For other types, return float32
        return data.astype(np.float32)


def sanitize_config(config: dict) -> dict:
    """
    Recursively sanitize config values, converting strings to appropriate types.

    This is necessary because JSON values from the frontend may be strings
    when they should be numbers or booleans.
    """
    result = {}
    for key, value in config.items():
        if isinstance(value, dict):
            result[key] = sanitize_config(value)
        elif isinstance(value, str):
            # Try to convert to number
            if value.lower() == 'true':
                result[key] = True
            elif value.lower() == 'false':
                result[key] = False
            elif value.lower() == 'null' or value.lower() == 'none':
                result[key] = None
            else:
                try:
                    # Try integer first
                    if '.' in value:
                        result[key] = float(value)
                    else:
                        result[key] = int(value)
                except ValueError:
                    # Keep as string if conversion fails
                    result[key] = value
        else:
            result[key] = value
    return result


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
    Also handles 2.5D Stage 2 shape mismatch in loss calculation.
    """

    def __init__(self, *args, progress_callback=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.progress_callback = progress_callback
        self.start_time = None

    def calculate_loss(self, pred, target, mask):
        """
        Calculate masked MSE loss with handling for 2.5D Stage 2.

        In 2.5D Stage 2, the model outputs 1 channel (center slice prediction)
        but the target is 3 channels (full triplet). We extract the center
        slice from target and mask for loss calculation.

        Args:
            pred: Predicted tensor (B, C_pred, H, W)
            target: Target tensor (B, C_target, H, W)
            mask: Mask tensor (B, C_mask, H, W) or (C_mask, H, W)

        Returns:
            Loss value
        """
        import torch.nn as nn

        # Handle 2.5D Stage 2: pred has 1 channel, target has 3 channels
        if pred.shape[1] == 1 and target.shape[1] == 3:
            # Extract center slice from target (index 1)
            target = target[:, 1:2, :, :]  # Keep dims: (B, 1, H, W)

            # Extract center slice from mask
            if mask.dim() == 4:
                # Batch dimension present: (B, 3, H, W) -> (B, 1, H, W)
                mask = mask[:, 1:2, :, :]
            elif mask.dim() == 3:
                # No batch dimension: (3, H, W) -> (1, H, W)
                mask = mask[1:2, :, :]

        # Ensure mask matches pred shape
        if mask.dim() == 3:
            # Add batch dimension and expand
            mask = mask.unsqueeze(0).expand(pred.shape[0], -1, -1, -1)

        # Validate shapes now match
        if pred.shape != target.shape:
            raise ValueError(f"Shape mismatch after adjustment: pred {pred.shape} vs target {target.shape}")
        if mask.shape != pred.shape:
            raise ValueError(f"Mask shape {mask.shape} doesn't match pred shape {pred.shape}")

        # Calculate MSE loss on masked pixels only
        pixel_losses = nn.MSELoss(reduction='none')(pred, target)
        masked_losses = pixel_losses * mask
        loss = masked_losses.sum() / (mask.sum() + 1e-8)

        return loss

    def train(self, train_loader, val_loader, test_loader=None):
        """
        Main training loop with progress emission.
        """
        # Validate inputs based on stage
        if self.stage == 'stage2' and test_loader is None:
            raise ValueError("test_loader is required for stage2 training")

        # Get stage-specific config
        stage_config = self.hparams.get(self.stage, {})

        # Set up early stopping
        patience = stage_config.get('early_stopping_patience', self.hparams.get('early_stopping_patience', 10))
        min_delta = stage_config.get('early_stopping_min_delta', self.hparams.get('early_stopping_min_delta', 0.001))
        early_stopping = EarlyStopping(patience=patience, min_delta=min_delta)

        # Path to save best model
        os.makedirs(self.log_dir, exist_ok=True)
        best_model_path = os.path.join(self.log_dir, 'best_model.pth')

        # Get number of epochs from stage-specific config
        num_epochs = stage_config.get('num_epochs', self.hparams.get('num_epochs', 100))

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
            # Skip for 2.5D Stage 2 due to channel mismatch (model outputs 1ch, input is 3ch)
            mode = self.hparams.get('mode', '2d')
            skip_test_images = (mode == '2.5d' and self.stage == 'stage2')
            if test_loader and epoch % 5 == 0 and not skip_test_images:
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

            if early_stopping(val_loss) and stage_config.get('early_stopping', self.hparams.get('early_stopping', True)):
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
            for inputs, targets, masks in train_loader:
                inputs = inputs.to(self.device)
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

def extract_tiff_stack_to_directory(input_path: str, output_dir: str) -> tuple:
    """
    Extract a TIFF stack to individual 2D TIF files in a directory.

    The autoStructN2V library expects a directory of individual 2D images,
    not a single TIFF stack file.

    Args:
        input_path: Path to TIFF stack file
        output_dir: Base output directory for the experiment

    Returns:
        tuple: (path to directory containing extracted images, number of slices)
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

    return extracted_dir, num_slices


def prepare_input_directory(config: dict) -> tuple:
    """
    Prepare input directory for training.

    For 2D mode:
        - If input_dir points to a single TIFF file (stack), extract it to individual slices.
        - If input_dir is already a directory, use it as-is.

    For 2.5D mode:
        - Pass the TIFF stack path directly (no extraction).
        - The new library handles stack loading natively.

    Args:
        config: Training configuration

    Returns:
        tuple: (path to directory/file for training, extracted_images_dir or None, num_slices or None)
    """
    input_dir = config.get('input_dir', '')
    output_dir = config.get('output_dir', '')
    mode = config.get('mode', '2d')

    # For 2.5D mode, pass the TIFF stack directly - no extraction needed
    if mode == '2.5d':
        import tifffile

        # Find the TIFF stack file
        if os.path.isfile(input_dir):
            stack_path = input_dir
        elif os.path.isdir(input_dir):
            tif_files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.tif', '.tiff'))]
            if len(tif_files) == 1:
                stack_path = os.path.join(input_dir, tif_files[0])
            else:
                raise ValueError(f"2.5D mode requires a single TIFF stack, found {len(tif_files)} files in {input_dir}")
        else:
            raise ValueError(f"Invalid input path for 2.5D mode: {input_dir}")

        # Get stack info for logging
        stack = tifffile.imread(stack_path)
        if stack.ndim == 2:
            num_slices = 1
        else:
            num_slices = stack.shape[0]

        emit_progress('data', {
            "status": "stack_detected",
            "mode": "2.5d",
            "numSlices": num_slices,
            "stackPath": stack_path
        })

        # Return the stack path directly - the library will load it
        return stack_path, None, num_slices

    # 2D mode: extract TIFF stack to individual slices
    # Check if input_dir is a file (TIFF stack)
    if os.path.isfile(input_dir):
        # It's a file - extract the stack
        extracted_dir, num_slices = extract_tiff_stack_to_directory(input_dir, output_dir)
        return extracted_dir, extracted_dir, num_slices

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
                extracted_dir, num_slices = extract_tiff_stack_to_directory(single_file, output_dir)
                return extracted_dir, extracted_dir, num_slices

    # input_dir is a directory with multiple images - use as-is
    return input_dir, None, None


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
    Supports both 2D mode (directory of images) and 2.5D mode (TIFF stack).
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
            "mode": mode,
            "gpuAvailable": torch.cuda.is_available()
        })

        # Split dataset (different approach for 2D vs 2.5D)
        emit_progress('data', {"training_id": training_id, "status": "splitting", "mode": mode})

        if mode == '2.5d':
            # 2.5D mode: Split by z-indices, load stack
            import tifffile
            stack = tifffile.imread(config['input_data'])
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
            'original_num_slices': original_num_slices
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

            # Create predictor with mode (2.5D uses triplet sliding window)
            predictor = AutoStructN2VPredictor(
                model=inference_model,
                patch_size=config['stage1']['patch_size'],
                mode=mode
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

            # Extract mask (different method for 2D vs 2.5D)
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

                # Create full 3D mask
                full_mask, prediction_kernel = create_full_mask_3d(
                    struct_mask,
                    config['stage2']['patch_size'],
                    config['stage2']['mask_percentage'],
                    verbose
                )
            else:
                # 2D mode: Standard 2D mask extraction
                struct_mask, autocorr_data = extractor.extract_mask(denoised_patches, verbose)

                # Save the denoised patches used for mask extraction
                denoised_patches_path = os.path.join(dirs['stage2']['model'], 'denoised_patches_for_mask.npy')
                os.makedirs(os.path.dirname(denoised_patches_path), exist_ok=True)
                np.save(denoised_patches_path, denoised_patches)
                print(f"Saved {len(denoised_patches)} denoised patches for mask regeneration to {denoised_patches_path}")

                # Create full 2D mask
                full_mask, prediction_kernel = create_full_mask(
                    struct_mask,
                    config['stage2']['patch_size'],
                    config['stage2']['mask_percentage'],
                    verbose
                )

            # Save mask (structure depends on mode)
            mask_save_path = os.path.join(dirs['stage2']['model'], 'stage2_mask.npy')
            os.makedirs(os.path.dirname(mask_save_path), exist_ok=True)
            np.save(mask_save_path, struct_mask)

            # Check for empty mask (only center pixel or < 2 active pixels)
            if mode == '2.5d':
                # For 3D mask, check center slice
                active_pixels = int(np.sum(struct_mask[1]))  # Center slice
                kernel_size = int(struct_mask.shape[1])  # Spatial dimension
                center_only = bool(active_pixels == 1 and struct_mask[1, kernel_size//2, kernel_size//2])
                is_empty = bool(active_pixels < 2 or center_only)
                # For 2.5D, maskArray is a list of 3 2D arrays
                mask_array_for_viz = [s.astype(int).tolist() for s in struct_mask]
            else:
                active_pixels = int(np.sum(struct_mask))
                kernel_size = int(struct_mask.shape[0])
                center_only = bool(active_pixels == 1 and struct_mask[kernel_size//2, kernel_size//2])
                is_empty = bool(active_pixels < 2 or center_only)
                mask_array_for_viz = struct_mask.astype(int).tolist()

            emit_result('mask', {
                "training_id": training_id,
                "mode": mode,
                "kernelSize": kernel_size,
                "activePixels": active_pixels,
                "centerOnly": center_only,
                "isEmpty": is_empty,
                "maskPath": mask_save_path,
                "pattern": _detect_pattern(struct_mask[1] if mode == '2.5d' else struct_mask),
                "maskArray": mask_array_for_viz  # 2D or 3D array for visualization
            })

            results['mask_path'] = mask_save_path
            results['mask_info'] = {
                'active_pixels': active_pixels,
                'kernel_size': kernel_size,
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
                    "activePixels": active_pixels,
                    "pattern": _detect_pattern(struct_mask[1] if mode == '2.5d' else struct_mask),
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

                # Create dataloaders with structured mask (different for 2D vs 2.5D)
                if mode == '2.5d':
                    # 2.5D mode: stack-based dataloaders
                    stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                        config=config,
                        stage="stage2",
                        stack=loaded_stack,
                        slice_indices=slice_indices,
                        structured_mask=full_mask,
                        prediction_kernel=prediction_kernel,
                        verbose=verbose
                    )
                else:
                    # 2D mode: path-based dataloaders
                    stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                        image_paths,
                        config,
                        "stage2",
                        structured_mask=full_mask,
                        prediction_kernel=prediction_kernel,
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

            # Create predictor with mode (2.5D uses triplet sliding window)
            predictor = AutoStructN2VPredictor(
                model=stage2_trained_model,
                patch_size=config['stage2']['patch_size'],
                mode=mode
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
# Output Cleanup and Stack Creation Functions
# =============================================================================

def collect_denoised_slices(denoised_dir: str) -> list:
    """
    Collect all denoised slice TIFF files from train/val/test directories.

    Args:
        denoised_dir: Path to directory containing train/val/test subdirs with denoised slices

    Returns:
        List of (slice_number, file_path) tuples, sorted by slice number
    """
    import re

    slices = []

    print(f"[DEBUG] Looking for denoised slices in: {denoised_dir}")

    # Check for train/val/test subdirectories
    for split in ['train', 'val', 'test']:
        split_dir = os.path.join(denoised_dir, split)
        if not os.path.exists(split_dir):
            print(f"[DEBUG] Split directory does not exist: {split_dir}")
            continue

        files_in_dir = os.listdir(split_dir)
        print(f"[DEBUG] Found {len(files_in_dir)} files in {split}: {files_in_dir[:5]}{'...' if len(files_in_dir) > 5 else ''}")

        for filename in files_in_dir:
            if filename.endswith('_denoised.tif') or filename.endswith('.tif'):
                # Extract slice number from filename (e.g., slice_0042_denoised.tif -> 42)
                match = re.search(r'slice_(\d+)', filename)
                if match:
                    slice_num = int(match.group(1))
                    file_path = os.path.join(split_dir, filename)
                    slices.append((slice_num, file_path))
                else:
                    print(f"[DEBUG] Could not extract slice number from: {filename}")

    print(f"[DEBUG] Total slices collected: {len(slices)}")

    # Sort by slice number
    slices.sort(key=lambda x: x[0])

    return slices


def create_tiff_stack(slices: list, output_path: str) -> int:
    """
    Combine individual slice TIFFs into an ordered TIFF stack.

    Args:
        slices: List of (slice_number, file_path) tuples, sorted by slice number
        output_path: Path to save the combined TIFF stack

    Returns:
        Number of slices in the stack
    """
    import tifffile

    if not slices:
        return 0

    # Read all slices and ensure consistent shapes
    stack_list = []
    expected_shape = None

    for i, (slice_num, file_path) in enumerate(slices):
        img = tifffile.imread(file_path)

        # Ensure 2D
        if img.ndim == 3 and img.shape[0] == 1:
            img = img.squeeze(0)
        elif img.ndim > 2:
            print(f"[DEBUG] Warning: slice {slice_num} has unexpected shape {img.shape}, taking first frame")
            img = img[0] if img.ndim == 3 else img.reshape(img.shape[-2], img.shape[-1])

        if i == 0:
            expected_shape = img.shape
            print(f"[DEBUG] First slice (#{slice_num}) shape: {img.shape}, dtype: {img.dtype}")
        elif img.shape != expected_shape:
            print(f"[DEBUG] Warning: slice {slice_num} shape {img.shape} differs from expected {expected_shape}")

        if i < 5 or i >= len(slices) - 2:
            print(f"[DEBUG] Slice {i} (orig #{slice_num}): shape={img.shape}")

        stack_list.append(img)

    print(f"[DEBUG] Collected {len(stack_list)} slices into list")

    # Stack into 3D array (Z, H, W)
    stack = np.stack(stack_list, axis=0)
    print(f"[DEBUG] np.stack result shape: {stack.shape}, dtype: {stack.dtype}")

    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # Write as standard multi-page TIFF (avoid imagej=True which can cause slice count issues)
    print(f"[DEBUG] Writing to: {output_path}")
    tifffile.imwrite(output_path, stack)

    # Verify the written file
    verification = tifffile.imread(output_path)
    print(f"[DEBUG] Verification - saved file shape: {verification.shape}, dtype: {verification.dtype}")

    if verification.ndim == 2:
        print(f"[DEBUG] ERROR: Written file is 2D instead of 3D! Something went wrong.")
    elif verification.shape[0] != len(stack_list):
        print(f"[DEBUG] ERROR: Written file has {verification.shape[0]} slices but expected {len(stack_list)}")

    return len(stack_list)


def finalize_training_output(config: dict, dirs: dict, results: dict, method: str, training_id: str):
    """
    Finalize training output by creating TIFF stacks and cleaning up intermediate files.

    This function:
    1. Collects all denoised slices from train/val/test directories
    2. Combines them into single TIFF stacks (sorted by original order)
    3. Copies model files to final locations
    4. Saves config to models directory
    5. Deletes all intermediate files and directories

    Args:
        config: Training configuration
        dirs: Directory structure from create_output_directories
        results: Results dictionary with paths
        method: 'n2v' or 'autostructn2v'
        training_id: Training ID for naming
    """
    import shutil

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "starting"
    })

    # Get workspace paths from config
    workspace_dir = config.get('workspace_dir', os.path.dirname(dirs['experiment']))

    # Create final output directories
    results_output_dir = os.path.join(workspace_dir, 'results', 'denoising', f'DL_{training_id}')
    models_output_dir = os.path.join(workspace_dir, 'models', 'denoising', f'DL_{training_id}')
    os.makedirs(results_output_dir, exist_ok=True)
    os.makedirs(models_output_dir, exist_ok=True)

    output_files = {}

    # =========================================================================
    # Stage 1 Output (N2V or autoStructN2V Stage 1)
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "creating_stage1_stack"
    })

    mode = config.get('mode', '2d')
    stage1_stack_created = False

    # Check for 2.5D mode: we already have a complete stack file
    stage1_denoised_stack_path = results.get('stage1_denoised_stack_path')
    if mode == '2.5d' and stage1_denoised_stack_path and os.path.exists(stage1_denoised_stack_path):
        import tifffile

        # Read the stack to get slice count
        stack = tifffile.imread(stage1_denoised_stack_path)
        slice_count = stack.shape[0] if stack.ndim == 3 else 1

        # Determine output filename based on method
        if method == 'n2v':
            stack_filename = f'n2v_denoised_{training_id}.tif'
        else:
            stack_filename = f'asn2v_stage1_denoised_{training_id}.tif'

        # Copy to final results directory
        stack_output_path = os.path.join(results_output_dir, stack_filename)
        shutil.copy2(stage1_denoised_stack_path, stack_output_path)

        output_files['stage1_stack'] = stack_output_path
        output_files['stage1_slice_count'] = slice_count
        stage1_stack_created = True

        print(f"[DEBUG] 2.5D Stage 1 stack copied: {stack_output_path} ({slice_count} slices)")

        emit_progress('cleanup', {
            "training_id": training_id,
            "status": "stage1_stack_created",
            "sliceCount": slice_count,
            "outputPath": stack_output_path
        })

    # 2D mode: collect individual slices from directories
    if not stage1_stack_created:
        stage1_denoised_dir = results.get('stage1_denoised_dir')
        if stage1_denoised_dir and os.path.exists(stage1_denoised_dir):
            # Collect and sort slices
            slices = collect_denoised_slices(stage1_denoised_dir)

            if slices:
                # Determine output filename based on method
                if method == 'n2v':
                    stack_filename = f'n2v_denoised_{training_id}.tif'
                else:
                    stack_filename = f'asn2v_stage1_denoised_{training_id}.tif'

                stack_output_path = os.path.join(results_output_dir, stack_filename)
                slice_count = create_tiff_stack(slices, stack_output_path)

                output_files['stage1_stack'] = stack_output_path
                output_files['stage1_slice_count'] = slice_count

                emit_progress('cleanup', {
                    "training_id": training_id,
                    "status": "stage1_stack_created",
                    "sliceCount": slice_count,
                    "outputPath": stack_output_path
                })

    # =========================================================================
    # Stage 2 Output (autoStructN2V only)
    # =========================================================================

    if method == 'autostructn2v' and 'stage2' in results.get('stages_run', []):
        emit_progress('cleanup', {
            "training_id": training_id,
            "status": "creating_stage2_stack"
        })

        mode = config.get('mode', '2d')
        stage2_stack_created = False

        # Check for 2.5D mode: we already have a complete stack file
        stage2_denoised_stack_path = results.get('stage2_denoised_stack_path')
        if mode == '2.5d' and stage2_denoised_stack_path and os.path.exists(stage2_denoised_stack_path):
            import tifffile

            # Read the stack to get slice count
            stack = tifffile.imread(stage2_denoised_stack_path)
            slice_count = stack.shape[0] if stack.ndim == 3 else 1

            # Copy to final results directory
            stack_filename = f'asn2v_stage2_denoised_{training_id}.tif'
            stack_output_path = os.path.join(results_output_dir, stack_filename)
            shutil.copy2(stage2_denoised_stack_path, stack_output_path)

            output_files['stage2_stack'] = stack_output_path
            output_files['stage2_slice_count'] = slice_count
            stage2_stack_created = True

            print(f"[DEBUG] 2.5D Stage 2 stack copied: {stack_output_path} ({slice_count} slices)")

            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "stage2_stack_created",
                "sliceCount": slice_count,
                "outputPath": stack_output_path
            })

        # 2D mode: collect individual slices from directories
        if not stage2_stack_created:
            stage2_denoised_dir = results.get('stage2_denoised_dir')

            if stage2_denoised_dir and os.path.exists(stage2_denoised_dir):
                slices = collect_denoised_slices(stage2_denoised_dir)

                if slices:
                    stack_filename = f'asn2v_stage2_denoised_{training_id}.tif'
                    stack_output_path = os.path.join(results_output_dir, stack_filename)
                    slice_count = create_tiff_stack(slices, stack_output_path)

                    output_files['stage2_stack'] = stack_output_path
                    output_files['stage2_slice_count'] = slice_count

                    emit_progress('cleanup', {
                        "training_id": training_id,
                        "status": "stage2_stack_created",
                        "sliceCount": slice_count,
                        "outputPath": stack_output_path
                    })

    # =========================================================================
    # Copy Model Files
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "copying_models"
    })

    # Copy stage 1 model
    stage1_model_path = results.get('stage1_model_path')
    if stage1_model_path and os.path.exists(stage1_model_path):
        if method == 'n2v':
            dest_model_path = os.path.join(models_output_dir, 'best_model.pth')
        else:
            dest_model_path = os.path.join(models_output_dir, 'stage1_best_model.pth')
        shutil.copy2(stage1_model_path, dest_model_path)
        output_files['stage1_model'] = dest_model_path

    # Copy stage 2 model (autoStructN2V only)
    stage2_model_path = results.get('stage2_model_path')
    if stage2_model_path and os.path.exists(stage2_model_path):
        dest_model_path = os.path.join(models_output_dir, 'stage2_best_model.pth')
        shutil.copy2(stage2_model_path, dest_model_path)
        output_files['stage2_model'] = dest_model_path

    # Copy structural mask (autoStructN2V only - for documentation/reproducibility)
    mask_path = results.get('mask_path')
    if mask_path and os.path.exists(mask_path):
        dest_mask_path = os.path.join(models_output_dir, 'structural_mask.npy')
        shutil.copy2(mask_path, dest_mask_path)
        output_files['structural_mask'] = dest_mask_path

        # Also save mask info as JSON for easy inspection
        mask_info = results.get('mask_info', {})
        if mask_info:
            mask_info_path = os.path.join(models_output_dir, 'mask_info.json')
            with open(mask_info_path, 'w') as f:
                json.dump(mask_info, f, indent=2)
            output_files['mask_info'] = mask_info_path

    # =========================================================================
    # Save Config to Models Directory
    # =========================================================================

    config_src = os.path.join(dirs['experiment'], 'config.json')
    if os.path.exists(config_src):
        # Add output file info to config
        config_copy = config.copy() if isinstance(config, dict) else {}
        config_copy['outputs'] = {
            'stage1_stack': output_files.get('stage1_stack', ''),
            'stage2_stack': output_files.get('stage2_stack', ''),
            'sliceCount': output_files.get('stage1_slice_count', 0)
        }

        config_dest = os.path.join(models_output_dir, 'config.json')
        with open(config_dest, 'w') as f:
            # Make config JSON serializable
            config_serializable = {}
            for k, v in config_copy.items():
                if isinstance(v, (dict, list, str, int, float, bool, type(None))):
                    config_serializable[k] = v
                else:
                    config_serializable[k] = str(v)
            json.dump(config_serializable, f, indent=4)
        output_files['config'] = config_dest

    # =========================================================================
    # Cleanup Intermediate Files
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "cleaning_up"
    })

    # Delete the experiment directory (contains all intermediate files)
    experiment_dir = dirs['experiment']
    if os.path.exists(experiment_dir):
        try:
            shutil.rmtree(experiment_dir)
            print(f"[DEBUG] Deleted experiment directory: {experiment_dir}")
        except Exception as e:
            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "cleanup_warning",
                "message": f"Could not fully delete experiment directory: {str(e)}"
            })

    # Delete the extracted_images directory (created during TIFF stack extraction)
    extracted_images_dir = results.get('extracted_images_dir')
    if extracted_images_dir and os.path.exists(extracted_images_dir):
        try:
            shutil.rmtree(extracted_images_dir)
            print(f"[DEBUG] Deleted extracted_images directory: {extracted_images_dir}")
        except Exception as e:
            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "cleanup_warning",
                "message": f"Could not delete extracted_images directory: {str(e)}"
            })

    # =========================================================================
    # Emit Final Result
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "complete",
        "outputFiles": output_files
    })

    return output_files


# =============================================================================
# Inference Functions
# =============================================================================

def run_inference(config: dict):
    """
    Run inference with a trained model.

    Supports both 2D mode (per-slice processing) and 2.5D mode (triplet sliding window).
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
        import tifffile

        emit_progress('inference', {
            "inference_id": inference_id,
            "status": "loading_data",
            "mode": mode
        })

        input_stack = tifffile.imread(input_path)
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

        import tifffile

        # Load input data
        emit_progress('inference', {
            "inference_id": inference_id,
            "stage": "stage1",
            "status": "loading_data",
            "mode": mode
        })

        input_stack = tifffile.imread(input_path)
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


# =============================================================================
# Mask Extraction Functions
# =============================================================================

def extract_mask(config: dict):
    """Extract structural noise mask from images.

    If denoised_patches_path is provided and exists, uses those exact patches
    (same as initial training). Otherwise falls back to sampling from images.

    Supports both 2D mode (2D patches) and 2.5D mode (triplet patches).
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
            import tifffile
            images = tifffile.imread(input_path)
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

        # Extract mask (different method for 2D vs 2.5D)
        if mode == '2.5d':
            struct_mask, _ = extractor.extract_mask_3d(patches, verbose=False)
            # For 3D mask, center slice contains the main pattern
            active_pixels = int(np.sum(struct_mask[1]))  # Center slice
            kernel_size = int(struct_mask.shape[1])
            mask_array_for_viz = [s.astype(int).tolist() for s in struct_mask]
            pattern = _detect_pattern(struct_mask[1])
        else:
            struct_mask, _ = extractor.extract_mask(patches, verbose=False)
            active_pixels = int(np.sum(struct_mask))
            kernel_size = int(struct_mask.shape[0])
            mask_array_for_viz = struct_mask.astype(int).tolist()
            pattern = _detect_pattern(struct_mask)

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
            plt.suptitle(f'Extracted 3D Mask ({kernel_size}x{kernel_size})\nTotal active (center): {active_pixels}')
        else:
            plt.figure(figsize=(6, 6))
            plt.imshow(struct_mask, cmap='gray')
            plt.title(f'Extracted Mask ({kernel_size}x{kernel_size})\nActive pixels: {active_pixels}')
            plt.axis('off')

        plt.savefig(preview_path, bbox_inches='tight', dpi=100)
        plt.close()

        emit_result('mask', {
            "maskPath": mask_path,
            "previewPath": preview_path,
            "mode": mode,
            "kernelSize": kernel_size,
            "activePixels": active_pixels,
            "pattern": pattern,
            "maskArray": mask_array_for_viz  # 2D or 3D array for visualization
        })

    except Exception as e:
        emit_error('mask', str(e), traceback.format_exc())
        raise


# =============================================================================
# Stage 2 Only Mode (Resume after mask approval)
# =============================================================================

def run_stage2_only(config: dict):
    """
    Run Stage 2 training only, using existing Stage 1 output and approved mask.

    This mode is used to resume training after the user has approved the mask
    during the pauseAfterMask workflow.

    Required config keys:
        - training_id: The original training ID
        - experiment_dir: Path to the experiment directory from Stage 1
        - stage1_model_path: Path to Stage 1 model checkpoint
        - stage1_denoised_dir: Path to Stage 1 denoised images
        - mask_path: Path to the approved mask .npy file
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

        # For 2.5D mode, ensure only input_data is set (not input_dir)
        # For 2D mode, ensure only input_dir is set (not input_data)
        mode = config.get('mode', '2d')
        if mode == '2.5d':
            if 'input_dir' in config:
                del config['input_dir']
        else:
            if 'input_data' in config:
                del config['input_data']

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

        # Create full mask (mode-aware: 2.5D uses 3D masks)
        if mode == '2.5d' and struct_mask.ndim == 3:
            full_mask, prediction_kernel = create_full_mask_3d(
                struct_mask,
                config['stage2']['patch_size'],
                config['stage2']['mask_percentage'],
                verbose
            )
        else:
            from autoStructN2V.masking import create_full_mask
            full_mask, prediction_kernel = create_full_mask(
                struct_mask,
                config['stage2']['patch_size'],
                config['stage2']['mask_percentage'],
                verbose
            )

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
            import tifffile
            stack_path = config.get('input_data')
            if not stack_path or not os.path.exists(stack_path):
                emit_error('stage2', f'Stack file not found for 2.5D mode: {stack_path}')
                raise FileNotFoundError(f'Stack file not found: {stack_path}')

            stack = tifffile.imread(stack_path)
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
                import ast
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
            'mask_path': mask_path
        }

        # For 2.5D mode, check if Stage 1 denoised stack exists
        if mode == '2.5d':
            stage1_denoised_stack_path = os.path.join(stage1_denoised_dir, 'stage1_denoised_stack.tif')
            if os.path.exists(stage1_denoised_stack_path):
                results['stage1_denoised_stack_path'] = stage1_denoised_stack_path
                print(f"[DEBUG] Found Stage 1 denoised stack: {stage1_denoised_stack_path}")

        # =====================================================================
        # Stage 2: Structured Noise2Void
        # =====================================================================
        emit_progress('stage2', {
            "training_id": training_id,
            "status": "starting",
            "totalEpochs": config['stage2'].get('num_epochs', config.get('num_epochs', 100))
        })

        # Create dataloaders with structured mask (different for 2D vs 2.5D)
        if mode == '2.5d':
            # 2.5D mode: Use stack and slice_indices
            stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                config=config,
                stage="stage2",
                structured_mask=full_mask,
                prediction_kernel=prediction_kernel,
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
                structured_mask=full_mask,
                prediction_kernel=prediction_kernel,
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

        # Create predictor and denoise
        predictor = AutoStructN2VPredictor(
            model=stage2_trained_model,
            patch_size=config['stage2']['patch_size'],
            mode=mode
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


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='autoStructN2V Web Wrapper')
    parser.add_argument('--config', required=True, help='Path to config JSON file')
    parser.add_argument('--mode', required=True,
                        choices=['train', 'inference', 'extract_mask', 'train_stage2_only', 'inference_sequential'],
                        help='Operation mode: train, inference, extract_mask, train_stage2_only (resume after mask approval), or inference_sequential (stage1 then stage2)')

    args = parser.parse_args()

    # Load config
    try:
        with open(args.config) as f:
            config = json.load(f)
        # Sanitize config to ensure proper types (convert strings to numbers/booleans)
        config = sanitize_config(config)
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
        elif args.mode == 'train_stage2_only':
            run_stage2_only(config)
        elif args.mode == 'inference_sequential':
            run_sequential_inference(config)
    except Exception as e:
        # Error already emitted in the function
        sys.exit(1)


if __name__ == '__main__':
    main()
