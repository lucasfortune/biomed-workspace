#!/usr/bin/env python3
"""
Adapted Training Script for Web Interface
Includes real-time progress reporting via stdout
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
import random
import time
from datetime import datetime

# Import your classes (assuming they're in separate files or copied here)
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

class UNet(nn.Module):
    def __init__(self, features, num_layers, in_channels=1, num_classes=3):
        super(UNet, self).__init__()
        
        # Input validation
        if features <= 0 or num_layers <= 0:
            raise ValueError("features and num_layers must be positive integers")
        if in_channels <= 0 or num_classes <= 0:
            raise ValueError("in_channels and num_classes must be positive integers")
            
        self.num_layers = num_layers
        
        # Encoder pathway
        self.encoder_layers = nn.ModuleList()
        in_features = in_channels
        out_features = features
        for _ in range(num_layers):
            self.encoder_layers.append(
                self.conv_block(in_features, out_features, name=f"encoder_block_{_}")
            )
            self.encoder_layers.append(
                nn.MaxPool2d(kernel_size=2, stride=2)
            )
            in_features = out_features
            out_features *= 2

        # Bottleneck
        self.bottleneck = self.conv_block(in_features, out_features, name="bottleneck")

        # Decoder pathway
        self.decoder_layers = nn.ModuleList()
        for i in range(num_layers):
            self.decoder_layers.append(
                nn.ConvTranspose2d(
                    out_features, 
                    out_features//2, 
                    kernel_size=2, 
                    stride=2
                )
            )
            self.decoder_layers.append(
                self.conv_block(out_features, out_features//2, name=f"decoder_block_{i}")
            )
            out_features //= 2

        # Final convolution to produce output with num_classes channels
        self.final_conv = nn.Conv2d(features, num_classes, kernel_size=1)
        
        # Initialize weights
        self.apply(self._init_weights)

    def forward(self, x):
        # Store skip connections
        skip_connections = []
        
        # Encoder pathway with skip connections
        for i in range(0, len(self.encoder_layers), 2):
            # Convolution block
            x = self.encoder_layers[i](x)
            skip_connections.append(x)
            # Max pooling
            x = self.encoder_layers[i + 1](x)
    
        # Bottleneck
        x = self.bottleneck(x)
        
        # Decoder pathway with skip connections
        for i in range(0, len(self.decoder_layers), 2):
            # Upsampling
            x = self.decoder_layers[i](x)
            # Get corresponding skip connection
            skip = skip_connections.pop()
            
            # Ensure shapes match for concatenation
            if x.shape[-2:] != skip.shape[-2:]:
                raise RuntimeError(
                    f"Shape mismatch in decoder spatial dimensions: "
                    f"upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                )
            
            # Concatenate skip connection
            x = torch.cat([x, skip], dim=1)
            # Convolution block
            x = self.decoder_layers[i + 1](x)
    
        # Final convolution
        x = self.final_conv(x)
        
        return x

    def conv_block(self, in_channels, out_channels, name=None):
        return nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def _init_weights(self, m):
        if isinstance(m, (nn.Conv2d, nn.ConvTranspose2d)):
            nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
            if m.bias is not None:
                nn.init.constant_(m.bias, 0)

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

def prepare_data_from_tiff_stacks(raw_images_path, annotations_path, output_dir, config):
    """Extract individual images from TIFF stacks and organize them"""
    
    # Read TIFF stacks
    raw_stack = tifffile.imread(raw_images_path)
    annotation_stack = tifffile.imread(annotations_path)
    
    # Create directories
    train_imgs_dir = os.path.join(output_dir, 'train_images')
    train_masks_dir = os.path.join(output_dir, 'train_masks')
    val_imgs_dir = os.path.join(output_dir, 'val_images')
    val_masks_dir = os.path.join(output_dir, 'val_masks')
    test_imgs_dir = os.path.join(output_dir, 'test_images')
    test_masks_dir = os.path.join(output_dir, 'test_masks')
    
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
        'test_masks_dir': test_masks_dir
    }

def train_model_with_progress(model, train_loader, val_loader, test_loader, 
                             criterion, optimizer, num_epochs, device, 
                             save_dir, training_id, config):
    """
    Train the model with real-time progress reporting.
    """
    
    # Initialize best validation metrics
    best_val_loss = float('inf')
    best_val_dice = 0.0
    
    # Training loop
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
            
            # Forward pass
            outputs = model(inputs)
            loss = criterion(outputs, masks.argmax(dim=1))
            
            # Backward pass
            loss.backward()
            optimizer.step()
            
            # Calculate metrics
            train_loss += loss.item()
            train_dice += calculate_dice_score(outputs, masks, config.get('num_classes', 3))
        
        # Calculate epoch metrics
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
                
                outputs = model(inputs)
                loss = criterion(outputs, masks.argmax(dim=1))
                
                val_loss += loss.item()
                val_dice += calculate_dice_score(outputs, masks, config.get('num_classes', 3))
        
        epoch_val_loss = val_loss / len(val_loader)
        epoch_val_dice = val_dice / len(val_loader)
        
        # Send progress update to web interface
        send_progress(epoch + 1, num_epochs, epoch_train_loss, epoch_train_dice, 
                     epoch_val_loss, epoch_val_dice, training_id)
        
        # Save best model
        if epoch_val_dice > best_val_dice:
            best_val_dice = epoch_val_dice
            model_save_path = os.path.join(save_dir, 'best_model.pth')
            
            # Save with explicit model configuration for better compatibility
            model_save_dict = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_dice': epoch_val_dice,
                'model_config': {
                    'features': config['features'],  # Use from config
                    'num_layers': config['num_layers'],  # Use from config  
                    'in_channels': 1,
                    'num_classes': config.get('num_classes', 3)  # CHANGED: Use dynamic num_classes
                },
                'training_config': config,  # Store the full training config
                'pytorch_version': torch.__version__
            }
            
            # Save with explicit protocol to ensure compatibility
            torch.save(model_save_dict, model_save_path, _use_new_zipfile_serialization=False)
            print(f"Best model saved with validation Dice: {epoch_val_dice:.4f}", flush=True)
    
    # Final testing phase
    model.eval()
    test_loss = 0.0
    test_dice = 0.0
    
    with torch.no_grad():
        for inputs, masks in test_loader:
            inputs = inputs.to(device)
            masks = masks.to(device)
            
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

def main():
    parser = argparse.ArgumentParser(description='Train UNet model for biomedical segmentation')
    parser.add_argument('--config', type=str, required=True, help='JSON configuration string')
    parser.add_argument('--raw_images', type=str, required=True, help='Path to raw images TIFF stack')
    parser.add_argument('--annotations', type=str, required=True, help='Path to annotations TIFF stack')
    parser.add_argument('--output_dir', type=str, required=True, help='Output directory')
    parser.add_argument('--training_id', type=str, required=True, help='Training session ID')
    
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
    
    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}", flush=True)
    
    try:
        # Prepare data from TIFF stacks
        print("Preparing data from TIFF stacks...", flush=True)
        data_dirs = prepare_data_from_tiff_stacks(args.raw_images, args.annotations, args.output_dir, config)
        
        # Create datasets
        print("Creating datasets...", flush=True)
        num_classes = config.get('num_classes', 3)
        print(f"Using {num_classes} classes for segmentation", flush=True)
        
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

        print("Training completed successfully!", flush=True)
        
    except Exception as e:
        print(f"Error during training: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()