#!/usr/bin/env python3
"""
Stitch alignment: estimate the in-plane translation between two slices.

Used by the stitching module's Auto-align button (ADR-007). Given one slice
from a fixed stack and one from a moving stack (the declared "same physical
section" pair), estimates the (dx, dy) that places the moving slice onto the
fixed one, via phase correlation.

Modes:
    grayscale  - phase correlation on the (normalized) intensities
    labels     - phase correlation on a boundary map extracted from the
                 label image (class IDs themselves carry no correlation
                 meaning)

Coarse-to-fine: correlation runs on a downsampled pair first (max dimension
~1024), then refines on full-resolution central windows shifted by the
coarse estimate.

Output (stdout): STITCH_RESULT:{"dx": ..., "dy": ..., "score": ...}
    dx, dy: pixels; POSITIVE dx moves the moving slice right, positive dy
    moves it down, in the fixed slice's coordinate frame.
Errors:  STITCH_ERROR:{"message": ...}
"""

import sys
import json
import argparse

import numpy as np
import tifffile


def emit_error(message):
    print(f"STITCH_ERROR:{json.dumps({'message': message})}", flush=True)


def load_slice(path, index):
    """Load a single z-slice from a TIFF stack without reading the volume."""
    img = tifffile.imread(path, key=int(index))
    img = np.asarray(img)
    if img.ndim == 3:  # single-page read of an RGB/multi-sample image
        img = img[..., 0]
    return img


def to_alignment_image(img, mode):
    """Convert a slice into the representation phase correlation runs on."""
    if mode == 'labels':
        from skimage.segmentation import find_boundaries
        return find_boundaries(img.astype(np.int64), mode='thick').astype(np.float32)
    img = img.astype(np.float32)
    std = img.std()
    return (img - img.mean()) / (std + 1e-8)


def downsample(img, factor):
    """Block-mean downsample by an integer factor."""
    if factor <= 1:
        return img
    h, w = img.shape
    h2, w2 = (h // factor) * factor, (w // factor) * factor
    img = img[:h2, :w2]
    return img.reshape(h2 // factor, factor, w2 // factor, factor).mean(axis=(1, 3))


def phase_shift(fixed, moving):
    """Phase correlation: shift (dy, dx) that registers moving onto fixed."""
    from skimage.registration import phase_cross_correlation
    shift, error, _ = phase_cross_correlation(fixed, moving, normalization='phase')
    return float(shift[0]), float(shift[1]), float(error)


def overlap_score(fixed, moving, dy, dx):
    """Pearson correlation of the overlap after applying the shift."""
    dy_i, dx_i = int(round(dy)), int(round(dx))
    h, w = fixed.shape
    fy0, fy1 = max(0, dy_i), min(h, h + dy_i)
    fx0, fx1 = max(0, dx_i), min(w, w + dx_i)
    my0, my1 = max(0, -dy_i), min(h, h - dy_i)
    mx0, mx1 = max(0, -dx_i), min(w, w - dx_i)
    a = fixed[fy0:fy1, fx0:fx1].ravel()
    b = moving[my0:my1, mx0:mx1].ravel()
    if a.size < 100 or a.std() < 1e-8 or b.std() < 1e-8:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def refine_full_res(fixed, moving, dy, dx, window=1024):
    """Refine a coarse estimate on full-resolution central windows.

    Extracts corresponding windows (the moving one offset by the coarse
    estimate) and re-runs phase correlation; the residual adds onto the
    coarse shift.
    """
    h, w = fixed.shape
    win_h, win_w = min(window, h), min(window, w)
    cy, cx = h // 2, w // 2
    fy0 = int(np.clip(cy - win_h // 2, 0, h - win_h))
    fx0 = int(np.clip(cx - win_w // 2, 0, w - win_w))
    # The moving window that lands on the fixed window under the coarse shift
    my0 = int(np.clip(fy0 - round(dy), 0, moving.shape[0] - win_h))
    mx0 = int(np.clip(fx0 - round(dx), 0, moving.shape[1] - win_w))
    f_win = fixed[fy0:fy0 + win_h, fx0:fx0 + win_w]
    m_win = moving[my0:my0 + win_h, mx0:mx0 + win_w]
    r_dy, r_dx, _ = phase_shift(f_win, m_win)
    # Full shift = window placement difference + residual
    return (fy0 - my0) + r_dy, (fx0 - mx0) + r_dx


def main():
    parser = argparse.ArgumentParser(description='Stitch slice alignment (phase correlation)')
    parser.add_argument('--fixed', required=True, help='Fixed stack TIFF path')
    parser.add_argument('--fixed-slice', required=True, type=int)
    parser.add_argument('--moving', required=True, help='Moving stack TIFF path')
    parser.add_argument('--moving-slice', required=True, type=int)
    parser.add_argument('--mode', default='grayscale', choices=['grayscale', 'labels'])
    parser.add_argument('--max-dim', default=1024, type=int,
                        help='Downsample so the largest dimension is at most this')
    args = parser.parse_args()

    try:
        fixed = to_alignment_image(load_slice(args.fixed, args.fixed_slice), args.mode)
        moving = to_alignment_image(load_slice(args.moving, args.moving_slice), args.mode)

        if fixed.shape != moving.shape:
            # Phase correlation needs equal shapes; pad the smaller with zeros
            h = max(fixed.shape[0], moving.shape[0])
            w = max(fixed.shape[1], moving.shape[1])
            fp = np.zeros((h, w), dtype=np.float32)
            mp = np.zeros((h, w), dtype=np.float32)
            fp[:fixed.shape[0], :fixed.shape[1]] = fixed
            mp[:moving.shape[0], :moving.shape[1]] = moving
            fixed, moving = fp, mp

        factor = max(1, int(np.ceil(max(fixed.shape) / args.max_dim)))
        dy_c, dx_c, _ = phase_shift(downsample(fixed, factor), downsample(moving, factor))
        dy, dx = dy_c * factor, dx_c * factor

        if factor > 1:
            try:
                dy, dx = refine_full_res(fixed, moving, dy, dx)
            except Exception:
                pass  # keep the coarse estimate

        score = overlap_score(fixed, moving, dy, dx)

        print("STITCH_RESULT:" + json.dumps({
            "dx": round(float(dx), 2),
            "dy": round(float(dy), 2),
            "score": round(score, 4),
            "mode": args.mode,
            "downsampleFactor": factor,
        }), flush=True)

    except Exception as e:
        emit_error(str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()
