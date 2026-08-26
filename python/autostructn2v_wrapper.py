#!/usr/bin/env python3
"""
Web integration wrapper for autoStructN2V (routed v1.0).

This wrapper provides a web-friendly interface to the vendored
autoStructN2V v1.0 library (python/vendor/), with progress emission and
error handling for real-time updates via Socket.IO.

Usage:
    python autostructn2v_wrapper.py --config config.json --mode train
    python autostructn2v_wrapper.py --config config.json --mode continue_training
    python autostructn2v_wrapper.py --config config.json --mode extract_mask
    python autostructn2v_wrapper.py --config config.json --mode inference
    python autostructn2v_wrapper.py --config config.json --mode inference_sequential

Modes:
    train               Resolve mask/route on the raw stack (seconds). With
                        pauseAfterMask (method 'autostructn2v') this emits the
                        mask + route decision and exits for user approval;
                        method 'n2v' trains straight through.
    continue_training   Run the single routed training after mask approval
                        (override_branch='n2v' forces plain N2V, the old
                        "skip" action).
    extract_mask        Regenerate the mask/route with adjusted extractor
                        parameters (no training).
    inference           Denoise a stack with a trained model. Handles routed
                        v1.0 checkpoints and legacy two-stage checkpoints
                        (2D and 2.5D).
    inference_sequential  Legacy imported stage1+stage2 model pairs only.

The old two-stage modes train_stage2_only / finalize_stage1_only are
retired with the routed pipeline (see
docs/decisions/006_asn2v_routed_v1_migration.md).
"""

import sys
import json
import argparse

# Import functions from the modular denoising package
from denoising.training import run_training
from denoising.inference import run_inference, run_sequential_inference
from denoising.operations import extract_mask, continue_training
from denoising.utils import emit_error, sanitize_config

RETIRED_MODES = {
    'train_stage2_only': "retired: the routed pipeline trains ONE model; "
                         "use --mode continue_training after mask approval",
    'finalize_stage1_only': "retired: nothing is trained before approval; "
                            "use --mode continue_training with "
                            "override_branch='n2v' to force plain N2V",
}


def main():
    """Main entry point for the autoStructN2V web wrapper."""
    parser = argparse.ArgumentParser(description='autoStructN2V Web Wrapper (routed v1.0)')
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
            'continue_training',
            'extract_mask',
            'inference',
            'inference_sequential',
            # retired names kept as choices so a stale caller gets a clear
            # error instead of an argparse usage dump
            'train_stage2_only',
            'finalize_stage1_only',
        ],
        help='Operation mode (see module docstring)'
    )

    args = parser.parse_args()

    if args.mode in RETIRED_MODES:
        emit_error('init', f'mode {args.mode!r} is {RETIRED_MODES[args.mode]}')
        sys.exit(1)

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
        elif args.mode == 'continue_training':
            continue_training(config)
        elif args.mode == 'extract_mask':
            extract_mask(config)
        elif args.mode == 'inference':
            run_inference(config)
        elif args.mode == 'inference_sequential':
            run_sequential_inference(config)
    except Exception:
        # Error already emitted in the function
        sys.exit(1)


if __name__ == '__main__':
    main()
