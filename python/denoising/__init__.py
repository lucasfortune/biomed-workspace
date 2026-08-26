"""
Denoising package for the autoStructN2V web wrapper (routed v1.0).

Thin web adapter over the vendored autoStructN2V v1.0 library
(python/vendor/autoStructN2V, see python/vendor/VENDORED_VERSION):
progress emission for Socket.IO, dtype round-tripping, and the
pre-training mask-approval pause. The routed pipeline itself
(measure noise ACF on the raw stack -> RouteDecision -> train ONE
model -> predict) lives in the library; this package only orchestrates
it for the web workflow. See docs/decisions/006_asn2v_routed_v1_migration.md.
"""

import sys
from pathlib import Path

# Add the vendored autoStructN2V v1.0 library to path before importing any
# modules that depend on it.
_VENDOR_PATH = Path(__file__).parent.parent / 'vendor'
if str(_VENDOR_PATH) not in sys.path:
    sys.path.insert(0, str(_VENDOR_PATH))

from .utils import (
    safe_load_checkpoint,
    convert_to_original_dtype,
    sanitize_config,
    emit_progress,
    emit_result,
    emit_error,
    detect_pattern
)

from .models import CenterChannelWrapper

from .trainer import WebRoutedTrainer

from .training import run_training, create_progress_callback

from .output import finalize_routed_output

from .inference import run_inference, run_sequential_inference

from .operations import (
    extract_mask,
    continue_training
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
    # Models (legacy-checkpoint inference only)
    'CenterChannelWrapper',
    # Trainer
    'WebRoutedTrainer',
    # Training
    'run_training',
    'create_progress_callback',
    # Output
    'finalize_routed_output',
    # Inference
    'run_inference',
    'run_sequential_inference',
    # Operations
    'extract_mask',
    'continue_training',
]
