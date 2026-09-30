#!/usr/bin/env python3
"""
Tiled inference with a bioimage.io model (ADR-015)

Runs a model from the bioimage.io zoo (or an uploaded package) on a TIFF
stack through bioimageio.core's blocked prediction and writes a uint8
class map plus a metadata JSON. Output layout and stdout protocol match
run_inference.py so the Node side tracks both the same way:

    INFERENCE_PROGRESS:{"type": "init", "device": ..., "gpuAvailable": ...}
    INFERENCE_PROGRESS:{"type": "download"}            (weights being fetched)
    INFERENCE_PROGRESS:{"current_slice": n, "total_slices": N, ...}
    FINAL_RESULT:{"success": true, "output_path": ..., "metadata_path": ..., "metrics": ...}

2D models run slice by slice (progress per slice). 3D models take the
whole stack as one sample (progress per block).
"""

import argparse
import json
import os
import sys
import time

# The library's per-block progress bars write to stderr; the Node side keeps
# stderr as the failure message, so keep it clean.
os.environ.setdefault("TQDM_DISABLE", "1")

import numpy as np
import tifffile
import torch

from tiff_validation_utils import safe_imread
from bioimageio_utils import (
    MAX_3D_VOXELS, choose_ns, load_ready, summarise, to_class_map,
)


def emit_progress(payload):
    print("INFERENCE_PROGRESS:" + json.dumps(payload), flush=True)


def emit_final(result):
    print("FINAL_RESULT:" + json.dumps(result), flush=True)
    print("=" * 50, flush=True)
    print("BACKUP_JSON_START", flush=True)
    print(json.dumps(result, indent=2), flush=True)
    print("BACKUP_JSON_END", flush=True)
    print("=" * 50, flush=True)


def make_sample(descr, array, sample_id):
    """Wrap a numpy array shaped like the model's input axes into a Sample."""
    from bioimageio.core import Sample, Tensor
    from bioimageio.core.axis import AxisId
    from bioimageio.spec.model.v0_5 import TensorId
    inp = descr.inputs[0]
    dims = tuple(AxisId(str(a.id)) for a in inp.axes)
    tensor = Tensor.from_numpy(array, dims=dims)
    return Sample(members={TensorId(str(inp.id)): tensor}, stat={}, id=sample_id)


def shape_for_input(descr, spatial):
    """Build the input array shape following the model's axis order."""
    from bioimageio.spec.model import v0_5
    inp = descr.inputs[0]
    shape = []
    spatial_iter = iter(spatial)
    for a in inp.axes:
        if isinstance(a, v0_5.BatchAxis):
            shape.append(1)
        elif isinstance(a, v0_5.ChannelAxis):
            shape.append(1)
        elif isinstance(a, v0_5.SpaceInputAxis):
            shape.append(next(spatial_iter))
        else:
            shape.append(1)
    return tuple(shape)


def output_to_channels_first(descr, sample):
    """Return the output as a (channel, [z], y, x) float32 numpy array."""
    from bioimageio.spec.model import v0_5
    from bioimageio.spec.model.v0_5 import TensorId
    out = descr.outputs[0]
    tensor = sample.members[TensorId(str(out.id))]
    data = tensor.data  # xarray DataArray
    dims = list(data.dims)
    batch_ids = [str(a.id) for a in out.axes if isinstance(a, v0_5.BatchAxis)]
    channel_ids = [str(a.id) for a in out.axes if isinstance(a, v0_5.ChannelAxis)]
    space_ids = [str(a.id) for a in out.axes
                 if isinstance(a, v0_5.SpaceAxisBase) and not isinstance(a, v0_5.SpaceInputAxis)]
    for b in batch_ids:
        if b in dims:
            data = data.isel({b: 0})
    order = [c for c in channel_ids if c in data.dims] + [s for s in space_ids if s in data.dims]
    data = data.transpose(*order)
    arr = np.asarray(data.values, dtype=np.float32)
    if not channel_ids or channel_ids[0] not in dims:
        arr = arr[None]
    return arr


def predict_blocked(pipeline, sample, ns, on_block):
    """Blocked prediction with a per-block progress callback."""
    total, intermediates = pipeline.predict_sample_with_blocking_yield_intermediates(sample, ns=ns)
    last = None
    done = 0
    for last in intermediates:
        done += 1
        on_block(done, total)
    if last is None:
        raise RuntimeError("No blocks were predicted")
    return last.sample, total


def run(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    emit_progress({"type": "init", "device": str(device), "gpuAvailable": torch.cuda.is_available()})

    print(f"Loading model description: {args.model}", flush=True)
    descr, info = load_ready(args.model)
    summary = summarise(descr, info, args.model)
    print(f"Model: {summary['name']} ({summary['dims']}D, {summary['output']['channels']} output channel(s), "
          f"{summary['weight_format']})", flush=True)
    for note in summary["notes"]:
        print(f"Note: {note}", flush=True)

    print(f"Loading input data from: {args.input}", flush=True)
    stack = safe_imread(args.input)
    if stack.ndim == 2:
        stack = stack[None]
    if stack.ndim != 3:
        raise ValueError(f"Expected a 2D image or 3D stack, got shape {stack.shape}")
    num_slices, height, width = stack.shape
    print(f"Input shape: {stack.shape} ({stack.dtype})", flush=True)

    conversion = args.conversion or summary["default_conversion"]
    threshold = float(args.threshold)

    emit_progress({"type": "download"})
    t0 = time.time()
    from bioimageio.core import create_prediction_pipeline
    pipeline = create_prediction_pipeline(
        descr, weight_format=info["weight_format"], devices=[str(device)]
    )
    print(f"Prediction pipeline ready in {time.time() - t0:.1f}s", flush=True)

    segmented = np.zeros((num_slices, height, width), dtype=np.uint8)
    classes = []
    block_info = {}

    with pipeline:
        if summary["dims"] == 2:
            ns = choose_ns(descr, (height, width))
            block_info = {"mode": "per-slice", "ns": ns}
            for z in range(num_slices):
                arr = stack[z].astype(np.float32).reshape(shape_for_input(descr, (height, width)))
                sample = make_sample(descr, arr, f"slice{z}")
                out_sample, n_blocks = predict_blocked(pipeline, sample, ns, lambda d, t: None)
                block_info["blocks_per_slice"] = n_blocks
                probs = output_to_channels_first(descr, out_sample)
                class_map, classes = to_class_map(probs, conversion, threshold)
                segmented[z] = class_map
                emit_progress({
                    "current_slice": z + 1,
                    "total_slices": num_slices,
                    "progress_percent": round((z + 1) / num_slices * 100, 1),
                    "inference_id": args.inference_id,
                })
        else:
            voxels = num_slices * height * width
            if voxels > MAX_3D_VOXELS:
                raise ValueError(
                    f"Stack has {voxels / 1e9:.2f} G voxels; 3D models are limited to "
                    f"{MAX_3D_VOXELS / 1e9:.1f} G voxels per run. Crop or downsample the stack first."
                )
            ns = choose_ns(descr, (num_slices, height, width))
            block_info = {"mode": "whole-stack", "ns": ns}
            arr = stack.astype(np.float32).reshape(shape_for_input(descr, (num_slices, height, width)))
            sample = make_sample(descr, arr, "stack")

            def on_block(done, total):
                emit_progress({
                    "current_slice": done,
                    "total_slices": total,
                    "unit": "blocks",
                    "progress_percent": round(done / total * 100, 1),
                    "inference_id": args.inference_id,
                })

            out_sample, n_blocks = predict_blocked(pipeline, sample, ns, on_block)
            block_info["blocks"] = n_blocks
            probs = output_to_channels_first(descr, out_sample)
            class_map, classes = to_class_map(probs, conversion, threshold)
            if class_map.shape != segmented.shape:
                raise RuntimeError(f"Model output shape {class_map.shape} does not match input {segmented.shape}")
            segmented[:] = class_map

    # Save results (same layout as run_inference.py)
    output_dir = os.path.dirname(args.output)
    os.makedirs(output_dir, exist_ok=True)
    inference_id = args.inference_id or "unknown"
    output_path = os.path.join(output_dir, f"segmentation_inference_{inference_id}.tif")
    metadata_path = os.path.join(output_dir, f"segmentation_inference_{inference_id}_metadata.json")
    tifffile.imwrite(output_path, segmented)
    print(f"Segmentation saved to: {output_path}", flush=True)

    unique, counts = np.unique(segmented, return_counts=True)
    total = int(segmented.size)
    metrics = {"total_pixels": total, "class_distribution": {
        int(u): {"pixel_count": int(c), "percentage": round(c / total * 100, 2)} for u, c in zip(unique, counts)
    }}
    metadata = {
        "input_file": str(args.input),
        "output_file": str(output_path),
        "input_shape": list(segmented.shape),
        "model_config": {
            "type": "bioimageio",
            "id": summary["id"],
            "name": summary["name"],
            "version": summary["version"],
            "source": summary["source"],
            "weight_format": summary["weight_format"],
            "license": summary["license"],
            "cite": summary["cite"],
            "num_classes": len(classes) + (1 if conversion == "per_channel" or summary["output"]["channels"] == 1 else 0),
        },
        "conversion": {"rule": conversion, "threshold": threshold, "classes": classes},
        "tiling": {**block_info, "halo": summary["output"]["halo"], "notes": summary["notes"]},
        "device": str(device),
        "metrics": metrics,
    }
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to: {metadata_path}", flush=True)

    return {
        "success": True,
        "output_path": output_path,
        "metadata_path": metadata_path,
        "metrics": metrics,
    }


def main():
    parser = argparse.ArgumentParser(description="Tiled inference with a bioimage.io model")
    parser.add_argument("--model", required=True, help="Zoo id, DOI, URL, package zip or rdf.yaml")
    parser.add_argument("--input", required=True, help="Input TIFF stack")
    parser.add_argument("--output", required=True, help="Output path (directory part is used)")
    parser.add_argument("--inference_id", default=None)
    parser.add_argument("--conversion", choices=["argmax", "per_channel"], default=None,
                        help="Output to class map rule (default: model dependent)")
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        result = run(args)
        print("Inference completed successfully!", flush=True)
        emit_final(result)
    except Exception as e:  # noqa: BLE001
        # The library wraps import failures ("Failed to import unet.py"); the
        # useful part is the cause, so include the chain in the message.
        message = f"{type(e).__name__}: {e}"
        cause = e.__cause__ or e.__context__
        seen = 0
        while cause is not None and seen < 3:
            message += f" ({type(cause).__name__}: {cause})"
            cause = cause.__cause__ or cause.__context__
            seen += 1
        print(f"Error during inference: {message}", file=sys.stderr, flush=True)
        emit_final({"success": False, "error": message})
        sys.exit(1)


if __name__ == "__main__":
    main()
