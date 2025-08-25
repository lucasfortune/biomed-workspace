#!/usr/bin/env python3
"""
Inference Script for Trained U-Net Models
Runs segmentation on new TIFF stack data
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

# Import the UNet class (same as in training script)
class UNet(nn.Module):
    def __init__(self, features, num_layers, in_channels=1, num_classes=3):
        super(UNet, self).__init__()
        
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

        # Final convolution
        self.final_conv = nn.Conv2d(features, num_classes, kernel_size=1)
        
        # Initialize weights
        self.apply(self._init_weights)

    def forward(self, x):
        skip_connections = []
        
        # Encoder pathway with skip connections
        for i in range(0, len(self.encoder_layers), 2):
            x = self.encoder_layers[i](x)
            skip_connections.append(x)
            x = self.encoder_layers[i + 1](x)
    
        # Bottleneck
        x = self.bottleneck(x)
        
        # Decoder pathway with skip connections
        for i in range(0, len(self.decoder_layers), 2):
            x = self.decoder_layers[i](x)
            skip = skip_connections.pop()
            
            if x.shape[-2:] != skip.shape[-2:]:
                raise RuntimeError(
                    f"Shape mismatch in decoder spatial dimensions: "
                    f"upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                )
            
            x = torch.cat([x, skip], dim=1)
            x = self.decoder_layers[i + 1](x)
    
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

def load_model(model_path, device):
    """Load the trained model from checkpoint"""
    try:
        # First try with the new PyTorch 2.6+ approach using safe globals
        try:
            # Check if torch.serialization.safe_globals is available (PyTorch 2.6+)
            try:
                import torch.serialization
                if hasattr(torch.serialization, 'safe_globals'):
                    with torch.serialization.safe_globals(['numpy._core.multiarray.scalar']):
                        checkpoint = torch.load(model_path, map_location=device, weights_only=True)
                    print("Model loaded successfully using safe globals approach", flush=True)
                else:
                    raise AttributeError("safe_globals not available")
            except (ImportError, AttributeError):
                # For older PyTorch versions, try weights_only=True first
                checkpoint = torch.load(model_path, map_location=device, weights_only=True)
                print("Model loaded successfully with weights_only=True", flush=True)
                
        except Exception as safe_error:
            print(f"Safe loading approach failed: {safe_error}", flush=True)
            print("Falling back to weights_only=False (safe since this is your own trained model)", flush=True)
            
            # Fallback to weights_only=False since this is the user's own model
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
        
        # Create model with same architecture
        model = UNet(
            features=model_config['features'],
            num_layers=model_config['num_layers'],
            in_channels=model_config['in_channels'],
            num_classes=model_config['num_classes']
        ).to(device)
        
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
    """Run inference on entire TIFF stack with progress reporting"""
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

def save_segmentation_results(segmented_stack, output_path, input_path, model_config):
    """Save segmentation results and metadata"""
    # Save the segmented TIFF stack
    tifffile.imwrite(output_path, segmented_stack)
    print(f"Segmentation saved to: {output_path}", flush=True)
    
    # Save metadata
    metadata = {
        'input_file': str(input_path),
        'output_file': str(output_path),
        'input_shape': list(segmented_stack.shape),
        'model_config': model_config,
        'metrics': calculate_inference_metrics(segmented_stack)
    }
    
    metadata_path = output_path.replace('.tif', '_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Metadata saved to: {metadata_path}", flush=True)
    
    return metadata

def create_3d_visualization_data(segmented_stack, output_dir):
    """Create data files for 3D visualization"""
    # Create simplified volume data for web visualization
    # Downsample for better web performance
    downsample_factor = max(1, max(segmented_stack.shape) // 128)
    
    if downsample_factor > 1:
        downsampled = segmented_stack[::downsample_factor, ::downsample_factor, ::downsample_factor]
    else:
        downsampled = segmented_stack
    
    # Save as JSON for easy web loading
    viz_data = {
        'shape': list(downsampled.shape),
        'data': downsampled.flatten().tolist(),
        'downsample_factor': downsample_factor,
        'original_shape': list(segmented_stack.shape)
    }
    
    viz_path = os.path.join(output_dir, 'visualization_data.json')
    with open(viz_path, 'w') as f:
        json.dump(viz_data, f)
    
    print(f"3D visualization data saved to: {viz_path}", flush=True)
    return viz_path

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
        
        # Run inference with progress reporting
        print("Running inference...", flush=True)
        segmented_stack = run_inference_on_stack(
            model, input_stack, device, args.batch_size, args.inference_id
        )
        
        # Save results
        print("Saving results...", flush=True)
        metadata = save_segmentation_results(segmented_stack, args.output, args.input, model_config)
        
        # Create 3D visualization data
        print("Creating 3D visualization data...", flush=True)
        viz_path = create_3d_visualization_data(segmented_stack, output_dir)
        
        # Prepare results
        result = {
            'success': True,
            'output_path': args.output,
            'metadata_path': args.output.replace('.tif', '_metadata.json'),
            'visualization_path': viz_path,
            'metrics': metadata['metrics']
        }
        
        print("Inference completed successfully!", flush=True)
        print(f"Results: {result}", flush=True)
        
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