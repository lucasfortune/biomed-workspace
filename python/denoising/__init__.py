"""
Denoising package for autoStructN2V web wrapper.

This package provides modular components for deep learning-based denoising
using the autoStructN2V library with web integration via Socket.IO progress emission.
"""

import sys
from pathlib import Path

# Add the autoStructN2V 2.5D library to path before importing any modules that depend on it
_AUTOSTRUCTN2V_PATH = Path(__file__).parent.parent.parent / 'docs' / 'autoStructN2V_2.5D' / 'autoStructN2V'
if str(_AUTOSTRUCTN2V_PATH.parent) not in sys.path:
    sys.path.insert(0, str(_AUTOSTRUCTN2V_PATH.parent))

from .utils import (
    safe_load_checkpoint,
    convert_to_original_dtype,
    sanitize_config,
    emit_progress,
    emit_result,
    emit_error,
    detect_pattern
)

from .models import CenterChannelWrapper, extract_triplet_patches

from .trainer import WebAutoStructN2VTrainer

from .data_prep import (
    extract_tiff_stack_to_directory,
    prepare_input_directory
)

from .training import run_training, create_progress_callback

from .output import (
    collect_denoised_slices,
    create_tiff_stack,
    finalize_training_output
)

from .inference import run_inference, run_sequential_inference

from .operations import (
    extract_mask,
    run_stage2_only,
    finalize_stage1_only
)

__all__ = [
    # Utils
    'safe_load_checkpoint',
    'convert_to_original_dtype',
    'sanitize_config',
    'emit_progress',
    'emit_result',
    'emit_error',
    'detect_pattern',
    # Models
    'CenterChannelWrapper',
    'extract_triplet_patches',
    # Trainer
    'WebAutoStructN2VTrainer',
    # Data prep
    'extract_tiff_stack_to_directory',
    'prepare_input_directory',
    # Training
    'run_training',
    'create_progress_callback',
    # Output
    'collect_denoised_slices',
    'create_tiff_stack',
    'finalize_training_output',
    # Inference
    'run_inference',
    'run_sequential_inference',
    # Operations
    'extract_mask',
    'run_stage2_only',
    'finalize_stage1_only',
]
