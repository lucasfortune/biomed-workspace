#!/usr/bin/env python3
"""
Export a workspace U-Net checkpoint as a bioimage.io model package (ADR-016).

    python/export_bioimageio.py --model best_model.pth --sample raw.tif \
        --output_dir <dir> --name "My model" --license CC-BY-4.0 \
        --author "Jane Doe" [--meta '{"training_id": ..., ...}']

The package (format 0.5) contains: rdf.yaml, unet.py (architecture),
weights.pt (state dict), weights_torchscript.pt (traced), test_input.npy /
test_output.npy, cover.png and README.md. The input axis is parametrised
(min M, step 2^layers), the output declares a halo and a softmax
postprocessing, so the phase-1 tiled path defaults to argmax.

Progress lines: BIOIMAGEIO_PROGRESS:{"stage": ...}
Result line:    BIOIMAGEIO_RESULT:{...}   or   BIOIMAGEIO_ERROR:{"message": ...}
"""

import argparse
import json
import os
import re
import shutil
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("TQDM_DISABLE", "1")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import torch  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiff_validation_utils import safe_imread  # noqa: E402
from unet_arch import UNet  # noqa: E402

TEST_EDGE = 256          # preferred test-tensor edge (crop of the sample image)
MIN_EDGE = 64            # smallest declared input edge (rounded up to the step)
HALO_PER_LEVEL = 4       # halo = HALO_PER_LEVEL * 2^num_layers (E3)
LICENSES = ["CC-BY-4.0", "MIT", "BSD-3-Clause", "CC0-1.0"]
TAGS = ["segmentation", "unet", "2d", "electron-microscopy", "biomed-workspace"]


def progress(stage, **extra):
    print("BIOIMAGEIO_PROGRESS:" + json.dumps({"stage": stage, **extra}), flush=True)


def fail(error):
    """Print a one-line error; pydantic validation errors list each field."""
    if hasattr(error, "errors"):
        try:
            parts = [f"{'.'.join(str(x) for x in e.get('loc', ()))}: {e.get('msg', '')}" for e in error.errors()]
            message = "Invalid model description (" + "; ".join(parts)[:600] + ")"
        except Exception:  # noqa: BLE001
            message = str(error).splitlines()[0]
    else:
        message = str(error).splitlines()[0] if str(error) else "export failed"
    print("BIOIMAGEIO_ERROR:" + json.dumps({"message": message}), flush=True)
    sys.exit(1)


def slugify(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60] or "workspace-unet"


# ---------------------------------------------------------------------------
# checkpoint
# ---------------------------------------------------------------------------

def load_checkpoint(model_path):
    """Load a workspace checkpoint with weights_only=True only (no pickled code)."""
    # Workspace checkpoints store val_dice as a numpy scalar and the torch
    # version as a TorchVersion; allow exactly those, nothing else.
    from torch.torch_version import TorchVersion
    safe = [np.core.multiarray.scalar, np.dtype, TorchVersion] + [
        getattr(np.dtypes, n) for n in ("Float32DType", "Float64DType") if hasattr(np, "dtypes") and hasattr(np.dtypes, n)]
    try:
        with torch.serialization.safe_globals(safe):
            checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    except Exception as e:  # noqa: BLE001
        first = str(e).splitlines()[0] if str(e) else ""
        first = first.split(" In PyTorch")[0].split(". Re-running")[0].strip()
        raise ValueError(f"Model file is not a workspace checkpoint that loads with weights_only ({first or type(e).__name__})")
    if not isinstance(checkpoint, dict):
        raise ValueError("Model file is not a workspace checkpoint dictionary")
    state = checkpoint.get("model_state_dict", checkpoint)
    if not isinstance(state, dict) or "final_conv.weight" not in state:
        raise ValueError("Model file does not contain a workspace U-Net state dict")
    return checkpoint, state


def config_from_state(state):
    """Derive features / num_layers / in_channels / num_classes from the state dict."""
    w0 = state["encoder_layers.0.0.weight"]
    features, in_channels = int(w0.shape[0]), int(w0.shape[1])
    encoder_indices = {int(k.split(".")[1]) for k in state if k.startswith("encoder_layers.")}
    num_layers = len(encoder_indices)
    num_classes = int(state["final_conv.weight"].shape[0])
    return {"features": features, "num_layers": num_layers,
            "in_channels": in_channels, "num_classes": num_classes}


def build_model(checkpoint, state):
    derived = config_from_state(state)
    cfg = checkpoint.get("model_config") if isinstance(checkpoint.get("model_config"), dict) else {}
    model_config = {**derived, **{k: int(v) for k, v in cfg.items() if k in derived}}
    if model_config != derived:
        raise ValueError(f"model_config {cfg} does not match the weights {derived}")
    if model_config["in_channels"] != 1:
        raise ValueError("Only single-channel models can be exported")
    model = UNet(**model_config)
    model.load_state_dict(state)
    model.eval()
    return model, model_config


# ---------------------------------------------------------------------------
# sample / test tensors
# ---------------------------------------------------------------------------

def read_sample_slice(sample_path):
    data = safe_imread(sample_path)
    arr = np.asarray(data)
    if arr.ndim == 3:
        arr = arr[arr.shape[0] // 2]
    if arr.ndim != 2:
        raise ValueError(f"Sample image must be a 2D image or a 3D stack, got shape {arr.shape}")
    return arr


def centre_crop(arr, edge):
    h, w = arr.shape
    top, left = (h - edge) // 2, (w - edge) // 2
    return arr[top:top + edge, left:left + edge]


def min_max(x, eps=1e-6):
    x = x.astype(np.float32)
    lo, hi = float(x.min()), float(x.max())
    return (x - lo) / (hi - lo + eps)


def make_test_tensors(model, sample_slice, step, min_edge):
    h, w = sample_slice.shape
    edge = min(TEST_EDGE, h, w)
    edge -= edge % step
    if edge < min_edge:
        raise ValueError(f"Sample image is too small: need at least {min_edge} px on each side, got {h}x{w}")
    crop = centre_crop(sample_slice, edge).astype(np.float32)
    test_input = crop[None, None]                       # (1, 1, y, x), raw values
    with torch.no_grad():
        logits = model(torch.from_numpy(min_max(crop))[None, None])
        probs = torch.softmax(logits, dim=1).numpy().astype(np.float32)
    return test_input, probs, edge


# ---------------------------------------------------------------------------
# package files
# ---------------------------------------------------------------------------

def write_cover(build_dir, test_input, probs):
    from PIL import Image
    raw = min_max(test_input[0, 0])
    grey = (raw * 255).astype(np.uint8)
    classes = probs[0].argmax(axis=0)
    palette = np.array([[0, 0, 0], [230, 80, 80], [80, 170, 230], [90, 200, 90], [240, 200, 60],
                        [200, 90, 220], [80, 220, 220], [240, 140, 60], [160, 160, 160]], dtype=np.uint8)
    colour = palette[np.clip(classes, 0, len(palette) - 1)]
    left = np.stack([grey] * 3, axis=-1)
    blend = (0.55 * left + 0.45 * colour).astype(np.uint8)
    cover = np.concatenate([left, blend], axis=1)
    path = build_dir / "cover.png"
    Image.fromarray(cover).save(path)
    return path


def write_readme(build_dir, name, model_config, meta, halo, min_edge, step, class_names, sample_name):
    ws = meta.get("workspace_version", "")
    dice = meta.get("val_dice")
    lines = [
        f"# {name}",
        "",
        "2D U-Net for semantic segmentation of electron microscopy images, trained in "
        f"BioMed Workspace{(' ' + ws) if ws else ''} and exported as a bioimage.io package.",
        "",
        "## Model",
        "",
        f"- Architecture: U-Net, {model_config['num_layers']} levels, {model_config['features']} base features,",
        "  3x3 convolutions with batch normalisation and ReLU, 2x2 max pooling, transposed convolutions.",
        f"- Input: one greyscale channel, any size that is a multiple of {step} px and at least {min_edge} px.",
        f"- Output: {model_config['num_classes']} channels of class probabilities (softmax): "
        + ", ".join(f"`{c}`" for c in class_names) + ".",
        f"- Suggested halo: {halo} px on each side of a tile.",
    ]
    if dice is not None:
        lines.append(f"- Validation Dice of the exported checkpoint: {dice:.3f}.")
    lines += [
        "",
        "## Preprocessing",
        "",
        "The package declares `scale_range` with percentiles 0 and 100 on the spatial axes, i.e. each",
        "image is scaled to [0, 1] by its minimum and maximum. The workspace itself divides each slice",
        "by its maximum without subtracting the minimum; both are identical for images whose minimum",
        "is 0 and differ only by a constant offset otherwise.",
        "",
        "## Training",
        "",
    ]
    tc = meta.get("training_config") or {}
    if tc:
        keys = ["patch_size", "patches_per_image", "batch_size", "learning_rate", "num_epochs", "val_fraction", "augmentation"]
        for k in keys:
            if k in tc:
                lines.append(f"- {k}: {tc[k]}")
    else:
        lines.append("- Training settings are not recorded in this checkpoint.")
    lines += [
        "",
        f"The test tensors are a centre crop of `{sample_name}` and the model's prediction for it.",
        "",
        "## How the class map is made",
        "",
        "Take the argmax over the channel axis; channel 0 is background, channel k is class k of the",
        "workspace annotation the model was trained on.",
        "",
    ]
    path = build_dir / "README.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# description
# ---------------------------------------------------------------------------

def build_description(build_dir, files, name, license_id, author, model_config, meta,
                      halo, min_edge, step, class_names, edge):
    from bioimageio.spec.model import v0_5 as m
    from bioimageio.spec.generic.v0_3 import Author
    from bioimageio.spec._internal.version_type import Version

    ids = {k: m.AxisId(k) for k in ("y", "x", "channel")}
    space_in = lambda a: m.SpaceInputAxis(id=ids[a], size=m.ParameterizedSize(min=min_edge, step=step))  # noqa: E731
    space_out = lambda a: m.SpaceOutputAxisWithHalo(  # noqa: E731
        id=ids[a], size=m.SizeReference(tensor_id=m.TensorId("raw"), axis_id=ids[a]), halo=halo)

    inputs = [m.InputTensorDescr(
        id=m.TensorId("raw"),
        description="Greyscale electron microscopy image",
        axes=[m.BatchAxis(), m.ChannelAxis(channel_names=[m.Identifier("raw")]), space_in("y"), space_in("x")],
        test_tensor=m.FileDescr(source=files["test_input"]),
        data=m.IntervalOrRatioDataDescr(type="float32"),
        preprocessing=[
            m.EnsureDtypeDescr(kwargs=m.EnsureDtypeKwargs(dtype="float32")),
            m.ScaleRangeDescr(kwargs=m.ScaleRangeKwargs(axes=[ids["y"], ids["x"]], min_percentile=0.0, max_percentile=100.0)),
        ],
    )]
    outputs = [m.OutputTensorDescr(
        id=m.TensorId("probabilities"),
        description="Class probabilities (softmax over the channel axis); channel 0 is background",
        axes=[m.BatchAxis(), m.ChannelAxis(channel_names=[m.Identifier(c) for c in class_names]), space_out("y"), space_out("x")],
        test_tensor=m.FileDescr(source=files["test_output"]),
        data=m.IntervalOrRatioDataDescr(type="float32", range=(0.0, 1.0)),
        postprocessing=[m.SoftmaxDescr(kwargs=m.SoftmaxKwargs(axis=ids["channel"]))],
    )]
    torch_version = Version(torch.__version__.split("+")[0])
    weights = m.WeightsDescr(
        pytorch_state_dict=m.PytorchStateDictWeightsDescr(
            source=files["weights"],
            architecture=m.ArchitectureFromFileDescr(source=files["arch"], callable=m.Identifier("UNet"), kwargs=dict(model_config)),
            pytorch_version=torch_version,
        ),
        torchscript=m.TorchscriptWeightsDescr(source=files["torchscript"], pytorch_version=torch_version, parent="pytorch_state_dict"),
    )
    dice = meta.get("val_dice")
    description = (
        f"2D U-Net ({model_config['num_layers']} levels, {model_config['features']} features) for "
        f"{model_config['num_classes']}-class semantic segmentation of electron microscopy images, "
        f"trained in BioMed Workspace"
        + (f"; validation Dice {dice:.3f}" if dice is not None else "") + "."
    )
    ws_config = {
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "workspace_version": meta.get("workspace_version"),
        "training_id": meta.get("training_id"),
        "model_config": model_config,
        "training_config": meta.get("training_config"),
        "val_dice": dice,
        "normalisation_note": "workspace divides by the slice maximum; package uses min-max scale_range",
        "test_crop_edge": edge,
    }
    return m.ModelDescr(
        name=name,
        description=description,
        authors=[Author(name=author or "BioMed Workspace user")],
        cite=[],
        license=license_id,
        documentation=m.FileDescr(source=files["readme"]),
        covers=[m.FileDescr(source=files["cover"])],
        tags=TAGS,
        inputs=inputs,
        outputs=outputs,
        weights=weights,
        config=m.Config(biomed_workspace=ws_config),
    )


def run_tests(package_path, weight_formats):
    from bioimageio.core import test_model
    results = {}
    for wf in weight_formats:
        summary = test_model(package_path, weight_format=wf, devices=["cpu"])
        ok = summary.status == "passed"
        detail = None
        if not ok:
            failed = [d for d in summary.details if d.status != "passed"]
            msgs = []
            for d in failed:
                for err in getattr(d, "errors", []) or []:
                    msgs.append(getattr(err, "msg", str(err)))
            detail = "; ".join(msgs)[:500] or f"{summary.status}"
        results[wf] = {"status": summary.status, "detail": detail}
    return results


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def export(args):
    meta = {}
    if args.meta:
        meta = json.loads(Path(args.meta).read_text()) if os.path.isfile(args.meta) else json.loads(args.meta)
    if args.license not in LICENSES:
        raise ValueError(f"License must be one of {', '.join(LICENSES)}")
    name = " ".join(args.name.split())[:100]
    if not name:
        raise ValueError("A package name is required")

    progress("loading")
    checkpoint, state = load_checkpoint(args.model)
    model, model_config = build_model(checkpoint, state)
    if "val_dice" not in meta and isinstance(checkpoint.get("val_dice"), (int, float)):
        meta["val_dice"] = float(checkpoint["val_dice"])
    if "training_config" not in meta and isinstance(checkpoint.get("training_config"), dict):
        meta["training_config"] = {k: v for k, v in checkpoint["training_config"].items()
                                   if isinstance(v, (int, float, str, bool))}

    step = 2 ** model_config["num_layers"]
    min_edge = -(-MIN_EDGE // step) * step
    halo = HALO_PER_LEVEL * step
    num_classes = model_config["num_classes"]
    class_names = ["background"] + [f"class_{k}" for k in range(1, num_classes)]

    sample_slice = read_sample_slice(args.sample)
    test_input, test_output, edge = make_test_tensors(model, sample_slice, step, min_edge)

    slug = slugify(name)
    out_dir = Path(args.output_dir)
    build_dir = out_dir / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True)

    progress("tracing")
    files = {}
    files["weights"] = build_dir / "weights.pt"
    torch.save(model.state_dict(), files["weights"])
    example = torch.from_numpy(min_max(test_input[0, 0]))[None, None]
    with torch.no_grad():
        traced = torch.jit.trace(model, example)
        other = torch.rand(1, 1, min_edge + step, min_edge + 2 * step)
        diff = float((traced(other) - model(other)).abs().max())
    if diff > 1e-4:
        raise ValueError(f"TorchScript trace does not reproduce the model (max diff {diff:.2e})")
    files["torchscript"] = build_dir / "weights_torchscript.pt"
    traced.save(str(files["torchscript"]))
    files["arch"] = build_dir / "unet.py"
    shutil.copyfile(Path(__file__).parent / "unet_arch.py", files["arch"])
    files["test_input"] = build_dir / "test_input.npy"
    files["test_output"] = build_dir / "test_output.npy"
    np.save(files["test_input"], test_input)
    np.save(files["test_output"], test_output)
    files["cover"] = write_cover(build_dir, test_input, test_output)
    files["readme"] = write_readme(build_dir, name, model_config, meta, halo, min_edge, step,
                                   class_names, args.sample_name or os.path.basename(args.sample))

    progress("packaging")
    from bioimageio.spec import save_bioimageio_package
    descr = build_description(build_dir, files, name, args.license, args.author, model_config, meta,
                              halo, min_edge, step, class_names, edge)
    package_path = out_dir / f"{slug}.zip"
    if package_path.exists():
        package_path.unlink()
    save_bioimageio_package(descr, output_path=package_path)

    progress("testing")
    tests = run_tests(package_path, ["torchscript", "pytorch_state_dict"])
    failed = {wf: r for wf, r in tests.items() if r["status"] != "passed"}
    shutil.rmtree(build_dir, ignore_errors=True)
    if failed:
        package_path.unlink(missing_ok=True)
        parts = [f"{wf}: {r['detail'] or r['status']}" for wf, r in failed.items()]
        raise ValueError("Package self-test failed (" + "; ".join(parts) + ")")

    result = {
        "zip_path": str(package_path),
        "name": name,
        "slug": slug,
        "size": package_path.stat().st_size,
        "model_config": model_config,
        "class_names": class_names,
        "halo": halo,
        "min_size": min_edge,
        "step": step,
        "test_edge": edge,
        "license": args.license,
        "tests": {wf: r["status"] for wf, r in tests.items()},
        "val_dice": meta.get("val_dice"),
    }
    print("BIOIMAGEIO_RESULT:" + json.dumps(result), flush=True)


def main():
    p = argparse.ArgumentParser(description="Export a workspace U-Net as a bioimage.io package")
    p.add_argument("--model", required=True, help="Workspace checkpoint (.pth)")
    p.add_argument("--sample", required=True, help="Raw TIFF used for the test tensors and the cover")
    p.add_argument("--output_dir", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--license", default="CC-BY-4.0")
    p.add_argument("--author", default="")
    p.add_argument("--meta", default="", help="JSON string or file: training_id, workspace_version, ...")
    p.add_argument("--sample_name", default="", help="Display name of the sample image for the README")
    args = p.parse_args()
    try:
        export(args)
    except Exception as e:  # noqa: BLE001
        fail(e)


if __name__ == "__main__":
    main()
