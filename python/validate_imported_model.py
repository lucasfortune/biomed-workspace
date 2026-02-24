#!/usr/bin/env python3
"""
Validate imported PyTorch model and configuration files
"""

import torch
import json
import sys
import os

def validate_config(config_path):
    """Validate the configuration file"""
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Required fields
        required_fields = [
            'patch_size', 'patches_per_image', 'batch_size', 
            'features', 'num_layers', 'learning_rate', 'num_epochs'
        ]
        
        missing_fields = []
        for field in required_fields:
            if field not in config:
                missing_fields.append(field)
        
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}"
        
        # Validate field types and ranges
        if not isinstance(config['patch_size'], int) or config['patch_size'] <= 0:
            return False, "patch_size must be a positive integer"
            
        if not isinstance(config['features'], int) or config['features'] <= 0:
            return False, "features must be a positive integer"
            
        if not isinstance(config['num_layers'], int) or config['num_layers'] <= 0:
            return False, "num_layers must be a positive integer"
            
        if not isinstance(config['learning_rate'], (int, float)) or config['learning_rate'] <= 0:
            return False, "learning_rate must be a positive number"
            
        if not isinstance(config['num_epochs'], int) or config['num_epochs'] <= 0:
            return False, "num_epochs must be a positive integer"
        
        return True, config
        
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON format: {e}"
    except Exception as e:
        return False, f"Error reading config file: {e}"

def validate_model(model_path, config):
    """Validate the PyTorch model file"""
    try:
        # Check file exists and is readable
        if not os.path.exists(model_path):
            return False, "Model file does not exist"

        # Try safe loading first (weights_only=True), fall back if needed
        try:
            checkpoint = torch.load(model_path, map_location='cpu', weights_only=True)
        except Exception:
            # Fall back for legacy models with numpy objects - log warning
            import warnings
            warnings.warn(
                f"Loading model with weights_only=False. Ensure {model_path} is from a trusted source.",
                UserWarning
            )
            checkpoint = torch.load(model_path, map_location='cpu', weights_only=False)
        
        # Check if it's a valid checkpoint with model_state_dict
        if 'model_state_dict' not in checkpoint:
            return False, "Model file does not contain 'model_state_dict'"
        
        # Get model state dict
        model_state = checkpoint['model_state_dict']
        
        # Basic validation - check for U-Net-like structure
        # Accept both standard UNet (final_conv) and UNet25D (seg_head, dir_head)
        expected_keys = ['encoder_layers', 'bottleneck', 'decoder_layers', 'final_conv', 'seg_head', 'dir_head']
        unet_keys = [key for key in model_state.keys() if any(exp in key for exp in expected_keys)]

        if len(unet_keys) == 0:
            return False, "Model does not appear to be a U-Net architecture"
        
        # Get file size
        file_size = os.path.getsize(model_path)
        size_mb = file_size / (1024 * 1024)
        
        return True, f"{size_mb:.1f}MB"
        
    except Exception as e:
        return False, f"Error loading model: {e}"

def main():
    if len(sys.argv) != 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: validate_imported_model.py <model_path> <config_path>"
        }), flush=True)
        sys.exit(1)
    
    model_path = sys.argv[1]
    config_path = sys.argv[2]
    
    # Validate config first
    config_valid, config_result = validate_config(config_path)
    if not config_valid:
        print(json.dumps({
            "success": False,
            "error": f"Config validation failed: {config_result}"
        }), flush=True)
        sys.exit(0)
    
    # Validate model
    model_valid, model_result = validate_model(model_path, config_result)
    if not model_valid:
        print(json.dumps({
            "success": False,
            "error": f"Model validation failed: {model_result}"
        }), flush=True)
        sys.exit(0)
    
    # Success
    print(json.dumps({
        "success": True,
        "model_size": model_result,
        "config": config_result
    }), flush=True)

if __name__ == "__main__":
    main()