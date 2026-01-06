"""
Custom trainer class for web integration.

Provides WebAutoStructN2VTrainer that extends the base trainer
with progress callbacks and 2.5D shape handling.
"""

import os
import time

import torch
import torch.nn as nn
import numpy as np

from autoStructN2V.trainers import AutoStructN2VTrainer
from autoStructN2V.trainers.callbacks import EarlyStopping


class WebAutoStructN2VTrainer(AutoStructN2VTrainer):
    """
    Extended trainer with web progress callbacks.

    Overrides the train method to emit progress after each epoch.
    Also handles 2.5D Stage 2 shape mismatch in loss calculation.

    Args:
        *args: Arguments passed to AutoStructN2VTrainer
        progress_callback: Optional callback function for progress updates
        **kwargs: Keyword arguments passed to AutoStructN2VTrainer
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
            Loss value (torch.Tensor)
        """
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

        Args:
            train_loader: DataLoader for training data
            val_loader: DataLoader for validation data
            test_loader: Optional DataLoader for test data (required for stage2)

        Returns:
            For stage1: numpy array of denoised patches for mask extraction
            For stage2: None
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

        # Note: Training start is already signaled via 'starting' status events
        # in training.py before this method is called. No need to emit epoch 0 here
        # as it provides misleading trainLoss=0/valLoss=0 data.

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
            # Skip for 2.5D when model output channels != input channels:
            # - Stage 2: always 3->1 (mismatch)
            # - Stage 1 with run_stage2=False (N2V): 3->1 (mismatch)
            # - Stage 1 with run_stage2=True: 3->3 (OK)
            mode = self.hparams.get('mode', '2d')
            run_stage2 = self.hparams.get('run_stage2', False)
            skip_test_images = (mode == '2.5d' and (self.stage == 'stage2' or not run_stage2))
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

        # Build training results dictionary
        training_results = {
            'final_train_loss': float(train_loss),
            'final_val_loss': float(val_loss),
            'best_val_loss': float(best_val_loss),
            'epochs_completed': epoch + 1,
            'total_epochs': num_epochs,
            'early_stopped': early_stopping.counter >= patience if hasattr(early_stopping, 'counter') else False,
            'training_time_seconds': elapsed,
            'train_loss_history': [float(x) for x in train_loss_history],
            'val_loss_history': [float(x) for x in val_loss_history]
        }

        # For stage1, we need to generate denoised patches for mask extraction
        if self.stage == 'stage1':
            print("Generating denoised patches for potential mask extraction...")
            denoised_patches = self._generate_denoised_patches(train_loader)
            return denoised_patches, training_results

        return None, training_results

    def _generate_denoised_patches(self, train_loader):
        """
        Generate denoised patches using the trained model.

        Args:
            train_loader: DataLoader containing training patches

        Returns:
            numpy.ndarray: Array of denoised patches
        """
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
