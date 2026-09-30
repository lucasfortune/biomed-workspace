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
# Fine-tuning (ADR-017)
# ---------------------------------------------------------------------------

PATCH_CANDIDATES = (32, 48, 64, 96, 128, 256)


def _first_tensor(y):
    """Networks may return a list/tuple of outputs; the first one is the prediction."""
    if isinstance(y, (list, tuple)):
        return y[0]
    return y


def _output_channels(descr, v0_5):
    ch = _channel_axis(descr.outputs[0].axes, v0_5)
    return int(ch.size) if ch is not None else 1


def _patch_constraint(axis, v0_5):
    s = axis.size
    if isinstance(s, int):
        return {"kind": "fixed", "size": int(s)}
    if isinstance(s, v0_5.ParameterizedSize):
        return {"kind": "parameterized", "min": int(s.min), "step": int(s.step)}
    return {"kind": "any"}


def _allows(constraint, edge):
    if constraint["kind"] == "fixed":
        return edge == constraint["size"]
    if constraint["kind"] == "parameterized":
        return edge >= constraint["min"] and (edge - constraint["min"]) % constraint["step"] == 0
    return True


def allowed_patch_sizes(patch, candidates=PATCH_CANDIDATES):
    """Patch edges (square) that every space axis of the input accepts."""
    edges = set(candidates)
    for c in patch.values():
        if c["kind"] == "fixed":
            edges.add(c["size"])
    return sorted(e for e in edges if all(_allows(c, e) for c in patch.values()))


def load_test_output(descr):
    from bioimageio.spec.utils import load_array
    return np.asarray(load_array(descr.outputs[0].test_tensor), dtype=np.float32)


def finetune_info(descr):
    """Rules F2 and F3: can this model be fine-tuned on workspace annotations?

    Returns {"eligible", "reason", "head", "channels", "classes", "patch",
    "allowed_patch_sizes"}. `head` is one of "softmax" (cross-entropy on
    logits), "sigmoid_logits" (BCE with logits, one channel) or
    "sigmoid_probs" (the network applies the sigmoid itself; BCE on the
    probabilities). `classes` is the number of annotation classes the model
    needs, background included.
    """
    v0_5, _ = _import_spec()
    inp, out = descr.inputs[0], descr.outputs[0]
    in_space = _space_axes(inp.axes, v0_5)
    patch = {str(a.id): _patch_constraint(a, v0_5) for a in in_space}
    result = {"eligible": False, "reason": None, "head": None, "channels": _output_channels(descr, v0_5),
              "classes": None, "patch": patch, "allowed_patch_sizes": allowed_patch_sizes(patch)}

    def refuse(reason):
        result["reason"] = reason
        return result

    if descr.weights.pytorch_state_dict is None:
        return refuse("The model ships torchscript weights only; fine-tuning needs pytorch_state_dict weights")
    if len(in_space) != 2:
        return refuse(f"The model works on {len(in_space)}D data; fine-tuning uses 2D annotated slices")
    if len(descr.outputs) != 1:
        return refuse(f"The model has {len(descr.outputs)} output tensors; fine-tuning needs exactly one")
    input_space_ids = {str(a.id) for a in in_space}
    for a in out.axes:
        if not _is_output_space_axis(a, v0_5):
            continue
        s = a.size
        if isinstance(s, v0_5.SizeReference):
            if str(s.tensor_id) != str(inp.id) or str(s.axis_id) not in input_space_ids or (s.offset or 0) != 0:
                return refuse("The output size does not follow the input size one to one; fine-tuning needs "
                              "pixel-aligned outputs")
        else:
            return refuse("The output has a fixed size that does not follow the input; fine-tuning needs "
                          "pixel-aligned outputs")
    if not result["allowed_patch_sizes"]:
        return refuse("The model's input size rule leaves no usable training patch size")

    n = result["channels"]
    post = [p.id for p in (out.postprocessing or [])]
    if n >= 2 and "softmax" in post:
        head = "softmax"
    elif n == 1 and "sigmoid" in post:
        head = "sigmoid_logits"
    elif n == 1:
        try:
            to = load_test_output(descr)
        except Exception as e:  # noqa: BLE001
            return refuse(f"The model's test output could not be read ({type(e).__name__})")
        if float(to.min()) >= 0.0 and float(to.max()) <= 1.0:
            head = "sigmoid_probs"
        else:
            return refuse("The single output channel is neither a declared sigmoid nor a probability "
                          f"(test output ranges {float(to.min()):.2f} to {float(to.max()):.2f})")
    else:
        return refuse(f"The model outputs {n} channels without a softmax (foreground and boundary style); "
                      "fine-tuning needs a softmax over classes or one sigmoid channel")

    result.update({"eligible": True, "head": head, "classes": n if head == "softmax" else 2})
    return result


def preprocessing_callable(descr):
    """The package's preprocessing as a function (Z, Y, X) -> float32 (Z, Y, X),
    applied slice by slice on whole slices, exactly as inference does."""
    from bioimageio.core import Sample, Tensor
    from bioimageio.core.axis import AxisId
    from bioimageio.core.proc_setup import get_pre_and_postprocessing
    from bioimageio.spec.model.v0_5 import TensorId
    inp = descr.inputs[0]
    procs = get_pre_and_postprocessing(descr, dataset_for_initial_statistics=[])
    dims = tuple(AxisId(str(a.id)) for a in inp.axes)
    tid = TensorId(str(inp.id))

    def run(stack):
        stack = np.asarray(stack)
        if stack.ndim == 2:
            stack = stack[None]
        out = np.empty(stack.shape, dtype=np.float32)
        for z in range(stack.shape[0]):
            arr = stack[z].astype(np.float32).reshape(shape_for_axes(descr, stack.shape[1:]))
            sample = Sample(members={tid: Tensor.from_numpy(arr, dims=dims)}, stat={}, id=f"slice{z}")
            procs.pre(sample)
            data = sample.members[tid].data.transpose(*dims).values
            out[z] = np.asarray(data, dtype=np.float32).reshape(stack.shape[1:])
        return out

    return run


def shape_for_axes(descr, spatial):
    """Input array shape following the model's axis order (batch/channel = 1)."""
    v0_5, _ = _import_spec()
    shape, it = [], iter(spatial)
    for a in descr.inputs[0].axes:
        shape.append(next(it) if isinstance(a, v0_5.SpaceInputAxis) else 1)
    return tuple(shape)


def _self_test(package_path, weight_formats):
    from bioimageio.core import test_model
    results = {}
    for wf in weight_formats:
        summary = test_model(package_path, weight_format=wf, devices=["cpu"])
        detail = None
        if summary.status != "passed":
            msgs = []
            for d in summary.details:
                if d.status == "passed":
                    continue
                for err in getattr(d, "errors", []) or []:
                    msgs.append(str(getattr(err, "msg", err)).splitlines()[0])
            detail = "; ".join(msgs)[:500] or summary.status
        results[wf] = {"status": summary.status, "detail": detail}
    return results


def _finetune_readme(build_dir, descr, meta, tests_note):
    parent_name = descr.name
    parent_ref = f"`{descr.id}` (version {descr.version})" if descr.id else parent_name
    lines = [
        f"# {meta.get('name') or (parent_name + ' fine-tuned')}",
        "",
        f"Fine-tuned copy of the bioimage.io model {parent_ref}, trained further in BioMed Workspace"
        f"{(' ' + str(meta['workspace_version'])) if meta.get('workspace_version') else ''} on workspace annotations.",
        "",
        "## Fine-tuning",
        "",
    ]
    for label, key in (("Parent", "parent_display"), ("Training data", "data"), ("Epochs", "num_epochs"),
                       ("Learning rate", "learning_rate"), ("Patch size", "patch_size"),
                       ("Labelled slices (train / validation)", "slices")):
        if meta.get(key) is not None:
            lines.append(f"- {label}: {meta[key]}")
    if meta.get("val_dice") is not None:
        lines.append(f"- Validation Dice of the kept epoch: {float(meta['val_dice']):.3f}")
    head = meta.get("head")
    if head == "softmax":
        lines.append("- Loss: cross-entropy over the channel axis; channel k is class k of the annotation")
    elif head:
        lines.append("- Loss: binary cross-entropy on the single channel (annotation class 1 = foreground)")
    lines += [
        "",
        "The input preprocessing, axes and output semantics are those of the parent model; only the",
        "weights (and the test tensors, regenerated with the new weights) changed.",
        tests_note,
        "",
    ]
    parent_doc = None
    try:
        from bioimageio.spec.utils import download
        if descr.documentation is not None:
            parent_doc = download(descr.documentation.source).read().decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        parent_doc = None
    if parent_doc:
        lines += ["## Parent model documentation", "", parent_doc.strip()[:20000], ""]
    path = build_dir / "README.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def build_finetuned_package(parent_source, state_dict_path, out_dir, meta, progress=None):
    """Rule F6: write <out_dir>/<slug>_finetuned.zip from the parent description
    and a new state dict; regenerate the test tensors the way the self-test
    reproduces them; re-trace torchscript when the parent had it; self-test.

    Returns {"zip_path", "name", "tests", "torchscript", "notes"}.
    Raises ValueError when the self-test fails (the zip is removed).
    """
    import shutil
    import torch
    from pathlib import Path
    from bioimageio.core import Sample, Tensor, create_prediction_pipeline
    from bioimageio.core.axis import AxisId
    from bioimageio.core.backends.pytorch_backend import load_torch_model
    from bioimageio.core.digest_spec import get_test_inputs
    from bioimageio.spec import save_bioimageio_package
    from bioimageio.spec.generic.v0_3 import Author
    from bioimageio.spec.model import v0_5 as m
    from bioimageio.spec.model.v0_5 import TensorId
    from bioimageio.spec._internal.version_type import Version
    from bioimageio.spec.utils import load_array

    def stage(name):
        if progress:
            progress(name)

    descr, info = load_ready(parent_source)
    notes = list(info["notes"])
    w = descr.weights.pytorch_state_dict
    if w is None:
        raise ValueError("Parent model has no pytorch_state_dict weights")
    out_dir = Path(out_dir)
    build_dir = out_dir / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True)
    weights_path = build_dir / "weights.pt"
    shutil.copyfile(state_dict_path, weights_path)
    torch_version = Version(torch.__version__.split("+")[0])
    new_sd = m.PytorchStateDictWeightsDescr(source=weights_path, architecture=w.architecture,
                                            pytorch_version=torch_version, dependencies=w.dependencies)
    inp, out = descr.inputs[0], descr.outputs[0]
    odims = [AxisId(str(a.id)) for a in out.axes]

    stage("packaging")
    descr_tmp = descr.model_copy(update={"weights": m.WeightsDescr(pytorch_state_dict=new_sd)})
    pipeline = create_prediction_pipeline(descr_tmp, weight_format="pytorch_state_dict", devices=["cpu"])
    with pipeline:
        res = pipeline.predict_sample_without_blocking(get_test_inputs(descr_tmp),
                                                       skip_input_padding=True, skip_output_cropping=True)
    test_output = np.asarray(res.members[TensorId(str(out.id))].data.transpose(*odims).values, dtype=np.float32)
    test_input = np.asarray(load_array(inp.test_tensor))
    ti_path, to_path = build_dir / "test_input.npy", build_dir / "test_output.npy"
    np.save(ti_path, test_input)
    np.save(to_path, test_output)

    torchscript = None
    weight_formats = ["pytorch_state_dict"]
    if descr.weights.torchscript is not None:
        try:
            model = load_torch_model(new_sd, load_state=True, devices=["cpu"])
            model.eval()
            example = torch.from_numpy(test_input.astype(np.float32))
            import warnings
            with torch.no_grad(), warnings.catch_warnings():
                # the decoder's size check is a constant for the declared sizes
                warnings.simplefilter("ignore", torch.jit.TracerWarning)
                traced = torch.jit.trace(model, example)
                other = torch.rand(*example.shape)
                diff = float((_first_tensor(traced(other)) - _first_tensor(model(other))).abs().max())
            if diff > 1e-4:
                raise ValueError(f"trace differs from eager mode by {diff:.2e}")
            ts_path = build_dir / "weights_torchscript.pt"
            traced.save(str(ts_path))
            torchscript = m.TorchscriptWeightsDescr(source=ts_path, pytorch_version=torch_version,
                                                    parent="pytorch_state_dict")
            weight_formats.append("torchscript")
        except Exception as e:  # noqa: BLE001
            notes.append(f"torchscript weights dropped: {str(e).splitlines()[0][:120]}")

    name = (meta.get("name") or "").strip()
    if not name:
        suffix = " fine-tuned"
        name = descr.name.strip()[:64 - len(suffix)].rstrip() + suffix
    name = name[:64]
    description = (f"Fine-tuned in BioMed Workspace on workspace annotations. Parent: {descr.name}. "
                   + (descr.description or ""))[:1000]
    tags = list(dict.fromkeys(list(descr.tags or []) + ["fine-tuned", "biomed-workspace"]))
    authors = list(descr.authors or [])
    if meta.get("author"):
        authors.append(Author(name=str(meta["author"])))
    cfg = descr.config.model_dump(mode="json") if descr.config is not None else {}
    cfg["biomed_workspace"] = {
        "fine_tuned_from": meta.get("parent"),
        "training_id": meta.get("training_id"),
        "training_config": meta.get("training_config"),
        "head": meta.get("head"),
        "val_dice": meta.get("val_dice"),
        "workspace_version": meta.get("workspace_version"),
        "notes": notes,
    }
    tests_note = "The package passed bioimageio.core's self-test for " + " and ".join(weight_formats) + " weights."
    readme = _finetune_readme(build_dir, descr, {**meta, "name": name}, tests_note)
    update = {
        "weights": m.WeightsDescr(pytorch_state_dict=new_sd, torchscript=torchscript),
        "inputs": [inp.model_copy(update={"test_tensor": m.FileDescr(source=ti_path)})],
        "outputs": [out.model_copy(update={"test_tensor": m.FileDescr(source=to_path)})],
        "name": name,
        "description": description,
        "tags": tags,
        "authors": authors,
        "documentation": m.FileDescr(source=readme),
        "config": m.Config(**cfg),
        "id": None, "version": None, "id_emoji": None,
        "parent": m.LinkedModel(id=descr.id, version=descr.version) if descr.id else None,
    }
    new_descr = descr.model_copy(update=update)
    slug = str(descr.id or descr.name).lower()
    slug = "".join(c if c.isalnum() else "-" for c in slug).strip("-")[:50] or "model"
    zip_path = out_dir / f"{slug}_finetuned.zip"
    if zip_path.exists():
        zip_path.unlink()
    save_bioimageio_package(new_descr, output_path=zip_path)

    stage("testing")
    tests = _self_test(zip_path, weight_formats)
    shutil.rmtree(build_dir, ignore_errors=True)
    failed = {wf: r for wf, r in tests.items() if r["status"] != "passed"}
    if failed:
        zip_path.unlink(missing_ok=True)
        parts = [f"{wf}: {r['detail'] or r['status']}" for wf, r in failed.items()]
        raise ValueError("Fine-tuned package failed its self-test (" + "; ".join(parts) + ")")
    return {"zip_path": str(zip_path), "name": name, "tests": {wf: r["status"] for wf, r in tests.items()},
            "torchscript": torchscript is not None, "notes": notes, "size": zip_path.stat().st_size}


def describe_checkpoint(model_path):
    """Model config, validation Dice and training settings of a workspace checkpoint."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from export_bioimageio import load_checkpoint, config_from_state
    checkpoint, state = load_checkpoint(model_path)
    model_config = config_from_state(state)
    dice = checkpoint.get("val_dice")
    tc = checkpoint.get("training_config") if isinstance(checkpoint.get("training_config"), dict) else {}
    return {
        "model_config": model_config,
        "val_dice": float(dice) if isinstance(dice, (int, float)) else None,
        "training_config": {k: v for k, v in tc.items() if isinstance(v, (int, float, str, bool))},
        "allowed_patch_sizes": [p for p in PATCH_CANDIDATES if p % (2 ** model_config["num_layers"]) == 0],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _describe(source):
    descr, info = load_ready(source)
    summary = summarise(descr, info, source)
    summary["finetune"] = finetune_info(descr)
    return {"success": True, "summary": summary}


def main():
    parser = argparse.ArgumentParser(description="bioimage.io model helpers")
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("describe", help="Load a model description and print a summary")
    d.add_argument("--source", required=True, help="Zoo id, DOI, URL, package zip or rdf.yaml")
    c = sub.add_parser("check-imports", help="Report missing packages for architecture files")
    c.add_argument("--input", required=True, help="JSON file: [{id, source_url | import_from}]")
    k = sub.add_parser("describe-checkpoint", help="Model config of a workspace .pth checkpoint (ADR-017)")
    k.add_argument("--model", required=True, help="Workspace checkpoint (.pth)")
    args = parser.parse_args()

    try:
        if args.command == "describe":
            result = _describe(args.source)
        elif args.command == "check-imports":
            with open(args.input) as f:
                items = json.load(f)
            result = {"success": True, "results": check_imports(items)}
        elif args.command == "describe-checkpoint":
            result = {"success": True, "checkpoint": describe_checkpoint(args.model)}
        else:
            result = {"success": False, "error": f"Unknown command {args.command}"}
    except Exception as e:  # noqa: BLE001 - reported to the caller as JSON
        first_line = str(e).strip().split("\n")[0]
        result = {"success": False, "error": f"{type(e).__name__}: {first_line}"}

    print("BIOIMAGEIO_RESULT:" + json.dumps(result), flush=True)
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
