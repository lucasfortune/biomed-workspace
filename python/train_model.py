#!/usr/bin/env python3
"""
Adapted Training Script for Web Interface
Includes real-time progress reporting via stdout

Starting points (ADR-017): a new U-Net (default), a workspace checkpoint
(`--init_from best_model.pth`, same architecture, trained further) or a
bioimage.io model (`--bioimageio <zip | zoo id>`, trained further with its
own preprocessing and written back as a fine-tuned package).
"""

import torch
import torch.nn as nn
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
from tiff_validation_utils import safe_imread
from unet_arch import UNet
import random
import time
from datetime import datetime

# Import your classes (assuming they're in separate files or copied here)
class Imagedataset(Dataset):
    def __init__(self, image_dir, mask_dir, transform=None, patch_size=None,
                 patches_per_image=None, augment=False, augment_prob=0.5, num_classes=3,
                 normalise=True):
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
            normalise (bool): Divide each slice by its maximum (the workspace
                convention). False when the slices were already preprocessed
                by a bioimage.io model's own preprocessing (ADR-017).
        """
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.transform = transform
        self.patch_size = patch_size
        self.patches_per_image = patches_per_image
        self.augment = augment
        self.augment_prob = augment_prob
        self.num_classes = num_classes
        self.normalise = normalise
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
        image = safe_imread(img_path)
        mask = safe_imread(mask_path)

        # Normalize image to [0, 1] (unless the slices are preprocessed already)
        image_array = image.astype(np.float32)
        if self.normalise:
            image_array = image_array / max(float(image_array.max()), 1e-6)
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

# UNet lives in unet_arch.py (shared with run_inference.py and the bioimage.io export)

class Head:
    """
    Output head of the model being trained (ADR-017, rule F5):
      softmax        C channels of logits, cross-entropy, class k = channel k
      sigmoid_logits one channel of logits, BCE with logits, class 1 = foreground
      sigmoid_probs  one channel of probabilities (the network applies the
                     sigmoid itself), BCE on the clamped probabilities
    """

    def __init__(self, kind, num_classes):
        if kind not in ('softmax', 'sigmoid_logits', 'sigmoid_probs'):
            raise ValueError(f"Unknown head kind {kind}")
        if kind != 'softmax' and num_classes != 2:
            raise ValueError(f"A single-channel model needs 2 classes (background + one class), got {num_classes}")
        self.kind = kind
        self.num_classes = num_classes

    def loss(self, outputs, masks_onehot):
        target = masks_onehot.argmax(dim=1)
        if self.kind == 'softmax':
            return nn.functional.cross_entropy(outputs, target)
        fg = (target > 0).float()
        if self.kind == 'sigmoid_logits':
            return nn.functional.binary_cross_entropy_with_logits(outputs[:, 0], fg)
        return nn.functional.binary_cross_entropy(outputs[:, 0].clamp(1e-6, 1 - 1e-6), fg)

    def classes(self, outputs):
        """Class map (batch, y, x) from the raw network output."""
        if self.kind == 'softmax':
            return outputs.argmax(dim=1)
        if self.kind == 'sigmoid_logits':
            return (outputs[:, 0] > 0).long()
        return (outputs[:, 0] > 0.5).long()


def first_tensor(y):
    """Networks may return a list or tuple of outputs; the first is the prediction."""
    return y[0] if isinstance(y, (list, tuple)) else y


def calculate_dice_score(pred, target, num_classes=3):
    """Dice over the foreground classes from class maps (pred, target: batch, y, x)."""
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

def send_stage(stage, training_id, **extra):
    """Non-epoch progress (loading a parent model, packaging, self-testing)."""
    print(f"PROGRESS:{json.dumps({'type': 'stage', 'stage': stage, 'training_id': training_id, **extra})}", flush=True)


def send_progress(epoch, total_epochs, train_loss, train_dice, val_loss, val_dice, training_id):
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

    # Send as JSON with PROGRESS: prefix for easy parsing
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

def labelled_slice_indices(annotation_stack):
    """Indices of slices that carry at least one non-zero label (rule R1)."""
    flat = annotation_stack.reshape(annotation_stack.shape[0], -1)
    return [int(i) for i in np.flatnonzero(flat.any(axis=1))]


def split_labelled_slices(labelled, val_fraction):
    """
    Split one pair's labelled slice indices into train and validation.

    The validation slices are a contiguous block at the END of the labelled
    slices (rule R3): neighbouring EM slices are near-identical, so an
    interleaved split would leak training content into validation. A pair
    with two or more labelled slices contributes at least one validation
    slice; a pair with a single labelled slice contributes it to training.
    """
    n = len(labelled)
    if n < 2:
        return list(labelled), []
    n_val = int(round(n * val_fraction))
    n_val = max(1, min(n_val, n - 1))
    return list(labelled[:n - n_val]), list(labelled[n - n_val:])


def apply_label_map(annotation_stack, label_map):
    """Remap label values with {original: new} (values absent from the map become 0)."""
    if not label_map:
        return annotation_stack
    lut = np.zeros(int(max(int(k) for k in label_map)) + 1, dtype=np.uint8)
    for orig, new in label_map.items():
        lut[int(orig)] = int(new)
    clipped = np.clip(annotation_stack, 0, len(lut) - 1).astype(np.int64)
    return lut[clipped]


def prepare_pairs(pairs, val_fraction, num_classes, preprocess=None):
    """
    Write the labelled slices of every raw/annotation pair to per-slice TIFF
    files in a temporary directory (the Imagedataset works on directories).

    pairs: [{"raw": path, "annotations": path, "labelMap": {orig: new} | None}]
    preprocess: optional callable (Z, Y, X) -> float32 (Z, Y, X) applied to
        each raw stack before the slices are written (a bioimage.io parent's
        own preprocessing, ADR-017); the dataset then skips its normalisation.
    Returns the directory layout plus per-pair counts for the UI.
    """
    import tempfile
    temp_dir = tempfile.mkdtemp(prefix='training_data_')
    dirs = {
        'train_imgs_dir': os.path.join(temp_dir, 'train_images'),
        'train_masks_dir': os.path.join(temp_dir, 'train_masks'),
        'val_imgs_dir': os.path.join(temp_dir, 'val_images'),
        'val_masks_dir': os.path.join(temp_dir, 'val_masks'),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    summary = []
    total_train = total_val = 0
    for pair_idx, pair in enumerate(pairs):
        raw_stack = safe_imread(pair['raw'])
        annotation_stack = safe_imread(pair['annotations'])
        if raw_stack.ndim == 2:
            raw_stack = raw_stack[np.newaxis, ...]
        if annotation_stack.ndim == 2:
            annotation_stack = annotation_stack[np.newaxis, ...]
        if raw_stack.shape != annotation_stack.shape:
            raise ValueError(
                f"Pair {pair_idx + 1}: shape mismatch raw={raw_stack.shape} "
                f"annotations={annotation_stack.shape}")
        if preprocess is not None:
            raw_stack = preprocess(raw_stack)

        annotation_stack = apply_label_map(annotation_stack, pair.get('labelMap'))
        max_label = int(annotation_stack.max()) if annotation_stack.size else 0
        if max_label >= num_classes:
            raise ValueError(
                f"Pair {pair_idx + 1}: label value {max_label} exceeds the "
                f"{num_classes} classes of this training run")

        labelled = labelled_slice_indices(annotation_stack)
        if not labelled:
            raise ValueError(
                f"Pair {pair_idx + 1} ({os.path.basename(pair['annotations'])}) "
                f"has no labelled slices")
        train_idx, val_idx = split_labelled_slices(labelled, val_fraction)

        for subset, indices in (('train', train_idx), ('val', val_idx)):
            for i in indices:
                name = f"p{pair_idx:02d}_s{i:04d}.tif"
                tifffile.imwrite(os.path.join(dirs[f'{subset}_imgs_dir'], name), raw_stack[i])
                tifffile.imwrite(os.path.join(dirs[f'{subset}_masks_dir'], name.replace('.tif', '_mask.tif')),
                                 annotation_stack[i].astype(np.uint8))

        total_train += len(train_idx)
        total_val += len(val_idx)
        summary.append({
            'pair': pair_idx,
            'raw': os.path.basename(pair['raw']),
            'annotations': os.path.basename(pair['annotations']),
            'slices': int(raw_stack.shape[0]),
            'labelled': len(labelled),
            'train': len(train_idx),
            'val': len(val_idx),
            'width': int(raw_stack.shape[2]),
            'height': int(raw_stack.shape[1]),
        })

    if total_train < 1 or total_val < 1:
        raise ValueError(
            "Need at least two labelled slices in total (one for training, "
            "one for validation)")

    dirs['temp_dir'] = temp_dir
    dirs['summary'] = summary
    dirs['totals'] = {'train': total_train, 'val': total_val,
                      'labelled': total_train + total_val,
                      'slices': int(sum(p['slices'] for p in summary))}
    return dirs

def train_model_with_progress(model, train_loader, val_loader,
                             head, optimizer, num_epochs, device,
                             save_dir, training_id, config,
                             save_checkpoint=True, checkpoint_extra=None):
    """
    Train the model with real-time progress reporting.

    save_checkpoint: write best_model.pth (workspace U-Nets). When False the
        best state dict is kept in memory and returned (bioimage.io parents
        are written back as a package by the caller).
    Returns (results, best_state).
    """

    best_val_dice = 0.0
    best_state = None
    num_classes = head.num_classes

    for epoch in range(num_epochs):
        print(f'\nEpoch {epoch+1}/{num_epochs}', flush=True)

        # Training phase
        model.train()
        train_loss = 0.0
        train_dice = 0.0

        for inputs, masks in train_loader:
            inputs = inputs.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()
            outputs = first_tensor(model(inputs))
            loss = head.loss(outputs, masks)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            train_dice += calculate_dice_score(head.classes(outputs.detach()), masks.argmax(dim=1), num_classes)

        epoch_train_loss = train_loss / len(train_loader)
        epoch_train_dice = train_dice / len(train_loader)

        # Validation phase
        model.eval()
        val_loss = 0.0
        val_dice = 0.0

        with torch.no_grad():
            for inputs, masks in val_loader:
                inputs = inputs.to(device)
                masks = masks.to(device)
                outputs = first_tensor(model(inputs))
                val_loss += head.loss(outputs, masks).item()
                val_dice += calculate_dice_score(head.classes(outputs), masks.argmax(dim=1), num_classes)

        epoch_val_loss = val_loss / len(val_loader)
        epoch_val_dice = val_dice / len(val_loader)

        send_progress(epoch + 1, num_epochs, epoch_train_loss, epoch_train_dice,
                     epoch_val_loss, epoch_val_dice, training_id)

        # Keep the best epoch by validation Dice
        if epoch_val_dice > best_val_dice or best_state is None:
            best_val_dice = max(best_val_dice, epoch_val_dice)
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            if save_checkpoint:
                model_save_path = os.path.join(save_dir, 'best_model.pth')
                model_save_dict = {
                    'epoch': epoch,
                    'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'val_dice': epoch_val_dice,
                    'model_config': {
                        'features': config['features'],
                        'num_layers': config['num_layers'],
                        'in_channels': 1,
                        'num_classes': num_classes
                    },
                    'training_config': config,
                    'pytorch_version': torch.__version__
                }
                if checkpoint_extra:
                    model_save_dict.update(checkpoint_extra)
                torch.save(model_save_dict, model_save_path, _use_new_zipfile_serialization=False)
                print(f"Best model saved with validation Dice: {epoch_val_dice:.4f}", flush=True)
            else:
                print(f"Best epoch so far, validation Dice: {epoch_val_dice:.4f}", flush=True)

    # No held-out test split (rule R3): the validation Dice of the kept
    # checkpoint is the reported number. test_* keys stay for compatibility.
    results = {
        'test_loss': None,
        'test_dice': None,
        'best_val_dice': best_val_dice
    }
    print(f"Training completed. Best validation Dice: {best_val_dice:.4f}", flush=True)
    return results, best_state


# ---------------------------------------------------------------------------
# Starting points (ADR-017)
# ---------------------------------------------------------------------------

def resolve_start_model(args, config, num_classes, device, training_id):
    """
    Build the model to train and its head.

    Returns dict(model, head, preprocess, normalise, save_checkpoint, start,
    descr): `start` describes the parent for results.json, `descr` is the
    bioimage.io description (packages only).
    """
    if args.bioimageio:
        from bioimageio_utils import load_ready, finetune_info, preprocessing_callable
        from bioimageio.core.backends.pytorch_backend import load_torch_model
        send_stage('loading', training_id)
        descr, info = load_ready(args.bioimageio)
        fi = finetune_info(descr)
        if not fi['eligible']:
            raise ValueError(f"This bioimage.io model cannot be fine-tuned: {fi['reason']}")
        if fi['classes'] != num_classes:
            raise ValueError(
                f"The model expects {fi['classes']} annotation classes (background included) "
                f"but the training pairs have {num_classes}")
        if config['patch_size'] not in fi['allowed_patch_sizes']:
            allowed = ', '.join(str(p) for p in fi['allowed_patch_sizes'])
            raise ValueError(
                f"Patch size {config['patch_size']} is not accepted by the model's input size rule; "
                f"allowed: {allowed}")
        model = load_torch_model(descr.weights.pytorch_state_dict, load_state=True, devices=[str(device)])
        model = model.to(device)
        n_params = sum(p.numel() for p in model.parameters())
        print(f"Fine-tuning bioimage.io model '{descr.name}' ({fi['head']} head, {n_params} parameters)", flush=True)
        return {
            'model': model,
            'head': Head(fi['head'], num_classes),
            'preprocess': preprocessing_callable(descr),
            'normalise': False,
            'save_checkpoint': False,
            'descr': descr,
            'start': {'kind': 'bioimageio', 'source': args.bioimageio, 'name': descr.name,
                      'id': str(descr.id) if descr.id else None, 'head': fi['head']},
        }

    if args.init_from:
        from export_bioimageio import load_checkpoint, config_from_state
        send_stage('loading', training_id)
        checkpoint, state = load_checkpoint(args.init_from)
        model_config = config_from_state(state)
        if model_config['num_classes'] != num_classes:
            raise ValueError(
                f"The checkpoint was trained for {model_config['num_classes']} classes "
                f"but the training pairs have {num_classes}")
        if model_config['in_channels'] != 1:
            raise ValueError("Only single-channel checkpoints can be trained further")
        config['features'] = model_config['features']
        config['num_layers'] = model_config['num_layers']
        model = UNet(**model_config).to(device)
        model.load_state_dict(state)
        parent_dice = checkpoint.get('val_dice')
        print(f"Continuing from checkpoint {os.path.basename(args.init_from)} "
              f"({model_config['features']} features, {model_config['num_layers']} layers)", flush=True)
        return {
            'model': model,
            'head': Head('softmax', num_classes),
            'preprocess': None,
            'normalise': True,
            'save_checkpoint': True,
            'descr': None,
            'start': {'kind': 'checkpoint', 'source': args.init_from,
                      'val_dice': float(parent_dice) if isinstance(parent_dice, (int, float)) else None},
        }

    model = UNet(
        features=config['features'],
        num_layers=config['num_layers'],
        in_channels=1,
        num_classes=num_classes
    ).to(device)
    return {'model': model, 'head': Head('softmax', num_classes), 'preprocess': None,
            'normalise': True, 'save_checkpoint': True, 'descr': None, 'start': {'kind': 'none'}}


def load_meta(meta_arg):
    if not meta_arg:
        return {}
    if os.path.isfile(meta_arg):
        with open(meta_arg) as fh:
            return json.load(fh)
    return json.loads(meta_arg)


def main():
    parser = argparse.ArgumentParser(description='Train UNet model for biomedical segmentation')
    parser.add_argument('--config', type=str, required=True, help='JSON configuration string')
    parser.add_argument('--pairs', type=str, default=None,
                        help='JSON file: [{"raw": path, "annotations": path, "labelMap": {...}}, ...]')
    parser.add_argument('--raw_images', type=str, default=None, help='Single pair: raw images TIFF stack')
    parser.add_argument('--annotations', type=str, default=None, help='Single pair: annotations TIFF stack')
    parser.add_argument('--output_dir', type=str, required=True, help='Output directory')
    parser.add_argument('--training_id', type=str, required=True, help='Training session ID')
    parser.add_argument('--init_from', type=str, default=None,
                        help='Workspace checkpoint (.pth) to continue training from (ADR-017)')
    parser.add_argument('--bioimageio', type=str, default=None,
                        help='bioimage.io package zip or zoo id to fine-tune (ADR-017)')
    parser.add_argument('--meta', type=str, default='',
                        help='JSON string or file with parent / author / workspace details for the package')

    args = parser.parse_args()
    if args.init_from and args.bioimageio:
        print("Error: --init_from and --bioimageio are mutually exclusive", file=sys.stderr, flush=True)
        sys.exit(1)

    # Parse configuration
    config = json.loads(args.config)

    # Training pairs: a JSON file, or the legacy single pair
    if args.pairs:
        with open(args.pairs) as fh:
            pairs = json.load(fh)
    elif args.raw_images and args.annotations:
        pairs = [{'raw': args.raw_images, 'annotations': args.annotations}]
    else:
        print("Error: provide --pairs or both --raw_images and --annotations", file=sys.stderr, flush=True)
        sys.exit(1)
    if not isinstance(pairs, list) or not pairs:
        print("Error: no training pairs", file=sys.stderr, flush=True)
        sys.exit(1)

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

    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}", flush=True)

    # Emit resolved device to the UI (parity with DL denoising module).
    # Lets the frontend surface "initialized on CUDA/CPU" so a silent CPU
    # fallback (e.g. a broken GPU driver) never goes unnoticed.
    print(f"PROGRESS:{json.dumps({'type': 'init', 'device': str(device), 'gpuAvailable': torch.cuda.is_available(), 'training_id': args.training_id})}", flush=True)

    data_dirs = None
    try:
        num_classes = config.get('num_classes', 3)
        val_fraction = float(config.get('val_fraction', 0.15))
        val_fraction = min(0.4, max(0.05, val_fraction))
        meta = load_meta(args.meta)

        # Starting point: new U-Net, workspace checkpoint or bioimage.io model
        start = resolve_start_model(args, config, num_classes, device, args.training_id)
        model, head = start['model'], start['head']

        # Prepare data: labelled slices of every pair, split per pair
        print(f"Preparing {len(pairs)} training pair(s), validation fraction {val_fraction:.2f}...", flush=True)
        data_dirs = prepare_pairs(pairs, val_fraction, num_classes, preprocess=start['preprocess'])
        for p in data_dirs['summary']:
            print(f"  pair {p['pair'] + 1}: {p['labelled']}/{p['slices']} labelled slices "
                  f"({p['train']} train, {p['val']} val)", flush=True)
        print(f"PROGRESS:{json.dumps({'type': 'data', 'pairs': data_dirs['summary'], 'totals': data_dirs['totals'], 'training_id': args.training_id})}", flush=True)

        # Create datasets
        print("Creating datasets...", flush=True)
        print(f"Using {num_classes} classes for segmentation", flush=True)

        train_dataset = Imagedataset(
            image_dir=data_dirs['train_imgs_dir'],
            mask_dir=data_dirs['train_masks_dir'],
            transform=True,
            patch_size=config['patch_size'],
            patches_per_image=config['patches_per_image'],
            augment=config.get('augment', False),
            num_classes=num_classes,
            normalise=start['normalise']
        )

        val_dataset = Imagedataset(
            image_dir=data_dirs['val_imgs_dir'],
            mask_dir=data_dirs['val_masks_dir'],
            transform=True,
            patch_size=config['patch_size'],
            patches_per_image=max(1, config.get('patches_per_image', 10) // 2),
            augment=False,
            num_classes=num_classes,
            normalise=start['normalise']
        )

        # Create data loaders
        train_loader = DataLoader(train_dataset, batch_size=config['batch_size'], shuffle=True, num_workers=2)
        val_loader = DataLoader(val_dataset, batch_size=config['batch_size'], shuffle=False, num_workers=2)

        optimizer = optim.Adam(model.parameters(), lr=config['learning_rate'])

        # Save configuration (with the resolved starting point)
        config_out = dict(config)
        if start['start']['kind'] != 'none':
            config_out['fine_tuned_from'] = {**start['start'], **(meta.get('parent') or {})}
        with open(os.path.join(args.output_dir, 'config.json'), 'w') as f:
            json.dump(config_out, f, indent=2)

        # Train model
        print("Starting training...", flush=True)
        checkpoint_extra = None
        if start['start']['kind'] == 'checkpoint':
            checkpoint_extra = {'fine_tuned_from': config_out['fine_tuned_from']}
        results, best_state = train_model_with_progress(
            model=model,
            train_loader=train_loader,
            val_loader=val_loader,
            head=head,
            optimizer=optimizer,
            num_epochs=config['num_epochs'],
            device=device,
            save_dir=args.output_dir,
            training_id=args.training_id,
            config=config,
            save_checkpoint=start['save_checkpoint'],
            checkpoint_extra=checkpoint_extra
        )
        results['head'] = head.kind
        if start['start']['kind'] != 'none':
            results['fine_tuned_from'] = config_out['fine_tuned_from']

        # bioimage.io parent: write the fine-tuned package (rule F6)
        if start['start']['kind'] == 'bioimageio':
            from bioimageio_utils import build_finetuned_package
            totals = data_dirs['totals']
            weights_path = os.path.join(args.output_dir, 'finetuned_state_dict.pt')
            torch.save(best_state, weights_path)
            package_meta = {
                'parent': {**start['start'], **(meta.get('parent') or {})},
                'parent_display': meta.get('parent_display') or start['start']['name'],
                'author': meta.get('author'),
                'workspace_version': meta.get('workspace_version'),
                'training_id': args.training_id,
                'data': meta.get('data') or ', '.join(p['raw'] for p in data_dirs['summary']),
                'num_epochs': config['num_epochs'],
                'learning_rate': config['learning_rate'],
                'patch_size': config['patch_size'],
                'slices': f"{totals['train']} / {totals['val']}",
                'val_dice': results['best_val_dice'],
                'head': head.kind,
                'training_config': {k: v for k, v in config.items() if isinstance(v, (int, float, str, bool))},
            }
            try:
                package = build_finetuned_package(
                    args.bioimageio, weights_path, args.output_dir, package_meta,
                    progress=lambda stage: send_stage(stage, args.training_id))
            finally:
                try:
                    os.remove(weights_path)
                except OSError:
                    pass
            results['package'] = package
            print(f"PROGRESS:{json.dumps({'type': 'output', 'training_id': args.training_id, 'package': package})}", flush=True)
            print(f"Fine-tuned package written: {package['zip_path']}", flush=True)

        with open(os.path.join(args.output_dir, 'results.json'), 'w') as f:
            json.dump(results, f, indent=2)

        print("Training completed successfully!", flush=True)

    except Exception as e:
        print(f"Error during training: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        # Cleanup temporary directory (success or failure)
        if data_dirs and 'temp_dir' in data_dirs:
            import shutil
            try:
                shutil.rmtree(data_dirs['temp_dir'])
                print(f"Removed temporary directory: {data_dirs['temp_dir']}", flush=True)
            except Exception as cleanup_error:
                print(f"Warning: Could not remove temporary directory: {cleanup_error}", flush=True)

if __name__ == "__main__":
    main()