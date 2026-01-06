#!/usr/bin/env python3
"""
Web integration wrapper for autoStructN2V.

This wrapper provides a web-friendly interface to the autoStructN2V library,
with progress emission and error handling for real-time updates via Socket.IO.

Usage:
    python autostructn2v_wrapper.py --config config.json --mode train
    python autostructn2v_wrapper.py --config config.json --mode inference
    python autostructn2v_wrapper.py --config config.json --mode extract_mask
    python autostructn2v_wrapper.py --config config.json --mode train_stage2_only
    python autostructn2v_wrapper.py --config config.json --mode inference_sequential
    python autostructn2v_wrapper.py --config config.json --mode finalize_stage1_only

This is the main entry point that routes to the appropriate function
in the denoising package based on the --mode argument.
"""

import sys
import json
import argparse

# Import functions from the modular denoising package
from denoising.training import run_training
from denoising.inference import run_inference, run_sequential_inference
from denoising.operations import extract_mask, run_stage2_only, finalize_stage1_only
from denoising.utils import emit_error, sanitize_config


def main():
    """Main entry point for the autoStructN2V web wrapper."""
    parser = argparse.ArgumentParser(description='autoStructN2V Web Wrapper')
    parser.add_argument(
        '--config',
        required=True,
        help='Path to config JSON file'
    )
    parser.add_argument(
        '--mode',
        required=True,
        choices=[
            'train',
            'inference',
            'extract_mask',
            'train_stage2_only',
            'inference_sequential',
            'finalize_stage1_only'
        ],
        help='Operation mode: train, inference, extract_mask, train_stage2_only '
             '(resume after mask approval), inference_sequential (stage1 then stage2), '
             'or finalize_stage1_only (skip Stage 2)'
    )

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
        elif args.mode == 'finalize_stage1_only':
            finalize_stage1_only(config)
    except Exception:
        # Error already emitted in the function
        sys.exit(1)


if __name__ == '__main__':
    main()
