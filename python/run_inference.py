#!/usr/bin/env python3
"""
Inference Script for Trained U-Net Models
Runs segmentation on new TIFF stack data

Supports two modes:
- Standard 2D: single-head UNet, one slice at a time
- Direction-aware 2.5D: dual-head UNet25D with multi-slice context,
  produces both segmentation and direction volume outputs
"""

import torch
import torch.nn as nn
import numpy as np
import tifffile
import argparse
import json
import sys
import os
from pathlib import Path
from PIL import Image

# Shared model definitions
from models.unet import UNet, UNet25D


def load_model(model_path, device):
    """Load the trained model from checkpoint, auto-detecting model type."""
    try:
        # First try with the new PyTorch 2.6+ approach using safe globals
        try:
            try:
                import torch.serialization
                if hasattr(torch.serialization, 'safe_globals'):
                    with torch.serialization.safe_globals(['numpy._core.multiarray.scalar']):
                        checkpoint = torch.load(model_path, map_location=device, weights_only=True)
                    print("Model loaded successfully using safe globals approach", flush=True)
                else:
                    raise AttributeError("safe_globals not available")
            except (ImportError, AttributeError):
                checkpoint = torch.load(model_path, map_location=device, weights_only=True)
                print("Model loaded successfully with weights_only=True", flush=True)

        except Exception as safe_error:
            print(f"Safe loading approach failed: {safe_error}", flush=True)
            print("Falling back to weights_only=False (safe since this is your own trained model)", flush=True)
            checkpoint = torch.load(model_path, map_location=device, weights_only=False)
            print("Model loaded successfully using weights_only=False", flush=True)

        # Get model configuration from checkpoint
        model_config = checkpoint.get('model_config', {
            'features': 64,
            'num_layers': 4,
            'in_channels': 1,
            'num_classes': 3
        })

        print(f"Model configuration: {model_config}", flush=True)

        # Branch on model type
        model_type = model_config.get('model_type', 'standard')

        if model_type == 'direction_aware':
            has_dir_head = model_config.get('has_direction_head', True)
            model = UNet25D(
                features=model_config['features'],
                num_layers=model_config['num_layers'],
                in_channels=model_config.get('in_channels', 3),
                num_classes=model_config['num_classes'],
                has_direction_head=has_dir_head,
            ).to(device)
            print(f"Created UNet25D model (direction_head={has_dir_head})", flush=True)
        else:
            model = UNet(
                features=model_config['features'],
                num_layers=model_config['num_layers'],
                in_channels=model_config['in_channels'],
                num_classes=model_config['num_classes']
            ).to(device)
            print("Created standard UNet model", flush=True)

        # Load state dict
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()

        print(f"Model loaded successfully from {model_path}", flush=True)
        print(f"Model has {sum(p.numel() for p in model.parameters())} parameters", flush=True)

        # Log additional info if available
        if 'pytorch_version' in checkpoint:
            print(f"Model was trained with PyTorch version: {checkpoint['pytorch_version']}", flush=True)
        if 'val_dice' in checkpoint:
            print(f"Model's best validation Dice score: {checkpoint['val_dice']:.4f}", flush=True)

        return model, model_config

    except Exception as e:
        print(f"Error loading model: {str(e)}", file=sys.stderr, flush=True)
        print(f"PyTorch version: {torch.__version__}", file=sys.stderr, flush=True)
        raise

def preprocess_image_slice(image_slice, target_size=None):
    """Preprocess a single image slice for inference"""
    # Normalize to [0, 1]
    image_array = image_slice.astype(np.float32)
    if image_array.max() > 0:
        image_array = image_array / image_array.max()

    # Resize if target size is specified
    if target_size:
        image_pil = Image.fromarray((image_array * 255).astype(np.uint8))
        image_pil = image_pil.resize(target_size, Image.LANCZOS)
        image_array = np.array(image_pil).astype(np.float32) / 255.0

    # Add batch and channel dimensions
    image_tensor = torch.from_numpy(image_array).unsqueeze(0).unsqueeze(0)

    return image_tensor

def postprocess_prediction(prediction, original_size):
    """Postprocess model prediction to original size"""
    # Apply softmax and get class predictions
    prediction = torch.softmax(prediction, dim=1)
    prediction = prediction.argmax(dim=1).squeeze().cpu().numpy()

    # Resize back to original size if needed
    if prediction.shape != original_size:
        prediction_pil = Image.fromarray(prediction.astype(np.uint8))
        prediction_pil = prediction_pil.resize(original_size, Image.NEAREST)
        prediction = np.array(prediction_pil)

    return prediction.astype(np.uint8)

def send_inference_progress(current_slice, total_slices, inference_id):
    """Send inference progress update to Node.js via stdout"""
    progress_data = {
        "current_slice": current_slice,
        "total_slices": total_slices,
        "progress_percent": round((current_slice / total_slices) * 100, 1),
        "inference_id": inference_id
    }

    # Send as JSON with INFERENCE_PROGRESS: prefix for easy parsing
    print(f"INFERENCE_PROGRESS:{json.dumps(progress_data)}", flush=True)

def run_inference_on_stack(model, input_stack, device, batch_size=1, inference_id=None):
    """Run inference on entire TIFF stack with progress reporting (standard 2D)"""
    num_slices, height, width = input_stack.shape
    segmented_stack = np.zeros_like(input_stack, dtype=np.uint8)

    print(f"Processing {num_slices} slices...", flush=True)

    with torch.no_grad():
        for i in range(0, num_slices, batch_size):
            end_idx = min(i + batch_size, num_slices)
            batch_slices = []

            # Prepare batch
            for j in range(i, end_idx):
                slice_tensor = preprocess_image_slice(input_stack[j])
                batch_slices.append(slice_tensor)

            # Stack into batch
            if len(batch_slices) > 1:
                batch_tensor = torch.cat(batch_slices, dim=0).to(device)
            else:
                batch_tensor = batch_slices[0].to(device)

            # Run inference
            predictions = model(batch_tensor)

            # Process predictions
            for j, prediction in enumerate(predictions):
                slice_idx = i + j
                segmented_slice = postprocess_prediction(
                    prediction.unsqueeze(0), (width, height)
                )
                segmented_stack[slice_idx] = segmented_slice

            # Send progress update
            current_slice = min(end_idx, num_slices)
            if inference_id:
                send_inference_progress(current_slice, num_slices, inference_id)

            # Progress update for console
            progress = (current_slice / num_slices) * 100
            print(f"Progress: {progress:.1f}% ({current_slice}/{num_slices} slices)", flush=True)

    return segmented_stack


def run_inference_25d(model, input_stack, device, context_slices=3,
                      batch_size=1, inference_id=None):
    """
    Run 2.5D inference producing both segmentation and direction outputs.

    Reflect-pads stack boundaries so all slices get valid context windows.
    Returns (segmented_stack, direction_stack).
    """
    num_slices, height, width = input_stack.shape
    half = context_slices // 2

    # Global normalization
    raw = input_stack.astype(np.float32)
    rmin, rmax = raw.min(), raw.max()
    if rmax > rmin:
        raw = (raw - rmin) / (rmax - rmin)

    # Reflect-pad along z-axis for boundary slices
    padded = np.pad(raw, ((half, half), (0, 0), (0, 0)), mode='reflect')

    segmented_stack = np.zeros((num_slices, height, width), dtype=np.uint8)
    direction_stack = np.zeros((num_slices, height, width, 3), dtype=np.float32)

    print(f"Processing {num_slices} slices (2.5D, context={context_slices})...", flush=True)

    with torch.no_grad():
        for i in range(0, num_slices, batch_size):
            end_idx = min(i + batch_size, num_slices)
            batch_slices = []

            for j in range(i, end_idx):
                # Extract context window from padded stack
                # Original slice j → padded index j (since we padded half on each side)
                context = padded[j:j + context_slices]  # (context_slices, H, W)
                batch_slices.append(
                    torch.from_numpy(context).unsqueeze(0)  # (1, C, H, W)
                )

            batch_tensor = torch.cat(batch_slices, dim=0).to(device)

            # Model returns (seg_logits, dir_norm)
            result = model(batch_tensor)
            if isinstance(result, tuple):
                seg_logits, dir_pred = result
            else:
                seg_logits = result
                dir_pred = None

            # Process segmentation predictions
            for j_batch, seg in enumerate(seg_logits):
                slice_idx = i + j_batch
                seg_class = postprocess_prediction(seg.unsqueeze(0), (width, height))
                segmented_stack[slice_idx] = seg_class

            # Process direction predictions
            if dir_pred is not None:
                for j_batch in range(dir_pred.shape[0]):
                    slice_idx = i + j_batch
                    # dir_pred shape: (B, 3, H, W) → (H, W, 3)
                    direction_stack[slice_idx] = (
                        dir_pred[j_batch].permute(1, 2, 0).cpu().numpy()
                    )

            # Send progress
            current_slice = min(end_idx, num_slices)
            if inference_id:
                send_inference_progress(current_slice, num_slices, inference_id)
            progress = (current_slice / num_slices) * 100
            print(f"Progress: {progress:.1f}% ({current_slice}/{num_slices} slices)", flush=True)

    return segmented_stack, direction_stack


def calculate_inference_metrics(segmented_stack):
    """Calculate basic metrics from segmentation results"""
    unique_classes, class_counts = np.unique(segmented_stack, return_counts=True)
    total_pixels = segmented_stack.size

    metrics = {
        'total_pixels': int(total_pixels),
        'class_distribution': {}
    }

    for class_idx, count in zip(unique_classes, class_counts):
        percentage = (count / total_pixels) * 100
        metrics['class_distribution'][int(class_idx)] = {
            'pixel_count': int(count),
            'percentage': round(percentage, 2)
        }

    return metrics

def save_segmentation_results(segmented_stack, output_dir, input_path, model_config,
                              inference_id, direction_stack=None):
    """Save segmentation results and metadata"""

    # Create output directory (results/segmentation/<ID>/)
    os.makedirs(output_dir, exist_ok=True)

    # Use consistent naming: segmentation_inference_<ID>.tif
    output_filename = f"segmentation_inference_{inference_id}.tif"
    metadata_filename = f"segmentation_inference_{inference_id}_metadata.json"

    segmented_output_path = os.path.join(output_dir, output_filename)
    metadata_path = os.path.join(output_dir, metadata_filename)

    # Save the segmented TIFF stack
    tifffile.imwrite(segmented_output_path, segmented_stack)
    print(f"Segmentation saved to: {segmented_output_path}", flush=True)

    # Save direction volume if present
    direction_output_path = None
    if direction_stack is not None:
        dir_filename = f"direction_inference_{inference_id}.tif"
        direction_output_path = os.path.join(output_dir, dir_filename)
        tifffile.imwrite(direction_output_path, direction_stack.astype(np.float32))
        print(f"Direction volume saved to: {direction_output_path}", flush=True)

    # Save metadata
    metadata = {
        'input_file': str(input_path),
        'output_file': str(segmented_output_path),
        'input_shape': list(segmented_stack.shape),
        'model_config': model_config,
        'metrics': calculate_inference_metrics(segmented_stack)
    }
    if direction_output_path:
        metadata['direction_output'] = str(direction_output_path)

    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"Metadata saved to: {metadata_path}", flush=True)

    return metadata, segmented_output_path, metadata_path, direction_output_path

def main():
    parser = argparse.ArgumentParser(description='Run inference on TIFF stack')
    parser.add_argument('--model', type=str, required=True, help='Path to trained model')
    parser.add_argument('--input', type=str, required=True, help='Path to input TIFF stack')
    parser.add_argument('--output', type=str, required=True, help='Path to save segmented output')
    parser.add_argument('--batch_size', type=int, default=1, help='Batch size for inference')
    parser.add_argument('--inference_id', type=str, help='Inference session ID for progress tracking')

    args = parser.parse_args()

    # Validate input files
    if not os.path.exists(args.model):
        print(f"Error: Model file not found: {args.model}", file=sys.stderr, flush=True)
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr, flush=True)
        sys.exit(1)

    # Create output directory
    output_dir = os.path.dirname(args.output)
    os.makedirs(output_dir, exist_ok=True)

    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}", flush=True)

    try:
        # Load model
        print("Loading trained model...", flush=True)
        model, model_config = load_model(args.model, device)

        # Load input data
        print(f"Loading input data from: {args.input}", flush=True)
        input_stack = tifffile.imread(args.input)
        print(f"Input shape: {input_stack.shape}", flush=True)

        # Determine model type and run appropriate inference
        model_type = model_config.get('model_type', 'standard')
        direction_stack = None

        if model_type == 'direction_aware':
            context_slices = model_config.get('context_slices', 3)
            print(f"Running 2.5D inference (context={context_slices})...", flush=True)
            segmented_stack, direction_stack = run_inference_25d(
                model, input_stack, device,
                context_slices=context_slices,
                batch_size=args.batch_size,
                inference_id=args.inference_id
            )
        else:
            print("Running standard 2D inference...", flush=True)
            segmented_stack = run_inference_on_stack(
                model, input_stack, device, args.batch_size, args.inference_id
            )

        # Save results
        print("Saving results...", flush=True)
        output_dir = os.path.dirname(args.output)
        inference_id = args.inference_id or 'unknown'
        metadata, segmented_output_path, metadata_path, direction_output_path = (
            save_segmentation_results(
                segmented_stack, output_dir, args.input, model_config, inference_id,
                direction_stack=direction_stack
            )
        )

        # Prepare results
        result = {
            'success': True,
            'output_path': segmented_output_path,
            'metadata_path': metadata_path,
            'metrics': metadata['metrics']
        }
        if direction_output_path:
            result['direction_output_path'] = direction_output_path

        print("Inference completed successfully!", flush=True)

        # Send final result with special prefix for easy parsing
        print(f"FINAL_RESULT:{json.dumps(result)}", flush=True)

        # Also output as regular JSON for backup parsing
        print("=" * 50, flush=True)
        print("BACKUP_JSON_START", flush=True)
        print(json.dumps(result, indent=2), flush=True)
        print("BACKUP_JSON_END", flush=True)
        print("=" * 50, flush=True)

    except Exception as e:
        error_message = str(e)
        print(f"Error during inference: {error_message}", file=sys.stderr, flush=True)

        error_result = {
            'success': False,
            'error': error_message
        }

        # Send error result
        print(f"FINAL_RESULT:{json.dumps(error_result)}", flush=True)

        # Also output as regular JSON for backup parsing
        print("=" * 50, flush=True)
        print("BACKUP_JSON_START", flush=True)
        print(json.dumps(error_result, indent=2), flush=True)
        print("BACKUP_JSON_END", flush=True)
        print("=" * 50, flush=True)

        sys.exit(1)

if __name__ == "__main__":
    main()
