#!/usr/bin/env python3
"""
Segmentation cleanup & quantification for the segcleanup module (ADR-009).

Automated cleanup pipeline, fixed order (each optional):
    merge/relabel classes -> fill holes (2d/3d) -> remove small
    components (3D) -> smooth boundaries (2D open+close per slice)

Modes:
    info        - classes + counts + shape/dtype
    preview     - one slice with the ops applied (2D approximation),
                  rendered as a colored PNG with optional grayscale underlay
    apply       - full-volume pipeline + quantification
    quantify    - quantification only
    label-slice - one slice's raw label values as an L-mode PNG
    edit-save   - original stack + edited slices (annotation encodings)
                  -> new TIFF

stdout protocol (one JSON payload per line):
    SEGCLEANUP_INFO:{...}
    SEGCLEANUP_PROGRESS:{...}
    SEGCLEANUP_RESULT:{...}
    SEGCLEANUP_ERROR:{"message": ...}

All ops preserve the uint8/uint16 label dtype. Fill and smoothing never
overwrite foreground of other classes; only background (0) is claimed.
"""

import argparse
import base64
import csv
import json
import os
import sys

import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage
from skimage import measure

# Distinct display palette for label values (client uses the same order)
PALETTE = [
    (231, 76, 60), (46, 204, 113), (52, 152, 219), (241, 196, 15),
    (155, 89, 182), (230, 126, 34), (26, 188, 156), (233, 30, 99),
    (149, 165, 166), (127, 140, 141), (0, 121, 107), (103, 58, 183),
]


def emit(prefix, payload):
    print(f"{prefix}:{json.dumps(payload)}", flush=True)


def fail(message):
    emit("SEGCLEANUP_ERROR", {"message": str(message)})
    sys.exit(1)


def load_stack(path):
    data = tifffile.imread(path)
    if data.ndim == 2:
        data = data[np.newaxis, ...]
    if data.ndim != 3:
        raise ValueError(f"Expected a 2D/3D label stack, got shape {data.shape}")
    if not np.issubdtype(data.dtype, np.integer):
        raise ValueError(f"Label stacks must be integer-typed, got {data.dtype}")
    return data


def class_values(data):
    return [int(v) for v in np.unique(data) if v != 0]


def color_for(value):
    return PALETTE[(int(value) - 1) % len(PALETTE)]


# =============================================================================
# Cleanup ops
# =============================================================================

def normalize_ops(ops):
    ops = dict(ops or {})
    merge_map = {}
    for k, v in (ops.get("merge_map") or {}).items():
        merge_map[int(k)] = int(v)
    ops["merge_map"] = merge_map
    fill = ops.get("fill_holes", "off")
    ops["fill_holes"] = fill if fill in ("off", "2d", "3d") else "off"
    ops["min_size"] = max(0, int(ops.get("min_size", 0) or 0))
    ops["smooth_radius"] = max(0, int(ops.get("smooth_radius", 0) or 0))
    return ops


def apply_merge(data, merge_map):
    """Relabel via lookup table (uint8/uint16 label ranges are small)."""
    if not merge_map:
        return data
    lut = np.arange(int(data.max()) + 1, dtype=data.dtype)
    for src, dst in merge_map.items():
        if src < len(lut):
            lut[src] = dst
    return lut[data]


def smooth_mask_2d(mask, radius):
    """
    Majority (median) filter boundary smoothing: removes protrusions and
    fills notches up to ~radius px symmetrically. Chosen over
    morphological open+close, which misses single-pixel spikes attached
    to flat edges (the pixel below a spike survives erosion).
    """
    size = 2 * radius + 1
    return ndimage.median_filter(mask.astype(np.uint8), size=size) > 0


def apply_ops_slice(sl, ops):
    """2D approximation of the pipeline for previews (single slice)."""
    out = apply_merge(sl, ops["merge_map"])
    result = out.copy()
    for value in class_values(out):
        mask = out == value
        if ops["fill_holes"] != "off":
            filled = ndimage.binary_fill_holes(mask)
            # claim only background
            result[(filled & ~mask) & (result == 0)] = value
            mask = (result == value)
        if ops["min_size"] > 0:
            labeled, n = ndimage.label(mask)
            if n:
                sizes = np.bincount(labeled.ravel())
                small = np.flatnonzero(sizes < ops["min_size"])
                small = small[small != 0]
                if small.size:
                    result[np.isin(labeled, small)] = 0
                    mask = (result == value)
        if ops["smooth_radius"] > 0:
            smoothed = smooth_mask_2d(mask, ops["smooth_radius"])
            result[mask & ~smoothed] = 0
            result[(smoothed & ~mask) & (result == 0)] = value
    return result


def apply_ops_volume(data, ops, progress=None):
    """Full pipeline on the whole volume (in memory)."""
    def report(stage, frac):
        if progress:
            progress(stage, frac)

    data = apply_merge(data, ops["merge_map"])
    result = data.copy()
    values = class_values(data)
    n_stages = sum([
        ops["fill_holes"] != "off",
        ops["min_size"] > 0,
        ops["smooth_radius"] > 0,
    ]) * max(1, len(values))
    stage_i = 0

    for value in values:
        mask = result == value

        if ops["fill_holes"] == "3d":
            filled = ndimage.binary_fill_holes(mask)
            result[(filled & ~mask) & (result == 0)] = value
            mask = result == value
            stage_i += 1
            report(f"fill holes (class {value})", stage_i / max(1, n_stages))
        elif ops["fill_holes"] == "2d":
            for z in range(mask.shape[0]):
                filled = ndimage.binary_fill_holes(mask[z])
                sl = result[z]
                sl[(filled & ~mask[z]) & (sl == 0)] = value
            mask = result == value
            stage_i += 1
            report(f"fill holes (class {value})", stage_i / max(1, n_stages))

        if ops["min_size"] > 0:
            labeled, n = ndimage.label(mask)
            if n:
                sizes = np.bincount(labeled.ravel())
                small = np.flatnonzero(sizes < ops["min_size"])
                small = small[small != 0]
                if small.size:
                    result[np.isin(labeled, small)] = 0
                    mask = result == value
            stage_i += 1
            report(f"remove small components (class {value})", stage_i / max(1, n_stages))

        if ops["smooth_radius"] > 0:
            for z in range(mask.shape[0]):
                smoothed = smooth_mask_2d(mask[z], ops["smooth_radius"])
                sl = result[z]
                sl[mask[z] & ~smoothed] = 0
                sl[(smoothed & ~mask[z]) & (sl == 0)] = value
            stage_i += 1
            report(f"smooth boundaries (class {value})", stage_i / max(1, n_stages))

    return result


# =============================================================================
# Rendering
# =============================================================================

def render_labels_png(sl, output_path, underlay=None, alpha=0.55):
    """Colored label overlay (optionally over a grayscale underlay)."""
    h, w = sl.shape
    if underlay is not None:
        u = underlay.astype(np.float32)
        lo, hi = float(u.min()), float(u.max())
        u = (u - lo) / (hi - lo) if hi > lo else np.zeros_like(u)
        rgb = np.stack([u, u, u], axis=-1)
    else:
        rgb = np.zeros((h, w, 3), dtype=np.float32)

    for value in class_values(sl):
        mask = sl == value
        color = np.array(color_for(value), dtype=np.float32) / 255.0
        a = alpha if underlay is not None else 1.0
        rgb[mask] = rgb[mask] * (1 - a) + color * a

    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(
        output_path, "PNG")


# =============================================================================
# Quantification
# =============================================================================

def quantify_volume(data, voxel_size=None, surface_area=True):
    """
    Per-class metrics. voxel_size = (x, y, z, unit) or None.
    Returns (metrics dict, per-object rows).
    """
    vx = None
    if voxel_size and voxel_size.get("x") and voxel_size.get("y") \
            and voxel_size.get("z"):
        vx = float(voxel_size["x"]) * float(voxel_size["y"]) * float(voxel_size["z"])
    unit = (voxel_size or {}).get("unit") or "um"

    classes = []
    objects = []
    for value in class_values(data):
        mask = data == value
        voxels = int(mask.sum())
        labeled, n = ndimage.label(mask)
        sizes = np.bincount(labeled.ravel())[1:] if n else np.array([], dtype=int)

        entry = {
            "class": value,
            "voxels": voxels,
            "components": int(n),
            "component_voxels": {
                "min": int(sizes.min()) if n else 0,
                "median": float(np.median(sizes)) if n else 0,
                "mean": float(sizes.mean()) if n else 0,
                "max": int(sizes.max()) if n else 0,
            },
        }
        if vx:
            entry["volume"] = voxels * vx
            entry["volume_unit"] = f"{unit}^3"

        if surface_area and voxels > 0:
            spacing = (float(voxel_size["z"]), float(voxel_size["y"]),
                       float(voxel_size["x"])) if vx else (1.0, 1.0, 1.0)
            try:
                padded = np.pad(mask, 1).astype(np.uint8)
                verts, faces, _, _ = measure.marching_cubes(
                    padded, level=0.5, spacing=spacing)
                entry["surface_area"] = float(measure.mesh_surface_area(verts, faces))
                entry["surface_area_unit"] = f"{unit}^2" if vx else "px^2"
            except Exception:
                entry["surface_area"] = None
        classes.append(entry)

        for i in range(1, n + 1):
            row = {"class": value, "object": i, "voxels": int(sizes[i - 1])}
            if vx:
                row["volume"] = sizes[i - 1] * vx
            objects.append(row)

    metrics = {
        "shape": list(data.shape),
        "total_voxels": int(data.size),
        "background_voxels": int((data == 0).sum()),
        "voxel_size": voxel_size,
        "classes": classes,
    }
    return metrics, objects


def write_reports(metrics, objects, output_dir):
    with open(os.path.join(output_dir, "metrics.json"), "w") as fh:
        json.dump(metrics, fh, indent=2)

    vx = metrics.get("voxel_size")
    has_physical = any("volume" in c for c in metrics["classes"])
    unit = (vx or {}).get("unit") or "um"

    report_path = os.path.join(output_dir, "report.csv")
    with open(report_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        header = ["class", "voxels", "components",
                  "component_voxels_min", "component_voxels_median",
                  "component_voxels_mean", "component_voxels_max"]
        if has_physical:
            header += [f"volume_{unit}3"]
        header += ["surface_area" + (f"_{unit}2" if has_physical else "_px2")]
        writer.writerow(header)
        for c in metrics["classes"]:
            row = [c["class"], c["voxels"], c["components"],
                   c["component_voxels"]["min"], c["component_voxels"]["median"],
                   round(c["component_voxels"]["mean"], 2), c["component_voxels"]["max"]]
            if has_physical:
                row.append(round(c.get("volume", 0), 6))
            sa = c.get("surface_area")
            row.append(round(sa, 6) if sa is not None else "")
            writer.writerow(row)

    objects_path = os.path.join(output_dir, "objects.csv")
    with open(objects_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        header = ["class", "object", "voxels"]
        if has_physical:
            header.append(f"volume_{unit}3")
        writer.writerow(header)
        for o in objects:
            row = [o["class"], o["object"], o["voxels"]]
            if has_physical:
                row.append(round(o.get("volume", 0), 6))
            writer.writerow(row)

    return report_path, objects_path


# =============================================================================
# Edited-slice decoding (annotation module encodings)
# =============================================================================

def decode_sparse(b64_data, width, height):
    """5 bytes per pixel: x u16le, y u16le, classId u8."""
    raw = base64.b64decode(b64_data)
    arr = np.zeros((height, width), dtype=np.uint8)
    if len(raw) % 5 != 0:
        raise ValueError("Sparse data length is not a multiple of 5")
    buf = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 5)
    x = buf[:, 0].astype(np.uint32) | (buf[:, 1].astype(np.uint32) << 8)
    y = buf[:, 2].astype(np.uint32) | (buf[:, 3].astype(np.uint32) << 8)
    valid = (x < width) & (y < height)
    arr[y[valid], x[valid]] = buf[valid, 4]
    return arr


def decode_dense(b64_data, width, height):
    raw = base64.b64decode(b64_data)
    if len(raw) != width * height:
        raise ValueError(f"Dense data length {len(raw)} != {width * height}")
    return np.frombuffer(raw, dtype=np.uint8).reshape(height, width).copy()


# =============================================================================
# Modes
# =============================================================================

def run_info(args):
    data = load_stack(args.input)
    values, counts = np.unique(data, return_counts=True)
    emit("SEGCLEANUP_INFO", {
        "sliceCount": int(data.shape[0]),
        "height": int(data.shape[1]),
        "width": int(data.shape[2]),
        "dtype": str(data.dtype),
        "classes": [
            {"value": int(v), "voxels": int(c),
             "color": "#%02x%02x%02x" % color_for(v)}
            for v, c in zip(values, counts) if v != 0
        ],
        "backgroundVoxels": int(counts[values == 0][0]) if 0 in values else 0,
    })


def run_preview(args):
    ops = normalize_ops(json.loads(args.ops) if args.ops else {})
    data = load_stack(args.input)
    index = int(np.clip(args.slice, 0, data.shape[0] - 1))
    sl = apply_ops_slice(data[index], ops)

    underlay = None
    if args.underlay:
        u = tifffile.imread(args.underlay)
        if u.ndim == 2:
            u = u[np.newaxis, ...]
        ui = min(index, u.shape[0] - 1)
        if u.shape[1:] == sl.shape:
            underlay = u[ui]

    render_labels_png(sl, args.output, underlay=underlay)
    emit("SEGCLEANUP_RESULT", {"path": args.output, "slice": index})


def run_apply(args):
    with open(args.config) as fh:
        config = json.load(fh)
    ops = normalize_ops(config.get("ops"))
    data = load_stack(config["input_path"])

    def progress(stage, frac):
        emit("SEGCLEANUP_PROGRESS", {
            "stage": stage, "progress_percent": round(frac * 70, 1)})

    emit("SEGCLEANUP_PROGRESS", {"stage": "loading", "progress_percent": 0})
    result = apply_ops_volume(data, ops, progress=progress)

    output_path = config["output_path"]
    bigtiff = result.nbytes > 2**31 - 2**16
    tifffile.imwrite(output_path, result, bigtiff=bigtiff)
    emit("SEGCLEANUP_PROGRESS", {"stage": "quantifying", "progress_percent": 75})

    metrics, objects = quantify_volume(result, config.get("voxel_size"))
    write_reports(metrics, objects, os.path.dirname(output_path))

    emit("SEGCLEANUP_RESULT", {
        "output_path": output_path,
        "slices": int(result.shape[0]),
        "height": int(result.shape[1]),
        "width": int(result.shape[2]),
        "dtype": str(result.dtype),
        "size": os.path.getsize(output_path),
        "metrics": metrics,
    })


def run_quantify(args):
    voxel_size = json.loads(args.voxel_size) if args.voxel_size else None
    data = load_stack(args.input)
    emit("SEGCLEANUP_PROGRESS", {"stage": "quantifying", "progress_percent": 10})
    metrics, objects = quantify_volume(data, voxel_size)
    os.makedirs(args.output_dir, exist_ok=True)
    write_reports(metrics, objects, args.output_dir)
    emit("SEGCLEANUP_RESULT", {"output_dir": args.output_dir, "metrics": metrics})


def run_label_slice(args):
    data = load_stack(args.input)
    index = int(np.clip(args.slice, 0, data.shape[0] - 1))
    sl = data[index]
    if sl.max() > 255:
        raise ValueError("Label values above 255 are not supported for editing")
    Image.fromarray(sl.astype(np.uint8), mode="L").save(args.output, "PNG")
    emit("SEGCLEANUP_RESULT", {
        "path": args.output, "slice": index,
        "width": int(sl.shape[1]), "height": int(sl.shape[0]),
    })


def run_edit_save(args):
    with open(args.config) as fh:
        config = json.load(fh)

    edits = config.get("edits") or {}
    width = int(config["width"])
    height = int(config["height"])

    with tifffile.TiffFile(config["input_path"]) as tif:
        n = len(tif.pages)
        dtype = tif.pages[0].dtype
        total = n
        with tifffile.TiffWriter(config["output_path"],
                                 bigtiff=n * width * height * dtype.itemsize > 2**31 - 2**16) as writer:
            for i in range(n):
                key = str(i)
                if key in edits:
                    e = edits[key]
                    if e.get("encoding") == "sparse":
                        sl = decode_sparse(e["data"], width, height)
                    else:
                        sl = decode_dense(e["data"], width, height)
                    sl = sl.astype(dtype)
                else:
                    sl = tif.pages[i].asarray()
                writer.write(sl, contiguous=True)
                if i % max(1, total // 50) == 0 or i == total - 1:
                    emit("SEGCLEANUP_PROGRESS", {
                        "current_slice": i + 1, "total_slices": total,
                        "progress_percent": round((i + 1) / total * 100, 1)})

    emit("SEGCLEANUP_RESULT", {
        "output_path": config["output_path"],
        "slices": n, "width": width, "height": height,
        "editedSlices": len(edits),
        "size": os.path.getsize(config["output_path"]),
    })


def main():
    parser = argparse.ArgumentParser(description="Segmentation cleanup (ADR-009)")
    parser.add_argument("--mode", required=True,
                        choices=["info", "preview", "apply", "quantify",
                                 "label-slice", "edit-save"])
    parser.add_argument("--input")
    parser.add_argument("--slice", type=int, default=0)
    parser.add_argument("--ops", help="Ops JSON string (preview)")
    parser.add_argument("--underlay", help="Grayscale underlay TIFF (preview)")
    parser.add_argument("--output", help="Output image path (preview/label-slice)")
    parser.add_argument("--output-dir", help="Output directory (quantify)")
    parser.add_argument("--voxel-size", help="Voxel size JSON (quantify)")
    parser.add_argument("--config", help="Config JSON file (apply/edit-save)")
    args = parser.parse_args()

    try:
        if args.mode == "info":
            run_info(args)
        elif args.mode == "preview":
            run_preview(args)
        elif args.mode == "apply":
            run_apply(args)
        elif args.mode == "quantify":
            run_quantify(args)
        elif args.mode == "label-slice":
            run_label_slice(args)
        else:
            run_edit_save(args)
    except Exception as e:
        fail(e)


if __name__ == "__main__":
    main()
