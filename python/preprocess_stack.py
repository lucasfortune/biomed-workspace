#!/usr/bin/env python3
"""
Stack preprocessing for the Preprocess module (ADR-008).

Fixed operation order (each optional):
    crop (xy rect, original coords) -> z-range trim -> flip h/v ->
    rotate90 -> downscale (mean binning) -> intensity
    (window/gamma/invert) -> output dtype conversion

Modes:
    info    - stack shape/dtype + sampled intensity histogram + percentiles
    preview - one slice with the intensity ops applied, saved as JPEG
    apply   - full streaming run with progress lines

stdout protocol (one JSON payload per line):
    PREPROCESS_INFO:{...}      (info mode)
    PREPROCESS_PROGRESS:{...}  (apply mode)
    PREPROCESS_RESULT:{...}    (preview + apply modes)
    PREPROCESS_ERROR:{"message": ...}
"""

import argparse
import json
import os
import sys

import numpy as np
import tifffile
from PIL import Image

HIST_BINS = 256
HIST_SAMPLE_SLICES = 5
HIST_MAX_DIM = 1024


# =============================================================================
# Shared helpers
# =============================================================================

def emit(prefix, payload):
    print(f"{prefix}:{json.dumps(payload)}", flush=True)


def fail(message):
    emit("PREPROCESS_ERROR", {"message": str(message)})
    sys.exit(1)


def stack_shape(tif):
    """(n_slices, height, width) for a 2D or 3D TIFF."""
    n_pages = len(tif.pages)
    shape = tif.series[0].shape if tif.series else tif.pages[0].shape
    if len(shape) == 2:
        # OME-TIFFs sometimes declare 2D despite multiple pages
        return (n_pages, shape[0], shape[1]) if n_pages > 1 else (1, shape[0], shape[1])
    if len(shape) == 3:
        return (int(shape[0]), int(shape[1]), int(shape[2]))
    raise ValueError(f"Unsupported image shape: {shape}")


def read_slice(tif, index):
    img = tif.pages[index].asarray()
    if img.ndim != 2:
        img = np.squeeze(img)
    if img.ndim != 2:
        raise ValueError(f"Slice {index} is not 2D (shape {img.shape})")
    return img


def normalize_ops(ops, n_slices, height, width):
    """Clamp and complete an ops dict; returns the effective ops."""
    ops = dict(ops or {})

    crop = ops.get("crop")
    if crop:
        x = int(np.clip(int(crop.get("x", 0)), 0, width - 1))
        y = int(np.clip(int(crop.get("y", 0)), 0, height - 1))
        w = int(np.clip(int(crop.get("width", width)), 1, width - x))
        h = int(np.clip(int(crop.get("height", height)), 1, height - y))
        ops["crop"] = {"x": x, "y": y, "width": w, "height": h}

    zr = ops.get("z_range")
    if zr:
        z0 = int(np.clip(int(zr[0]), 0, n_slices - 1))
        z1 = int(np.clip(int(zr[1]), z0 + 1, n_slices))
        ops["z_range"] = [z0, z1]

    ops["flip_h"] = bool(ops.get("flip_h"))
    ops["flip_v"] = bool(ops.get("flip_v"))
    ops["rotate90"] = int(ops.get("rotate90", 0)) % 4
    ops["downscale"] = max(1, int(ops.get("downscale", 1)))

    it = ops.get("intensity") or {}
    window = it.get("window")
    if window is not None:
        lo, hi = float(window[0]), float(window[1])
        if hi <= lo:
            hi = lo + 1.0
        window = [lo, hi]
    ops["intensity"] = {
        "window": window,
        "gamma": float(it.get("gamma", 1.0) or 1.0),
        "invert": bool(it.get("invert")),
    }

    out_dtype = ops.get("out_dtype", "keep")
    if out_dtype not in ("keep", "uint8", "uint16"):
        out_dtype = "keep"
    ops["out_dtype"] = out_dtype
    return ops


def intensity_active(ops):
    it = ops["intensity"]
    return it["window"] is not None or it["gamma"] != 1.0 or it["invert"]


def apply_geometry(img, ops):
    """crop -> flips -> rotate90 -> downscale, all in original-coords order."""
    crop = ops.get("crop")
    if crop:
        img = img[crop["y"]:crop["y"] + crop["height"],
                  crop["x"]:crop["x"] + crop["width"]]
    if ops["flip_h"]:
        img = img[:, ::-1]
    if ops["flip_v"]:
        img = img[::-1, :]
    if ops["rotate90"]:
        img = np.rot90(img, k=-ops["rotate90"])  # clockwise
    f = ops["downscale"]
    if f > 1:
        h, w = img.shape
        img = img[: (h // f) * f, : (w // f) * f]
        img = img.reshape(h // f, f, w // f, f).astype(np.float32).mean(axis=(1, 3))
    return img


def apply_intensity(img, ops, fallback_window):
    """Window/gamma/invert -> float32 in [0, 1]."""
    it = ops["intensity"]
    lo, hi = it["window"] if it["window"] is not None else fallback_window
    if hi <= lo:
        hi = lo + 1.0
    out = (img.astype(np.float32) - lo) / (hi - lo)
    np.clip(out, 0.0, 1.0, out=out)
    if it["gamma"] != 1.0:
        out = np.power(out, it["gamma"])
    if it["invert"]:
        out = 1.0 - out
    return out


def cast_output(norm01, out_dtype, in_dtype):
    """Scale a [0,1] float image to the requested output dtype."""
    if out_dtype == "uint8":
        return np.clip(np.round(norm01 * 255.0), 0, 255).astype(np.uint8)
    if out_dtype == "uint16":
        return np.clip(np.round(norm01 * 65535.0), 0, 65535).astype(np.uint16)
    # keep: integers get their full type range, floats stay [0,1] float32
    if np.issubdtype(in_dtype, np.integer):
        info = np.iinfo(in_dtype)
        return np.clip(np.round(norm01 * info.max), info.min, info.max).astype(in_dtype)
    return norm01.astype(np.float32)


# =============================================================================
# info mode
# =============================================================================

def run_info(args):
    with tifffile.TiffFile(args.input) as tif:
        n, h, w = stack_shape(tif)
        dtype = str(tif.pages[0].dtype)

        # Sample a few slices spread through the stack, spatially strided,
        # so the histogram is representative without loading the volume.
        idxs = sorted(set(int(round(i)) for i in
                          np.linspace(0, n - 1, min(HIST_SAMPLE_SLICES, n))))
        stride = max(1, int(np.ceil(max(h, w) / HIST_MAX_DIM)))
        samples = [read_slice(tif, i)[::stride, ::stride].ravel() for i in idxs]

    data = np.concatenate(samples).astype(np.float32)
    dmin, dmax = float(data.min()), float(data.max())
    hist_hi = dmax if dmax > dmin else dmin + 1.0
    counts, edges = np.histogram(data, bins=HIST_BINS, range=(dmin, hist_hi))
    pcts = [0.1, 1.0, 5.0, 95.0, 99.0, 99.9]
    pvals = np.percentile(data, pcts)

    emit("PREPROCESS_INFO", {
        "sliceCount": n, "width": w, "height": h, "dtype": dtype,
        "min": dmin, "max": dmax,
        "percentiles": {str(p): float(v) for p, v in zip(pcts, pvals)},
        "histogram": {
            "counts": [int(c) for c in counts],
            "binStart": float(edges[0]),
            "binWidth": float(edges[1] - edges[0]),
        },
        "sampledSlices": idxs,
    })


# =============================================================================
# preview mode
# =============================================================================

def run_preview(args):
    ops = json.loads(args.ops) if args.ops else {}
    with tifffile.TiffFile(args.input) as tif:
        n, h, w = stack_shape(tif)
        ops = normalize_ops(ops, n, h, w)
        index = int(np.clip(args.slice, 0, n - 1))
        img = read_slice(tif, index)

    # Preview shows intensity ops on the FULL original frame; the crop is
    # drawn client-side as an overlay and geometry ops apply on output only.
    fallback = (float(img.min()), float(img.max()))
    norm = apply_intensity(img, ops, fallback)
    out = np.clip(np.round(norm * 255.0), 0, 255).astype(np.uint8)

    pil = Image.fromarray(out)
    pil.thumbnail((args.size, args.size), Image.Resampling.LANCZOS)
    pil.save(args.output, "JPEG", quality=88)
    emit("PREPROCESS_RESULT", {
        "path": args.output, "slice": index,
        "previewWidth": pil.width, "previewHeight": pil.height,
        "sourceWidth": w, "sourceHeight": h,
    })


# =============================================================================
# apply mode
# =============================================================================

def global_window(tif, ops, z0, z1):
    """Global min/max over the kept, cropped region (streamed)."""
    lo, hi = np.inf, -np.inf
    crop = ops.get("crop")
    for i in range(z0, z1):
        img = read_slice(tif, i)
        if crop:
            img = img[crop["y"]:crop["y"] + crop["height"],
                      crop["x"]:crop["x"] + crop["width"]]
        lo = min(lo, float(img.min()))
        hi = max(hi, float(img.max()))
    return lo, (hi if hi > lo else lo + 1.0)


def run_apply(args):
    with open(args.config) as fh:
        config = json.load(fh)

    input_path = config["input_path"]
    output_path = config["output_path"]

    with tifffile.TiffFile(input_path) as tif:
        n, h, w = stack_shape(tif)
        in_dtype = tif.pages[0].dtype
        ops = normalize_ops(config, n, h, w)

        z0, z1 = ops.get("z_range") or [0, n]
        total = z1 - z0

        needs_norm = intensity_active(ops) or ops["out_dtype"] != "keep" \
            or ops["downscale"] > 1
        window = None
        if needs_norm:
            if ops["intensity"]["window"] is not None:
                window = ops["intensity"]["window"]
            else:
                emit("PREPROCESS_PROGRESS", {"status": "scanning", "total_slices": total})
                window = global_window(tif, ops, z0, z1)

        out_dtype = ops["out_dtype"]
        first = cast_output(
            apply_intensity(apply_geometry(read_slice(tif, z0), ops), ops, window),
            out_dtype, in_dtype
        ) if needs_norm else apply_geometry(read_slice(tif, z0), ops)
        out_h, out_w = first.shape

        # >2GB outputs need BigTIFF
        bytes_total = total * out_h * out_w * first.dtype.itemsize
        bigtiff = bytes_total > 2**31 - 2**16

        step = max(1, total // 100)
        with tifffile.TiffWriter(output_path, bigtiff=bigtiff) as writer:
            for k, i in enumerate(range(z0, z1)):
                if k == 0:
                    out = first
                else:
                    out = apply_geometry(read_slice(tif, i), ops)
                    if needs_norm:
                        out = cast_output(apply_intensity(out, ops, window),
                                          out_dtype, in_dtype)
                # contiguous=True: single-series stack (readers otherwise
                # see one series per page)
                writer.write(out, contiguous=True)
                if k % step == 0 or k == total - 1:
                    emit("PREPROCESS_PROGRESS", {
                        "current_slice": k + 1, "total_slices": total,
                        "progress_percent": round((k + 1) / total * 100, 1),
                    })

    emit("PREPROCESS_RESULT", {
        "output_path": output_path,
        "slices": total, "width": out_w, "height": out_h,
        "dtype": str(first.dtype),
        "size": os.path.getsize(output_path),
        "window": list(window) if window else None,
        "crop": ops.get("crop"),
        "z_range": [z0, z1],
        "downscale": ops["downscale"],
    })


# =============================================================================
# main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Stack preprocessing (ADR-008)")
    parser.add_argument("--mode", required=True, choices=["info", "preview", "apply"])
    parser.add_argument("--input", help="Input TIFF (info/preview modes)")
    parser.add_argument("--slice", type=int, default=0, help="Slice index (preview)")
    parser.add_argument("--ops", help="Ops JSON string (preview)")
    parser.add_argument("--output", help="Output JPEG path (preview)")
    parser.add_argument("--size", type=int, default=768, help="Preview max dim")
    parser.add_argument("--config", help="Config JSON file (apply)")
    args = parser.parse_args()

    try:
        if args.mode == "info":
            if not args.input:
                raise ValueError("--input is required for info mode")
            run_info(args)
        elif args.mode == "preview":
            if not (args.input and args.output):
                raise ValueError("--input and --output are required for preview mode")
            run_preview(args)
        else:
            if not args.config:
                raise ValueError("--config is required for apply mode")
            run_apply(args)
    except Exception as e:
        fail(e)


if __name__ == "__main__":
    main()
