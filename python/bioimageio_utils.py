#!/usr/bin/env python3
"""
bioimage.io model helpers (ADR-015)

Loads a model description from the bioimage.io model zoo (by id, DOI or
URL) or from a package zip / rdf.yaml, prepares it for tiled inference
and converts model outputs into workspace class maps.

Verified quirks this module works around (bioimageio.core 0.11):

- Format 0.4 descriptions cannot be tiled by the library. Loading with
  ``format_version="latest"`` upgrades them to 0.5 in memory.
- Some descriptions (the BiaPy family) declare fixed-size output space
  axes instead of referencing the input axes. The library then returns
  only the first block. ``patch_fixed_outputs`` rewrites those axes to a
  ``SizeReference`` on the matching input axis.
- Channel names are generic, so the conversion from output channels to
  class ids is a user-chosen rule (``to_class_map``).

CLI::

    python bioimageio_utils.py describe --source shivering-raccoon
    -> BIOIMAGEIO_RESULT:{"success": true, "summary": {...}}

The cache directory for downloaded descriptions and weights is taken
from the environment variable ``BIOIMAGEIO_CACHE_PATH`` (read by
bioimageio.spec at import time, so it must be set by the caller).
"""

import argparse
import json
import os
import sys
import warnings

import numpy as np

warnings.filterwarnings("ignore", category=UserWarning)

TARGET_BLOCK_EDGE = 512          # preferred tile edge for parametrised axes
MAX_3D_VOXELS = 1_500_000_000    # refuse 3D samples above this (float32 in RAM)
WEIGHT_FORMAT_PREFERENCE = ("torchscript", "pytorch_state_dict")
EXCLUDED_TAGS = ("denoising", "restoration", "super-resolution",
                 "classification", "in-silico-labeling")


def _import_spec():
    from bioimageio.spec.model import v0_5
    from bioimageio.spec import load_description
    return v0_5, load_description


# ---------------------------------------------------------------------------
# Loading and preparation
# ---------------------------------------------------------------------------

def _space_axes(axes, v0_5):
    # SpaceInputAxis, SpaceOutputAxis and SpaceOutputAxisWithHalo all derive
    # from SpaceAxisBase (the halo variant is not a subclass of SpaceOutputAxis)
    return [a for a in axes if isinstance(a, v0_5.SpaceAxisBase)]


def _is_output_space_axis(a, v0_5):
    return isinstance(a, v0_5.SpaceAxisBase) and not isinstance(a, v0_5.SpaceInputAxis)


def _channel_axis(axes, v0_5):
    for a in axes:
        if isinstance(a, v0_5.ChannelAxis):
            return a
    return None


def patch_fixed_outputs(descr, v0_5):
    """Replace fixed-size output space axes by references to the input axes.

    Returns (descr, patched_axis_ids). Only touches axes whose id also
    exists on the (single) input tensor.
    """
    inp = descr.inputs[0]
    input_space_ids = {str(a.id) for a in _space_axes(inp.axes, v0_5)}
    patched = []
    new_outputs = []
    for out in descr.outputs:
        new_axes = []
        for a in out.axes:
            if (_is_output_space_axis(a, v0_5) and isinstance(a.size, int)
                    and str(a.id) in input_space_ids):
                new_axes.append(a.model_copy(update={
                    "size": v0_5.SizeReference(tensor_id=inp.id, axis_id=a.id)
                }))
                patched.append(str(a.id))
            else:
                new_axes.append(a)
        new_outputs.append(out.model_copy(update={"axes": new_axes}))
    if patched:
        descr = descr.model_copy(update={"outputs": new_outputs})
    return descr, patched


def _imported_top_level_names(source_text):
    """Top-level package names imported by a Python source (absolute imports only)."""
    import ast
    names = set()
    tree = ast.parse(source_text)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.add(node.module.split(".")[0])
    return names


def missing_architecture_packages(descr, weight_format):
    """Packages a pytorch_state_dict architecture imports that this Python lacks.

    The library imports the packaged architecture file at pipeline creation;
    a missing import there surfaces late (after the weights download) as a
    bare "Failed to import <file>". This reads the small source file first
    and reports the missing top-level packages, so selection can refuse the
    model with a usable message. Returns an empty list for torchscript.
    """
    if weight_format != "pytorch_state_dict":
        return []
    import importlib.util
    weights = descr.weights.pytorch_state_dict
    arch = weights.architecture
    names = set()
    import_from = getattr(arch, "import_from", None)
    if import_from:
        names.add(str(import_from).split(".")[0])
    else:
        from bioimageio.spec.utils import download
        reader = download(arch.source)
        text = reader.read().decode("utf-8", errors="replace")
        names = _imported_top_level_names(text)
    stdlib = getattr(sys, "stdlib_module_names", set())
    missing = []
    for name in sorted(names):
        if name in stdlib or name in ("__future__",):
            continue
        try:
            found = importlib.util.find_spec(name) is not None
        except (ImportError, ValueError):
            found = False
        if not found:
            missing.append(name)
    return missing


def pick_weight_format(descr):
    for wf in WEIGHT_FORMAT_PREFERENCE:
        if getattr(descr.weights, wf, None) is not None:
            return wf
    return None


def load_ready(source):
    """Load a description, upgrade it to 0.5, patch it and pick the weights.

    Returns (descr, info) where info holds the weight format and notes.
    Raises ValueError for models this workspace cannot run.
    """
    v0_5, load_description = _import_spec()
    descr = load_description(source, format_version="latest", perform_io_checks=False)
    if not isinstance(descr, v0_5.ModelDescr):
        kind = type(descr).__name__
        detail = ""
        summary = getattr(descr, "validation_summary", None)
        if summary is not None:
            try:
                detail = ": " + summary.format()[:500]
            except Exception:
                detail = ""
        raise ValueError(f"'{source}' is not a runnable bioimage.io model description ({kind}){detail}")

    notes = []
    if len(descr.inputs) != 1:
        raise ValueError(f"Model has {len(descr.inputs)} input tensors; the workspace supports exactly one")
    inp = descr.inputs[0]
    ch = _channel_axis(inp.axes, v0_5)
    if ch is not None and ch.size != 1:
        raise ValueError(f"Model expects {ch.size} input channels; workspace stacks have one")
    n_space = len(_space_axes(inp.axes, v0_5))
    if n_space not in (2, 3):
        raise ValueError(f"Model input has {n_space} space axes; only 2D (yx) and 3D (zyx) models are supported")
    if len(descr.outputs) < 1:
        raise ValueError("Model declares no output tensor")

    weight_format = pick_weight_format(descr)
    if weight_format is None:
        available = sorted(descr.weights.model_fields_set)
        raise ValueError(f"No torchscript or pytorch_state_dict weights (available: {available})")

    missing = missing_architecture_packages(descr, weight_format)
    if missing:
        raise ValueError(
            "This model's architecture needs Python packages that are not installed on the server: "
            + ", ".join(missing) + ". Ask the administrator to install them, or pick a model with torchscript weights."
        )

    descr, patched = patch_fixed_outputs(descr, v0_5)
    if patched:
        notes.append("fixed-size output axes " + ", ".join(patched) + " patched to follow the input size")
    info = {"weight_format": weight_format, "notes": notes, "patched_axes": patched}
    return descr, info


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def _axis_size_summary(a, v0_5):
    s = a.size
    if isinstance(s, int):
        return {"kind": "fixed", "size": s}
    if isinstance(s, v0_5.ParameterizedSize):
        return {"kind": "parameterized", "min": s.min, "step": s.step}
    if isinstance(s, v0_5.SizeReference):
        return {"kind": "reference", "tensor": str(s.tensor_id), "axis": str(s.axis_id), "offset": s.offset}
    return {"kind": "unknown"}


def default_conversion(descr, v0_5):
    """R2: argmax when the model declares softmax, else one class per channel."""
    out = descr.outputs[0]
    post_ids = [p.id for p in (out.postprocessing or [])]
    ch = _channel_axis(out.axes, v0_5)
    n_channels = ch.size if ch is not None else 1
    if n_channels <= 1:
        return "per_channel", n_channels
    if "softmax" in post_ids:
        return "argmax", n_channels
    return "per_channel", n_channels


def summarise(descr, info, source):
    v0_5, _ = _import_spec()
    inp = descr.inputs[0]
    out = descr.outputs[0]
    in_space = _space_axes(inp.axes, v0_5)
    out_space = _space_axes(out.axes, v0_5)
    out_ch = _channel_axis(out.axes, v0_5)
    conversion, n_channels = default_conversion(descr, v0_5)

    cite = []
    for c in (descr.cite or []):
        entry = {"text": c.text}
        if getattr(c, "doi", None):
            entry["doi"] = str(c.doi)
        if getattr(c, "url", None):
            entry["url"] = str(c.url)
        cite.append(entry)

    model_id = str(descr.id) if descr.id else None
    version = str(descr.version) if getattr(descr, "version", None) is not None else None

    return {
        "id": model_id,
        "name": descr.name,
        "version": version,
        "source": str(source),
        "description": descr.description,
        "license": str(descr.license) if descr.license else None,
        "tags": list(descr.tags or []),
        "authors": [a.name for a in (descr.authors or [])],
        "cite": cite,
        "format_version": descr.format_version,
        "weight_format": info["weight_format"],
        "dims": len(in_space),
        "input": {
            "id": str(inp.id),
            "axes": [str(a.id) for a in inp.axes],
            "space": {str(a.id): _axis_size_summary(a, v0_5) for a in in_space},
            "preprocessing": [p.id for p in (inp.preprocessing or [])],
        },
        "output": {
            "id": str(out.id),
            "axes": [str(a.id) for a in out.axes],
            "channels": n_channels,
            "channel_names": [str(n) for n in out_ch.channel_names] if out_ch is not None else [],
            "halo": {str(a.id): int(getattr(a, "halo", 0) or 0) for a in out_space},
            "postprocessing": [p.id for p in (out.postprocessing or [])],
        },
        "default_conversion": conversion,
        "notes": info["notes"],
    }


# ---------------------------------------------------------------------------
# Tiling and conversion
# ---------------------------------------------------------------------------

def choose_ns(descr, spatial_shape):
    """R3: one ``ns`` for all parametrised axes so the tile edge is close to
    TARGET_BLOCK_EDGE but never larger than the image along that axis."""
    v0_5, _ = _import_spec()
    inp = descr.inputs[0]
    space = _space_axes(inp.axes, v0_5)
    ns_candidates = []
    for a, dim in zip(space, spatial_shape):
        s = a.size
        if isinstance(s, v0_5.ParameterizedSize):
            target = min(TARGET_BLOCK_EDGE, dim)
            ns_candidates.append(max(0, (target - s.min) // s.step))
    return min(ns_candidates) if ns_candidates else 0


def to_class_map(probabilities, conversion, threshold):
    """Convert a (channel, ...) float array into a uint8 class map (R2).

    Returns (class_map, classes) where classes lists {"class", "channel"}.
    """
    probs = np.asarray(probabilities)
    n_channels = probs.shape[0]
    if n_channels == 1 or conversion == "per_channel":
        class_map = np.zeros(probs.shape[1:], dtype=np.uint8)
        classes = []
        for k in range(n_channels):
            mask = probs[k] > threshold
            class_map[mask] = k + 1
            classes.append({"class": k + 1, "channel": k})
        return class_map, classes
    if conversion == "argmax":
        class_map = np.argmax(probs, axis=0).astype(np.uint8)
        classes = [{"class": k, "channel": k} for k in range(n_channels)]
        return class_map, classes
    raise ValueError(f"Unknown conversion '{conversion}'")


# ---------------------------------------------------------------------------
# List-time import check (hides models the server cannot run)
# ---------------------------------------------------------------------------

CHECK_CACHE_NAME = "architecture_checks.json"


def _check_cache_path():
    base = os.environ.get("BIOIMAGEIO_CACHE_PATH")
    if not base:
        return None
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, CHECK_CACHE_NAME)


def _missing_for_names(names):
    import importlib.util
    stdlib = getattr(sys, "stdlib_module_names", set())
    missing = []
    for name in sorted(names):
        if name in stdlib or name == "__future__":
            continue
        try:
            found = importlib.util.find_spec(name) is not None
        except (ImportError, ValueError):
            found = False
        if not found:
            missing.append(name)
    return missing


def check_imports(items):
    """For each {id, source_url | import_from} report the missing packages.

    Results are cached on disk (keyed by the source reference) so a hub
    refresh only downloads architecture files it has not seen. Returns
    {id: {"missing": [...], "error": str|None}}.
    """
    import urllib.request
    cache_path = _check_cache_path()
    cache = {}
    if cache_path and os.path.exists(cache_path):
        try:
            with open(cache_path) as f:
                cache = json.load(f)
        except (OSError, ValueError):
            cache = {}
    results = {}
    changed = False
    for item in items:
        key = item.get("source_url") or ("import:" + str(item.get("import_from")))
        if key in cache:
            results[item["id"]] = cache[key]
            continue
        entry = {"missing": [], "error": None}
        try:
            if item.get("import_from"):
                entry["missing"] = _missing_for_names({str(item["import_from"]).split(".")[0]})
            else:
                with urllib.request.urlopen(item["source_url"], timeout=30) as resp:
                    text = resp.read().decode("utf-8", errors="replace")
                entry["missing"] = _missing_for_names(_imported_top_level_names(text))
        except Exception as e:  # noqa: BLE001 - recorded, not fatal
            entry["error"] = f"{type(e).__name__}: {str(e).splitlines()[0][:200]}"
        cache[key] = entry
        results[item["id"]] = entry
        changed = True
    if changed and cache_path:
        try:
            with open(cache_path, "w") as f:
                json.dump(cache, f, indent=1)
        except OSError:
            pass
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _describe(source):
    descr, info = load_ready(source)
    return {"success": True, "summary": summarise(descr, info, source)}


def main():
    parser = argparse.ArgumentParser(description="bioimage.io model helpers")
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("describe", help="Load a model description and print a summary")
    d.add_argument("--source", required=True, help="Zoo id, DOI, URL, package zip or rdf.yaml")
    c = sub.add_parser("check-imports", help="Report missing packages for architecture files")
    c.add_argument("--input", required=True, help="JSON file: [{id, source_url | import_from}]")
    args = parser.parse_args()

    try:
        if args.command == "describe":
            result = _describe(args.source)
        elif args.command == "check-imports":
            with open(args.input) as f:
                items = json.load(f)
            result = {"success": True, "results": check_imports(items)}
        else:
            result = {"success": False, "error": f"Unknown command {args.command}"}
    except Exception as e:  # noqa: BLE001 - reported to the caller as JSON
        first_line = str(e).strip().split("\n")[0]
        result = {"success": False, "error": f"{type(e).__name__}: {first_line}"}

    print("BIOIMAGEIO_RESULT:" + json.dumps(result), flush=True)
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
