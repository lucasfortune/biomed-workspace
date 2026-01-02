#!/usr/bin/env python3
"""
Output Utilities - Standardized output patterns for viz_app Python scripts.

Provides consistent output formatting for progress updates, results, and errors.
These formats are parsed by the Node.js backend to emit Socket.IO events.
"""

import json
import sys


def emit_json(data, prefix=None):
    """
    Emit JSON data to stdout with optional prefix.

    Args:
        data: Dictionary to serialize as JSON.
        prefix: Optional prefix (e.g., 'PROGRESS', 'RESULT').

    Examples:
        >>> emit_json({'status': 'ok'})  # Prints: {"status": "ok"}
        >>> emit_json({'step': 1}, 'PROGRESS')  # Prints: PROGRESS:{"step": 1}
    """
    json_str = json.dumps(data)
    if prefix:
        print(f"{prefix}:{json_str}", flush=True)
    else:
        print(json_str, flush=True)


def emit_progress(current, total, message="Processing...", prefix="PROGRESS"):
    """
    Emit a progress update to stdout.

    Args:
        current: Current step number.
        total: Total number of steps.
        message: Human-readable progress message.
        prefix: Output prefix (default: 'PROGRESS').

    Output format:
        PREFIX:{"current": N, "total": M, "percent": P, "message": "..."}
    """
    data = {
        "current": current,
        "total": total,
        "percent": round((current / total) * 100, 1) if total > 0 else 0,
        "message": message
    }
    emit_json(data, prefix)


def emit_result(data, prefix="RESULT"):
    """
    Emit a result to stdout.

    Args:
        data: Result dictionary (should include 'success' key).
        prefix: Output prefix (default: 'RESULT').

    Output format:
        PREFIX:{"success": true/false, ...}
    """
    emit_json(data, prefix)


def emit_error(message, prefix="ERROR"):
    """
    Emit an error to stdout.

    Args:
        message: Error message string.
        prefix: Output prefix (default: 'ERROR').

    Output format:
        PREFIX:{"error": "message"}
    """
    emit_json({"error": message}, prefix)


def emit_success(message, prefix="SUCCESS"):
    """
    Emit a simple success message to stdout.

    Used by scripts like generate_thumbnail.py that use simple output format.

    Args:
        message: Success message or path.
        prefix: Output prefix (default: 'SUCCESS').

    Output format:
        SUCCESS:message
    """
    print(f"{prefix}:{message}", flush=True)


def emit_simple_error(message, prefix="ERROR"):
    """
    Emit a simple error message to stdout.

    Used by scripts that use simple output format (not JSON).

    Args:
        message: Error message.
        prefix: Output prefix (default: 'ERROR').

    Output format:
        ERROR:message
    """
    print(f"{prefix}:{message}", flush=True)


def log_stderr(message):
    """
    Log a message to stderr for debugging.

    These messages are captured by Node.js but not parsed as progress/results.

    Args:
        message: Message to log.
    """
    print(message, file=sys.stderr, flush=True)


# Pre-configured emitters for specific script types

class FilterEmitter:
    """Output emitter for filter-based denoising scripts."""

    @staticmethod
    def progress(current, total, message="Processing..."):
        emit_progress(current, total, message, prefix="FILTER_PROGRESS")

    @staticmethod
    def result(data):
        emit_result(data, prefix="FILTER_RESULT")

    @staticmethod
    def error(message):
        emit_error(message, prefix="FILTER_ERROR")


class InferenceEmitter:
    """Output emitter for inference scripts."""

    @staticmethod
    def progress(current, total, message="Processing..."):
        emit_progress(current, total, message, prefix="INFERENCE_PROGRESS")

    @staticmethod
    def result(data):
        emit_result(data, prefix="FINAL_RESULT")

    @staticmethod
    def error(message):
        emit_error(message, prefix="INFERENCE_ERROR")


class TrainingEmitter:
    """Output emitter for training scripts."""

    @staticmethod
    def progress(epoch, total_epochs, metrics=None, message=None):
        data = {
            "epoch": epoch,
            "total_epochs": total_epochs,
            "metrics": metrics or {}
        }
        if message:
            data["message"] = message
        emit_json(data, prefix="PROGRESS")

    @staticmethod
    def complete(data):
        emit_json(data, prefix="TRAINING_COMPLETE")

    @staticmethod
    def error(message):
        emit_error(message, prefix="TRAINING_ERROR")
