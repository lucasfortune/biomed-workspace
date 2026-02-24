#!/usr/bin/env python3
"""
Adapted Training Script for Web Interface
Includes real-time progress reporting via stdout

Supports two modes:
- Standard 2D: single-head UNet with CrossEntropyLoss (existing behaviour)
- Direction-aware 2.5D: dual-head UNet25D with combined seg + direction loss
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
import os
import sys
import json
import argparse
from pathlib import Path
import tifffile
import random
import time
from datetime import datetime

# Shared model definitions
from models.unet import UNet, UNet25D


# =============================================================================
# Loss functions for direction-aware training
# =============================================================================

class OrientationWeightedCELoss(nn.Module):
    """
    Cross-entropy with per-voxel weight w = 1 + alpha * (1 - |dz|)
    for filament voxels.  When alpha=0, identical to standard CE.
    """

    def __init__(self, alpha=1.0, filament_classes=None):
        super().__init__()
        self.alpha = alpha
        self.filament_classes = filament_classes or [2]

    def forward(self, seg_logits, target_classes, directions=None):
        """
        Args:
            seg_logits: (B, C, H, W) raw logits
            target_classes: (B, H, W) integer class labels
            directions: (B, 3, H, W) unit direction vectors (optional)
        """
        if directions is None or self.alpha == 0:
            return F.cross_entropy(seg_logits, target_classes)

        # Build filament mask (B, H, W)
        filament_mask = torch.zeros_like(target_classes, dtype=torch.bool)
        for c in self.filament_classes:
            filament_mask |= (target_classes == c)

        # |dz| component is channel 2 (z-component)
        abs_dz = directions[:, 2, :, :].abs()  # (B, H, W)

        # Weight: 1 + alpha * (1 - |dz|) for filament voxels, 1 elsewhere
        weight = torch.ones_like(target_classes, dtype=torch.float32)
        weight[filament_mask] = 1.0 + self.alpha * (1.0 - abs_dz[filament_mask])

        return F.cross_entropy(seg_logits, target_classes, reduction='none').mul(weight).mean()


class SignInvariantDirectionLoss(nn.Module):
    """
    1 - |v_pred . v_gt|, masked to filament voxels.
    Returns 0 when no filament voxels in batch.
    """

    def __init__(self, filament_classes=None):
        super().__init__()
        self.filament_classes = filament_classes or [2]

    def forward(self, dir_pred, dir_gt, target_classes):
        """
        Args:
            dir_pred: (B, 3, H, W) predicted unit directions
            dir_gt:   (B, 3, H, W) ground-truth unit directions
            target_classes: (B, H, W) integer class labels
        """
        # Build filament mask
        filament_mask = torch.zeros_like(target_classes, dtype=torch.bool)
        for c in self.filament_classes:
            filament_mask |= (target_classes == c)

        if not filament_mask.any():
            return torch.tensor(0.0, device=dir_pred.device, requires_grad=True)

        # Dot product along channel dim → (B, H, W)
        dot = (dir_pred * dir_gt).sum(dim=1)

        # Loss: 1 - |dot| for filament voxels
        loss = 1.0 - dot[filament_mask].abs()
        return loss.mean()


class CombinedDirectionAwareLoss(nn.Module):
    """
    L_seg + lambda_dir * L_dir.
    Returns (total, seg_loss, dir_loss) tuple for separate tracking.
    """

    def __init__(self, alpha=1.0, lambda_dir=0.3, filament_classes=None):
        super().__init__()
        self.seg_loss_fn = OrientationWeightedCELoss(alpha=alpha, filament_classes=filament_classes)
        self.dir_loss_fn = SignInvariantDirectionLoss(filament_classes=filament_classes)
        self.lambda_dir = lambda_dir

    def forward(self, seg_logits, dir_pred, target_classes, dir_gt):
        seg_loss = self.seg_loss_fn(seg_logits, target_classes, dir_gt)
        dir_loss = self.dir_loss_fn(dir_pred, dir_gt, target_classes)
        total = seg_loss + self.lambda_dir * dir_loss
        return total, seg_loss, dir_loss


# =============================================================================
# Datasets
# =============================================================================

class Imagedataset(Dataset):
    def __init__(self, image_dir, mask_dir, transform=None, patch_size=None,
                 patches_per_image=None, augment=False, augment_prob=0.5, num_classes=3):
        """
        Args:
            image_dir (str): Directory with all the images
            mask_dir (str): Directory with all the masks
            transform (callable, optional): Optional transform to be applied
            patch_size (int, optional): Size of patches to extract
            patches_per_image (int, optional): Number of patches per image
            augment (bool): Whether to apply augmentations
            augment_prob (float): Probability of applying each augmentation
            num_classes (int): Number of segmentation classes
        """
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.transform = transform
        self.patch_size = patch_size
        self.patches_per_image = patches_per_image
        self.augment = augment
        self.augment_prob = augment_prob
        self.num_classes = num_classes
        self.images = [f for f in os.listdir(image_dir) if f.endswith('.tif')]

        # Validate patch parameters
        if (patch_size is None) != (patches_per_image is None):
            raise ValueError("Both patch_size and patches_per_image must be provided for patch mode")

    def __len__(self):
        if self.patches_per_image:
            return len(self.images) * self.patches_per_image
        return len(self.images)

    def apply_augmentations(self, image, mask):
        """Apply random augmentations to both image and mask."""
        # Convert to PIL images for easier transformation
        image_pil = Image.fromarray(image)
        mask_pil = Image.fromarray(mask)

        # Random horizontal flip
        if self.augment and random.random() < self.augment_prob:
            image_pil = image_pil.transpose(Image.FLIP_LEFT_RIGHT)
            mask_pil = mask_pil.transpose(Image.FLIP_LEFT_RIGHT)

        # Random vertical flip
        if self.augment and random.random() < self.augment_prob:
            image_pil = image_pil.transpose(Image.FLIP_TOP_BOTTOM)
            mask_pil = mask_pil.transpose(Image.FLIP_TOP_BOTTOM)

        # Random 90-degree rotation
        if self.augment and random.random() < self.augment_prob:
            # Randomly choose between 90, 180, or 270 degrees
            rot_choice = random.choice([Image.ROTATE_90, Image.ROTATE_180, Image.ROTATE_270])
            image_pil = image_pil.transpose(rot_choice)
            mask_pil = mask_pil.transpose(rot_choice)

        # Convert back to numpy arrays
        return np.array(image_pil), np.array(mask_pil)

    def extract_random_patch(self, image, mask):
        """Extract a random patch from the image and mask"""
        height, width = image.shape

        if self.patch_size > min(height, width):
            raise ValueError(f"Patch size {self.patch_size} is larger than image dimensions {height}x{width}")

        max_h = height - self.patch_size
        max_w = width - self.patch_size

        top = random.randint(0, max_h)
        left = random.randint(0, max_w)

        image_patch = image[top:top+self.patch_size, left:left+self.patch_size]
        mask_patch = mask[top:top+self.patch_size, left:left+self.patch_size]

        return image_patch, mask_patch

    def __getitem__(self, idx):
        # Calculate which image to use and which patch from that image
        if self.patches_per_image:
            image_idx = idx // self.patches_per_image
            patch_idx = idx % self.patches_per_image
        else:
            image_idx = idx

        # Load image and mask
        img_path = os.path.join(self.image_dir, self.images[image_idx])
        mask_path = os.path.join(self.mask_dir, self.images[image_idx].replace('.tif', '_mask.tif'))

        # Read images using tifffile for better TIFF support
        image = tifffile.imread(img_path)
        mask = tifffile.imread(mask_path)

        # Normalize image to [0, 1]
        image_array = image.astype(np.float32) / image.max()
        mask_array = mask.astype(np.uint8)

        # Extract patch if in patch mode
        if self.patch_size:
            image_array, mask_array = self.extract_random_patch(image_array, mask_array)

        # Apply augmentations
        image_array, mask_array = self.apply_augmentations(image_array, mask_array)

        # Apply transforms if specified
        if self.transform:
            # Add channel dimension for grayscale image
            image_array = np.expand_dims(image_array, axis=0)
            image_tensor = torch.from_numpy(image_array)

            # Convert mask to one-hot encoding
            mask_tensor = torch.from_numpy(mask_array).long()
            mask_onehot = torch.nn.functional.one_hot(mask_tensor, num_classes=self.num_classes)
            mask_onehot = mask_onehot.permute(2, 0, 1).float()

            return image_tensor, mask_onehot

        return image_array, mask_array


class Imagedataset25D(Dataset):
    """
    2.5D dataset that operates directly on TIFF stacks.

    Returns multi-slice context windows with optional direction volumes.
    Direction-aware augmentation correctly transforms direction vectors.
    """

    def __init__(self, raw_stack, mask_stack, direction_volume=None,
                 patch_size=128, patches_per_slice=10, context_slices=3,
                 augment=False, augment_prob=0.5, num_classes=3):
        """
        Args:
            raw_stack: (Z, H, W) raw image stack
            mask_stack: (Z, H, W) annotation stack (uint8 class labels)
            direction_volume: (Z, H, W, 3) unit direction vectors or None
            patch_size: spatial patch size
            patches_per_slice: patches sampled per valid center slice
            context_slices: odd number of context slices (3, 5, or 7)
            augment: whether to apply augmentation
            augment_prob: probability per augmentation type
            num_classes: number of segmentation classes
        """
        assert context_slices % 2 == 1, "context_slices must be odd"
        self.raw = raw_stack.astype(np.float32)
        self.mask = mask_stack.astype(np.uint8)
        self.direction = direction_volume  # (Z,H,W,3) or None
        self.patch_size = patch_size
        self.patches_per_slice = patches_per_slice
        self.context_slices = context_slices
        self.half = context_slices // 2
        self.augment = augment
        self.augment_prob = augment_prob
        self.num_classes = num_classes

        Z, H, W = self.raw.shape
        self.Z, self.H, self.W = Z, H, W

        # Global normalization to [0, 1]
        rmin, rmax = self.raw.min(), self.raw.max()
        if rmax > rmin:
            self.raw = (self.raw - rmin) / (rmax - rmin)
        else:
            self.raw = np.zeros_like(self.raw)

        # Valid center slice indices: [half, Z - half)
        self.valid_centers = list(range(self.half, Z - self.half))
        if len(self.valid_centers) == 0:
            raise ValueError(
                f"Stack too shallow ({Z} slices) for context_slices={context_slices}"
            )

    def __len__(self):
        return len(self.valid_centers) * self.patches_per_slice

    def __getitem__(self, idx):
        slice_idx = idx // self.patches_per_slice
        center_z = self.valid_centers[slice_idx]

        ps = self.patch_size
        max_y = self.H - ps
        max_x = self.W - ps
        if max_y < 0 or max_x < 0:
            raise ValueError(
                f"patch_size {ps} larger than image {self.H}x{self.W}"
            )

        top = random.randint(0, max_y)
        left = random.randint(0, max_x)

        # Extract multi-slice context window → (context_slices, pH, pW)
        z_start = center_z - self.half
        z_end = center_z + self.half + 1
        image_patch = self.raw[z_start:z_end, top:top+ps, left:left+ps].copy()

        # Mask is from center slice only → (pH, pW)
        mask_patch = self.mask[center_z, top:top+ps, left:left+ps].copy()

        # Direction patch from center slice → (pH, pW, 3) or zeros
        if self.direction is not None:
            dir_patch = self.direction[center_z, top:top+ps, left:left+ps].copy()
        else:
            dir_patch = np.zeros((ps, ps, 3), dtype=np.float32)

        # Augmentation
        if self.augment:
            image_patch, mask_patch, dir_patch = self._augment(
                image_patch, mask_patch, dir_patch
            )

        # Convert to tensors
        image_tensor = torch.from_numpy(image_patch)  # (C, H, W) where C=context_slices
        mask_tensor = torch.from_numpy(mask_patch).long()
        mask_onehot = F.one_hot(mask_tensor, num_classes=self.num_classes)
        mask_onehot = mask_onehot.permute(2, 0, 1).float()  # (num_classes, H, W)

        # Direction: (H, W, 3) → (3, H, W)
        dir_tensor = torch.from_numpy(dir_patch.transpose(2, 0, 1).astype(np.float32))

        if self.direction is not None:
            return image_tensor, mask_onehot, dir_tensor
        else:
            return image_tensor, mask_onehot

    def _augment(self, image, mask, direction):
        """
        Apply augmentations to multi-slice image, mask, and direction vectors.
        image: (C, H, W), mask: (H, W), direction: (H, W, 3) with (dx, dy, dz)

        Direction vector transform rules:
            H-flip:  negate dx
            V-flip:  negate dy
            90° CCW: (dx, dy) → (-dy, dx)
            180°:    (dx, dy) → (-dx, -dy)
            270° CW: (dx, dy) → (dy, -dx)
        dz is never affected by spatial transforms.
        After any transform, re-apply sign convention (dz >= 0).
        """
        applied = False

        # Random horizontal flip
        if random.random() < self.augment_prob:
            image = image[:, :, ::-1].copy()
            mask = mask[:, ::-1].copy()
            direction = direction[:, ::-1, :].copy()
            direction[:, :, 0] *= -1  # negate dx
            applied = True

        # Random vertical flip
        if random.random() < self.augment_prob:
            image = image[:, ::-1, :].copy()
            mask = mask[::-1, :].copy()
            direction = direction[::-1, :, :].copy()
            direction[:, :, 1] *= -1  # negate dy
            applied = True

        # Random 90-degree rotation
        if random.random() < self.augment_prob:
            rot_choice = random.choice([1, 2, 3])  # 90, 180, 270

            # Rotate spatial dims for image (C, H, W) → rotate axes (1, 2)
            image = np.rot90(image, k=rot_choice, axes=(1, 2)).copy()
            mask = np.rot90(mask, k=rot_choice, axes=(0, 1)).copy()
            direction = np.rot90(direction, k=rot_choice, axes=(0, 1)).copy()

            dx = direction[:, :, 0].copy()
            dy = direction[:, :, 1].copy()

            if rot_choice == 1:    # 90° CCW
                direction[:, :, 0] = -dy
                direction[:, :, 1] = dx
            elif rot_choice == 2:  # 180°
                direction[:, :, 0] = -dx
                direction[:, :, 1] = -dy
            elif rot_choice == 3:  # 270° CW
                direction[:, :, 0] = dy
                direction[:, :, 1] = -dx
            applied = True

        # Re-apply sign convention: dz >= 0
        if applied:
            neg_dz = direction[:, :, 2] < 0
            direction[neg_dz] *= -1

        return image, mask, direction


# =============================================================================
# Utility functions
# =============================================================================

def calculate_dice_score(pred, target, num_classes=3):
    """Calculate Dice score for segmentation quality."""
    pred = torch.softmax(pred, dim=1)
    pred = pred.argmax(dim=1)
    target = target.argmax(dim=1)

    dice_scores = []
    # Skip background class (0), calculate for foreground classes only
    for class_idx in range(1, num_classes):
        pred_class = (pred == class_idx)
        target_class = (target == class_idx)

        intersection = (pred_class & target_class).float().sum()
        union = pred_class.float().sum() + target_class.float().sum()

        dice = (2. * intersection + 1e-6) / (union + 1e-6)
        dice_scores.append(dice.item())

    return np.mean(dice_scores) if dice_scores else 0.0

def send_progress(epoch, total_epochs, train_loss, train_dice, val_loss, val_dice,
                  training_id, extra_metrics=None):
    """Send progress update to Node.js via stdout"""
    progress_data = {
        "epoch": epoch,
        "total_epochs": total_epochs,
        "metrics": {
            "train_loss": train_loss,
            "train_dice": train_dice,
            "val_loss": val_loss,
            "val_dice": val_dice
        },
        "training_id": training_id
    }
    if extra_metrics:
        progress_data["metrics"].update(extra_metrics)

    # Send as JSON with PROGRESS: prefix for easy parsing
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)


# =============================================================================
# Data preparation
# =============================================================================

def prepare_data_from_tiff_stacks(raw_images_path, annotations_path, output_dir, config):
    """Extract individual images from TIFF stacks and organize them (2D pipeline)"""

    # Read TIFF stacks
    raw_stack = tifffile.imread(raw_images_path)
    annotation_stack = tifffile.imread(annotations_path)

    # Use /tmp directory for temporary split images (not in output_dir)
    import tempfile
    temp_dir = tempfile.mkdtemp(prefix='training_data_')

    # Create directories in temp location
    train_imgs_dir = os.path.join(temp_dir, 'train_images')
    train_masks_dir = os.path.join(temp_dir, 'train_masks')
    val_imgs_dir = os.path.join(temp_dir, 'val_images')
    val_masks_dir = os.path.join(temp_dir, 'val_masks')
    test_imgs_dir = os.path.join(temp_dir, 'test_images')
    test_masks_dir = os.path.join(temp_dir, 'test_masks')

    for dir_path in [train_imgs_dir, train_masks_dir, val_imgs_dir, val_masks_dir, test_imgs_dir, test_masks_dir]:
        os.makedirs(dir_path, exist_ok=True)

    # Split data (70% train, 15% val, 15% test)
    num_images = raw_stack.shape[0]
    train_split = int(0.7 * num_images)
    val_split = int(0.85 * num_images)

    # Save individual images
    for i in range(num_images):
        img_name = f"image_{i:04d}.tif"
        mask_name = f"image_{i:04d}_mask.tif"

        if i < train_split:
            tifffile.imwrite(os.path.join(train_imgs_dir, img_name), raw_stack[i])
            tifffile.imwrite(os.path.join(train_masks_dir, mask_name), annotation_stack[i])
        elif i < val_split:
            tifffile.imwrite(os.path.join(val_imgs_dir, img_name), raw_stack[i])
            tifffile.imwrite(os.path.join(val_masks_dir, mask_name), annotation_stack[i])
        else:
            tifffile.imwrite(os.path.join(test_imgs_dir, img_name), raw_stack[i])
            tifffile.imwrite(os.path.join(test_masks_dir, mask_name), annotation_stack[i])

    return {
        'train_imgs_dir': train_imgs_dir,
        'train_masks_dir': train_masks_dir,
        'val_imgs_dir': val_imgs_dir,
        'val_masks_dir': val_masks_dir,
        'test_imgs_dir': test_imgs_dir,
        'test_masks_dir': test_masks_dir,
        'temp_dir': temp_dir  # Return temp dir for cleanup
    }


def prepare_data_25d(raw_path, ann_path, dir_vol_path=None):
    """
    Load TIFF stacks and split by z-index (70/15/15) for the 2.5D pipeline.
    Returns dict of numpy arrays — no temp files needed.
    """
    raw_stack = tifffile.imread(raw_path)       # (Z, H, W)
    ann_stack = tifffile.imread(ann_path)        # (Z, H, W)

    dir_vol = None
    if dir_vol_path and os.path.exists(dir_vol_path):
        dir_vol = tifffile.imread(dir_vol_path).astype(np.float32)  # (Z, H, W, 3)
        # Handle 4D volume: could be (Z, Y, X, 3) or (3, Z, Y, X)
        if dir_vol.ndim == 4 and dir_vol.shape[0] == 3:
            dir_vol = np.moveaxis(dir_vol, 0, -1)  # (3,Z,Y,X) → (Z,Y,X,3)
        print(f"Direction volume loaded: {dir_vol.shape}", flush=True)

    Z = raw_stack.shape[0]
    train_end = int(0.7 * Z)
    val_end = int(0.85 * Z)

    splits = {}
    for name, s, e in [('train', 0, train_end), ('val', train_end, val_end), ('test', val_end, Z)]:
        splits[f'{name}_raw'] = raw_stack[s:e]
        splits[f'{name}_mask'] = ann_stack[s:e]
        if dir_vol is not None:
            splits[f'{name}_dir'] = dir_vol[s:e]
        else:
            splits[f'{name}_dir'] = None

    return splits


# =============================================================================
# Training loops
# =============================================================================

def train_model_with_progress(model, train_loader, val_loader, test_loader,
                             criterion, optimizer, num_epochs, device,
                             save_dir, training_id, config,
                             direction_aware=False):
    """
    Train the model with real-time progress reporting.
    Supports both standard 2D and direction-aware 2.5D modes.
    """

    # Initialize best validation metrics
    best_val_loss = float('inf')
    best_val_dice = 0.0

    # Determine context_slices for checkpoint metadata
    if direction_aware:
        context_slices = config.get('context_slices', 3)
    else:
        # Check if this is standard 2.5D (multi-slice without direction)
        cs = config.get('context_slices', None)
        context_slices = cs if (cs is not None and cs > 1) else 1

    # Training loop
    for epoch in range(num_epochs):
        print(f'\nEpoch {epoch+1}/{num_epochs}', flush=True)

        # Training phase
        model.train()
        train_loss = 0.0
        train_dice = 0.0
        train_seg_loss = 0.0
        train_dir_loss = 0.0

        for batch in train_loader:
            if direction_aware:
                inputs, masks, directions = batch
                directions = directions.to(device)
            else:
                inputs, masks = batch
                directions = None

            inputs = inputs.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()

            if direction_aware:
                seg_logits, dir_pred = model(inputs)
                total, s_loss, d_loss = criterion(
                    seg_logits, dir_pred, masks.argmax(dim=1), directions
                )
                loss = total
                train_seg_loss += s_loss.item()
                train_dir_loss += d_loss.item()
                outputs = seg_logits
            else:
                outputs = model(inputs)
                loss = criterion(outputs, masks.argmax(dim=1))

            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            train_dice += calculate_dice_score(outputs, masks, config.get('num_classes', 3))

        # Calculate epoch metrics
        n_train = len(train_loader)
        epoch_train_loss = train_loss / n_train
        epoch_train_dice = train_dice / n_train

        # Validation phase
        model.eval()
        val_loss = 0.0
        val_dice = 0.0
        val_seg_loss = 0.0
        val_dir_loss = 0.0

        with torch.no_grad():
            for batch in val_loader:
                if direction_aware:
                    inputs, masks, directions = batch
                    directions = directions.to(device)
                else:
                    inputs, masks = batch
                    directions = None

                inputs = inputs.to(device)
                masks = masks.to(device)

                if direction_aware:
                    seg_logits, dir_pred = model(inputs)
                    total, s_loss, d_loss = criterion(
                        seg_logits, dir_pred, masks.argmax(dim=1), directions
                    )
                    loss = total
                    val_seg_loss += s_loss.item()
                    val_dir_loss += d_loss.item()
                    outputs = seg_logits
                else:
                    outputs = model(inputs)
                    loss = criterion(outputs, masks.argmax(dim=1))

                val_loss += loss.item()
                val_dice += calculate_dice_score(outputs, masks, config.get('num_classes', 3))

        n_val = len(val_loader)
        epoch_val_loss = val_loss / n_val
        epoch_val_dice = val_dice / n_val

        # Build extra metrics for direction-aware mode
        extra = None
        if direction_aware:
            extra = {
                'train_seg_loss': train_seg_loss / n_train,
                'train_dir_loss': train_dir_loss / n_train,
                'val_seg_loss': val_seg_loss / n_val,
                'val_dir_loss': val_dir_loss / n_val,
            }

        # Send progress update to web interface
        send_progress(epoch + 1, num_epochs, epoch_train_loss, epoch_train_dice,
                     epoch_val_loss, epoch_val_dice, training_id, extra)

        # Save best model (based on val_dice — segmentation quality is primary metric)
        if epoch_val_dice > best_val_dice:
            best_val_dice = epoch_val_dice
            model_save_path = os.path.join(save_dir, 'best_model.pth')

            model_config = {
                'features': config['features'],
                'num_layers': config['num_layers'],
                'in_channels': context_slices if (direction_aware or context_slices > 1) else 1,
                'num_classes': config.get('num_classes', 3),
            }
            if direction_aware:
                model_config['model_type'] = 'direction_aware'
                model_config['has_direction_head'] = True
                model_config['context_slices'] = context_slices
            elif context_slices > 1:
                model_config['model_type'] = 'standard_25d'
                model_config['has_direction_head'] = False
                model_config['context_slices'] = context_slices

            model_save_dict = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_dice': epoch_val_dice,
                'model_config': model_config,
                'training_config': config,
                'pytorch_version': torch.__version__
            }

            torch.save(model_save_dict, model_save_path, _use_new_zipfile_serialization=False)
            print(f"Best model saved with validation Dice: {epoch_val_dice:.4f}", flush=True)

    # Final testing phase
    model.eval()
    test_loss = 0.0
    test_dice = 0.0

    with torch.no_grad():
        for batch in test_loader:
            if direction_aware:
                inputs, masks, directions = batch
                directions = directions.to(device)
            else:
                inputs, masks = batch
                directions = None

            inputs = inputs.to(device)
            masks = masks.to(device)

            if direction_aware:
                seg_logits, dir_pred = model(inputs)
                total, _, _ = criterion(
                    seg_logits, dir_pred, masks.argmax(dim=1), directions
                )
                loss = total
                outputs = seg_logits
            else:
                outputs = model(inputs)
                loss = criterion(outputs, masks.argmax(dim=1))

            test_loss += loss.item()
            test_dice += calculate_dice_score(outputs, masks, config.get('num_classes', 3))

    final_test_loss = test_loss / len(test_loader)
    final_test_dice = test_dice / len(test_loader)

    # Save final results
    results = {
        'test_loss': final_test_loss,
        'test_dice': final_test_dice,
        'best_val_dice': best_val_dice
    }

    with open(os.path.join(save_dir, 'results.json'), 'w') as f:
        json.dump(results, f, indent=2)

    print(f"Training completed. Test Dice: {final_test_dice:.4f}", flush=True)
    return results


# =============================================================================
# Main entry point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='Train UNet model for biomedical segmentation')
    parser.add_argument('--config', type=str, required=True, help='JSON configuration string')
    parser.add_argument('--raw_images', type=str, required=True, help='Path to raw images TIFF stack')
    parser.add_argument('--annotations', type=str, required=True, help='Path to annotations TIFF stack')
    parser.add_argument('--output_dir', type=str, required=True, help='Output directory')
    parser.add_argument('--training_id', type=str, required=True, help='Training session ID')
    parser.add_argument('--direction_volume', type=str, default=None,
                        help='Path to direction volume TIFF (enables 2.5D mode)')
    parser.add_argument('--context_slices', type=int, default=None,
                        help='Context slices for 2.5D mode (3, 5, or 7). Enables 2.5D even without direction volume.')

    args = parser.parse_args()

    # Parse configuration
    config = json.loads(args.config)

    # Debug: Print configuration
    print("Training configuration:", flush=True)
    for key, value in config.items():
        print(f"  {key}: {value}", flush=True)

    # Validate required parameters
    required_params = ['patch_size', 'patches_per_image', 'batch_size', 'features', 'num_layers', 'learning_rate', 'num_epochs']
    for param in required_params:
        if param not in config:
            print(f"Error: Missing required parameter: {param}", file=sys.stderr, flush=True)
            sys.exit(1)

    # Determine mode
    direction_aware = (args.direction_volume is not None
                       and os.path.exists(args.direction_volume))
    if args.direction_volume and not os.path.exists(args.direction_volume):
        print(f"Warning: direction_volume path does not exist: {args.direction_volume}", flush=True)
        print("Falling back to standard 2D training", flush=True)

    # Determine context_slices from CLI arg or config
    cli_context = args.context_slices
    config_context = config.get('context_slices', None)
    context_slices = cli_context or config_context

    # 2.5D mode: either direction-aware or standalone multi-slice
    mode_25d = direction_aware or (context_slices is not None and context_slices > 1)

    if not mode_25d:
        context_slices = 1  # 2D mode
    elif context_slices is None:
        context_slices = 3  # default for 2.5D

    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}", flush=True)
    if direction_aware:
        print(f"Training mode: 2.5D direction-aware (context={context_slices})", flush=True)
    elif mode_25d:
        print(f"Training mode: 2.5D standard (context={context_slices}, no direction head)", flush=True)
    else:
        print(f"Training mode: standard 2D", flush=True)

    try:
        num_classes = config.get('num_classes', 3)
        print(f"Using {num_classes} classes for segmentation", flush=True)

        if direction_aware:
            # ===== 2.5D direction-aware path =====
            context_slices = config.get('context_slices', 3)
            alpha = config.get('alpha', 1.0)
            lambda_dir = config.get('lambda_dir', 0.3)
            filament_classes = config.get('filament_classes', [2])

            print(f"Direction-aware params: context_slices={context_slices}, "
                  f"alpha={alpha}, lambda_dir={lambda_dir}, "
                  f"filament_classes={filament_classes}", flush=True)

            # Prepare data from stacks (no temp files)
            print("Preparing 2.5D data from TIFF stacks...", flush=True)
            splits = prepare_data_25d(
                args.raw_images, args.annotations, args.direction_volume
            )

            # Create datasets
            print("Creating 2.5D datasets...", flush=True)
            train_dataset = Imagedataset25D(
                raw_stack=splits['train_raw'],
                mask_stack=splits['train_mask'],
                direction_volume=splits['train_dir'],
                patch_size=config['patch_size'],
                patches_per_slice=config['patches_per_image'],
                context_slices=context_slices,
                augment=config.get('augment', False),
                augment_prob=0.5,
                num_classes=num_classes,
            )
            val_dataset = Imagedataset25D(
                raw_stack=splits['val_raw'],
                mask_stack=splits['val_mask'],
                direction_volume=splits['val_dir'],
                patch_size=config['patch_size'],
                patches_per_slice=max(1, config.get('patches_per_image', 10) // 2),
                context_slices=context_slices,
                augment=False,
                num_classes=num_classes,
            )
            test_dataset = Imagedataset25D(
                raw_stack=splits['test_raw'],
                mask_stack=splits['test_mask'],
                direction_volume=splits['test_dir'],
                patch_size=config['patch_size'],
                patches_per_slice=max(1, config.get('patches_per_image', 10) // 3),
                context_slices=context_slices,
                augment=False,
                num_classes=num_classes,
            )

            # Data loaders
            train_loader = DataLoader(train_dataset, batch_size=config['batch_size'],
                                      shuffle=True, num_workers=2)
            val_loader = DataLoader(val_dataset, batch_size=config['batch_size'],
                                    shuffle=False, num_workers=2)
            test_loader = DataLoader(test_dataset, batch_size=config.get('test_batch_size', 3),
                                     shuffle=False, num_workers=2)

            # Create model
            print("Creating UNet25D model...", flush=True)
            model = UNet25D(
                features=config['features'],
                num_layers=config['num_layers'],
                in_channels=context_slices,
                num_classes=num_classes,
                has_direction_head=True,
            ).to(device)

            # Loss & optimizer
            criterion = CombinedDirectionAwareLoss(
                alpha=alpha, lambda_dir=lambda_dir, filament_classes=filament_classes
            )
            optimizer = optim.Adam(model.parameters(), lr=config['learning_rate'])

            # Save config
            with open(os.path.join(args.output_dir, 'config.json'), 'w') as f:
                json.dump(config, f, indent=2)

            # Train
            print("Starting 2.5D direction-aware training...", flush=True)
            results = train_model_with_progress(
                model=model,
                train_loader=train_loader,
                val_loader=val_loader,
                test_loader=test_loader,
                criterion=criterion,
                optimizer=optimizer,
                num_epochs=config['num_epochs'],
                device=device,
                save_dir=args.output_dir,
                training_id=args.training_id,
                config=config,
                direction_aware=True,
            )

        elif mode_25d and not direction_aware:
            # ===== 2.5D standard path (multi-slice context, no direction head) =====
            print(f"Standard 2.5D params: context_slices={context_slices}", flush=True)

            # Prepare data from stacks (no temp files, no direction volume)
            print("Preparing 2.5D data from TIFF stacks...", flush=True)
            splits = prepare_data_25d(
                args.raw_images, args.annotations, dir_vol_path=None
            )

            # Create datasets (direction_volume=None → returns 2-tuple)
            print("Creating 2.5D datasets...", flush=True)
            train_dataset = Imagedataset25D(
                raw_stack=splits['train_raw'],
                mask_stack=splits['train_mask'],
                direction_volume=None,
                patch_size=config['patch_size'],
                patches_per_slice=config['patches_per_image'],
                context_slices=context_slices,
                augment=config.get('augment', False),
                augment_prob=0.5,
                num_classes=num_classes,
            )
            val_dataset = Imagedataset25D(
                raw_stack=splits['val_raw'],
                mask_stack=splits['val_mask'],
                direction_volume=None,
                patch_size=config['patch_size'],
                patches_per_slice=max(1, config.get('patches_per_image', 10) // 2),
                context_slices=context_slices,
                augment=False,
                num_classes=num_classes,
            )
            test_dataset = Imagedataset25D(
                raw_stack=splits['test_raw'],
                mask_stack=splits['test_mask'],
                direction_volume=None,
                patch_size=config['patch_size'],
                patches_per_slice=max(1, config.get('patches_per_image', 10) // 3),
                context_slices=context_slices,
                augment=False,
                num_classes=num_classes,
            )

            # Data loaders
            train_loader = DataLoader(train_dataset, batch_size=config['batch_size'],
                                      shuffle=True, num_workers=2)
            val_loader = DataLoader(val_dataset, batch_size=config['batch_size'],
                                    shuffle=False, num_workers=2)
            test_loader = DataLoader(test_dataset, batch_size=config.get('test_batch_size', 3),
                                     shuffle=False, num_workers=2)

            # Create model (no direction head)
            print("Creating UNet25D model (no direction head)...", flush=True)
            model = UNet25D(
                features=config['features'],
                num_layers=config['num_layers'],
                in_channels=context_slices,
                num_classes=num_classes,
                has_direction_head=False,
            ).to(device)

            # Standard CE loss (no direction loss)
            criterion = nn.CrossEntropyLoss()
            optimizer = optim.Adam(model.parameters(), lr=config['learning_rate'])

            # Save config
            with open(os.path.join(args.output_dir, 'config.json'), 'w') as f:
                json.dump(config, f, indent=2)

            # Train (direction_aware=False so training loop unpacks 2-tuple)
            print("Starting 2.5D standard training...", flush=True)
            results = train_model_with_progress(
                model=model,
                train_loader=train_loader,
                val_loader=val_loader,
                test_loader=test_loader,
                criterion=criterion,
                optimizer=optimizer,
                num_epochs=config['num_epochs'],
                device=device,
                save_dir=args.output_dir,
                training_id=args.training_id,
                config=config,
                direction_aware=False,
            )

        else:
            # ===== Standard 2D path (unchanged) =====
            print("Preparing data from TIFF stacks...", flush=True)
            data_dirs = prepare_data_from_tiff_stacks(
                args.raw_images, args.annotations, args.output_dir, config
            )

            print("Creating datasets...", flush=True)

            train_dataset = Imagedataset(
                image_dir=data_dirs['train_imgs_dir'],
                mask_dir=data_dirs['train_masks_dir'],
                transform=True,
                patch_size=config['patch_size'],
                patches_per_image=config['patches_per_image'],
                augment=config.get('augment', False),
                num_classes=num_classes
            )

            val_dataset = Imagedataset(
                image_dir=data_dirs['val_imgs_dir'],
                mask_dir=data_dirs['val_masks_dir'],
                transform=True,
                patch_size=config['patch_size'],
                patches_per_image=max(1, config.get('patches_per_image', 10) // 2),
                augment=False,
                num_classes=num_classes
            )

            test_dataset = Imagedataset(
                image_dir=data_dirs['test_imgs_dir'],
                mask_dir=data_dirs['test_masks_dir'],
                transform=True,
                patch_size=config['patch_size'],
                patches_per_image=max(1, config.get('patches_per_image', 10) // 3),
                augment=False,
                num_classes=num_classes
            )

            # Create data loaders
            train_loader = DataLoader(train_dataset, batch_size=config['batch_size'], shuffle=True, num_workers=2)
            val_loader = DataLoader(val_dataset, batch_size=config['batch_size'], shuffle=False, num_workers=2)
            test_loader = DataLoader(test_dataset, batch_size=config.get('test_batch_size', 3), shuffle=False, num_workers=2)

            # Create model
            print("Creating model...", flush=True)
            model = UNet(
                features=config['features'],
                num_layers=config['num_layers'],
                in_channels=1,
                num_classes=num_classes
            ).to(device)

            # Define loss function and optimizer
            criterion = nn.CrossEntropyLoss()
            optimizer = optim.Adam(model.parameters(), lr=config['learning_rate'])

            # Save configuration
            with open(os.path.join(args.output_dir, 'config.json'), 'w') as f:
                json.dump(config, f, indent=2)

            # Train model
            print("Starting training...", flush=True)
            results = train_model_with_progress(
                model=model,
                train_loader=train_loader,
                val_loader=val_loader,
                test_loader=test_loader,
                criterion=criterion,
                optimizer=optimizer,
                num_epochs=config['num_epochs'],
                device=device,
                save_dir=args.output_dir,
                training_id=args.training_id,
                config=config
            )

            # Cleanup temporary directory
            print("Cleaning up temporary files...", flush=True)
            import shutil
            if 'temp_dir' in data_dirs:
                try:
                    shutil.rmtree(data_dirs['temp_dir'])
                    print(f"Removed temporary directory: {data_dirs['temp_dir']}", flush=True)
                except Exception as cleanup_error:
                    print(f"Warning: Could not remove temporary directory: {cleanup_error}", flush=True)

        print("Training completed successfully!", flush=True)

    except Exception as e:
        print(f"Error during training: {str(e)}", file=sys.stderr, flush=True)
        # Try to cleanup temp directory even on error
        try:
            import shutil
            if 'data_dirs' in locals() and 'temp_dir' in data_dirs:
                shutil.rmtree(data_dirs['temp_dir'])
        except Exception as cleanup_error:
            # Silently ignore cleanup errors, already in error state
            print(f"Cleanup warning: {cleanup_error}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
