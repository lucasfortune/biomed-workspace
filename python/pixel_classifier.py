#!/usr/bin/env python3
"""
Interactive pixel classifier for the annotation module (ADR-013 §8).

ilastik / Labkit style: the user's strokes are training samples, per-pixel
texture features (skimage.feature.multiscale_basic_features: intensity,
edges and Hessian texture over several scales) feed a random forest, and the
forest predicts a label plus a confidence for every pixel of the requested
slices. The module shows the prediction as a suggestion layer and the user
accepts or corrects it.

Modes:
    train    - decode the labels, compute features on the labelled slices,
               fit the forest, pickle it next to its metadata
    predict  - load a pickled model, predict the requested slices

Config (JSON file, --config):
    train:   {"source": tiff, "labels": {"<slice>": <encoding>}, "classes": [ids],
              "backgroundClass": id|null, "modelPath": out.pkl,
              "maxSamplesPerClass": 20000, "trees": 80}
    predict: {"source": tiff, "modelPath": in.pkl, "slices": [i, ...],
              "minConfidence": 0.0-1.0, "smooth": 0|1|2}

Label encodings are the annotation module's own (sparse 5-byte runs or dense
base64), decoded with create_annotation_tiff.decode_sparse.

stdout protocol (one JSON payload per line):
    PIXCLS_PROGRESS:{"stage": ..., "current": n, "total": m}
    PIXCLS_RESULT:{...}
    PIXCLS_ERROR:{"message": ...}
"""

import argparse
import base64
import json
import pickle
import sys
import time

import numpy as np
from scipy import ndimage
from skimage.feature import multiscale_basic_features

from create_annotation_tiff import decode_sparse
from tiff_validation_utils import safe_imread

FEATURE_PARAMS = dict(intensity=True, edges=True, texture=True,
                      sigma_min=1.0, sigma_max=8.0, num_sigma=4)
MODEL_VERSION = 1


def emit(prefix, payload):
    print(f"{prefix}:{json.dumps(payload)}", flush=True)


def fail(message):
    emit("PIXCLS_ERROR", {"message": str(message)})
    sys.exit(1)


# =============================================================================
# DATA
# =============================================================================

def load_stack(path):
    """Load the source stack as (slices, height, width)."""
    data = safe_imread(path)
    if data.ndim == 2:
        data = data[np.newaxis, ...]
    if data.ndim != 3:
        raise ValueError(f"Expected a 2D or 3D image, got shape {data.shape}")
    return data


def normalise(slice_2d):
    """Robust per-slice normalisation to [0, 1] (1st..99th percentile)."""
    img = slice_2d.astype(np.float32)
    lo, hi = np.percentile(img, (1, 99))
    if hi <= lo:
        lo, hi = float(img.min()), float(img.max())
    if hi <= lo:
        return np.zeros_like(img)
    return np.clip((img - lo) / (hi - lo), 0.0, 1.0)


def features_for(slice_2d):
    """Per-pixel feature matrix (H*W, F) as float32."""
    feats = multiscale_basic_features(normalise(slice_2d), **FEATURE_PARAMS)
    return feats.reshape(-1, feats.shape[-1]).astype(np.float32)


def decode_labels(entry, width, height):
    """Decode one slice's labels in either annotation encoding."""
    if isinstance(entry, dict) and entry.get("encoding") == "sparse":
        return decode_sparse(entry["pixels"], width, height)
    b64 = entry["pixels"] if isinstance(entry, dict) else entry
    arr = np.frombuffer(base64.b64decode(b64), dtype=np.uint8)
    if arr.size != width * height:
        raise ValueError(f"Dense label size {arr.size} does not match {width}x{height}")
    return arr.reshape(height, width)


# =============================================================================
# TRAIN
# =============================================================================

def train(cfg):
    from sklearn.ensemble import RandomForestClassifier

    t0 = time.time()
    stack = load_stack(cfg["source"])
    n_slices, height, width = stack.shape
    labels_cfg = cfg.get("labels") or {}
    wanted = set(int(c) for c in (cfg.get("classes") or []))
    max_per_class = int(cfg.get("maxSamplesPerClass", 20000))
    rng = np.random.default_rng(0)

    xs, ys = [], []
    per_class = {}
    labelled = sorted(int(k) for k in labels_cfg.keys())
    labelled = [i for i in labelled if 0 <= i < n_slices]
    if not labelled:
        raise ValueError("No labelled slices")

    for n, idx in enumerate(labelled):
        emit("PIXCLS_PROGRESS", {"stage": "features", "current": n + 1, "total": len(labelled)})
        lab = decode_labels(labels_cfg[str(idx)], width, height).reshape(-1)
        if wanted:
            lab = np.where(np.isin(lab, list(wanted)), lab, 0)
        mask = lab != 0
        if not mask.any():
            continue
        feats = features_for(stack[idx])
        for cls in np.unique(lab[mask]):
            where = np.flatnonzero(lab == cls)
            if where.size > max_per_class:
                where = rng.choice(where, max_per_class, replace=False)
            xs.append(feats[where])
            ys.append(np.full(where.size, cls, dtype=np.uint8))
            per_class[int(cls)] = per_class.get(int(cls), 0) + int(where.size)

    if len(per_class) < 2:
        raise ValueError("Paint at least two classes (one of them a background class) before suggesting")

    X = np.concatenate(xs)
    y = np.concatenate(ys)
    # Cap the total once more so the forest stays interactive on dense labels
    if X.shape[0] > max_per_class * len(per_class):
        keep = rng.choice(X.shape[0], max_per_class * len(per_class), replace=False)
        X, y = X[keep], y[keep]

    emit("PIXCLS_PROGRESS", {"stage": "fit", "current": 0, "total": 1})
    forest = RandomForestClassifier(
        n_estimators=int(cfg.get("trees", 80)),
        max_depth=None,
        min_samples_leaf=2,
        max_features="sqrt",
        n_jobs=-1,
        random_state=0,
        oob_score=True,
    )
    forest.fit(X, y)

    model = {
        "version": MODEL_VERSION,
        "forest": forest,
        "classes": [int(c) for c in forest.classes_],
        "backgroundClass": cfg.get("backgroundClass"),
        "width": width,
        "height": height,
        "source": cfg["source"],
        "featureParams": FEATURE_PARAMS,
        "trainedAt": time.time(),
    }
    with open(cfg["modelPath"], "wb") as fh:
        pickle.dump(model, fh)

    emit("PIXCLS_RESULT", {
        "modelPath": cfg["modelPath"],
        "classes": model["classes"],
        "samplesPerClass": per_class,
        "labelledSlices": labelled,
        "oobAccuracy": float(getattr(forest, "oob_score_", float("nan"))),
        "features": int(X.shape[1]),
        "seconds": round(time.time() - t0, 2),
    })


# =============================================================================
# PREDICT
# =============================================================================

def predict(cfg):
    t0 = time.time()
    with open(cfg["modelPath"], "rb") as fh:
        model = pickle.load(fh)
    if model.get("version") != MODEL_VERSION:
        raise ValueError("Model was trained by another version, train again")

    stack = load_stack(cfg["source"])
    n_slices, height, width = stack.shape
    if (width, height) != (model["width"], model["height"]):
        raise ValueError("Model was trained on an image of different size, train again")

    forest = model["forest"]
    classes = np.array(model["classes"], dtype=np.uint8)
    background = model.get("backgroundClass")
    min_conf = float(cfg.get("minConfidence", 0.0))
    smooth = int(cfg.get("smooth", 0))
    slices = [int(i) for i in cfg.get("slices", []) if 0 <= int(i) < n_slices]
    if not slices:
        raise ValueError("No valid slice indices to predict")

    out = {}
    for n, idx in enumerate(slices):
        emit("PIXCLS_PROGRESS", {"stage": "predict", "current": n + 1, "total": len(slices)})
        feats = features_for(stack[idx])
        proba = forest.predict_proba(feats)
        best = np.argmax(proba, axis=1)
        conf = proba[np.arange(proba.shape[0]), best]
        labels = classes[best].reshape(height, width)
        conf = conf.reshape(height, width)

        if smooth > 0:
            size = 2 * smooth + 1
            labels = ndimage.median_filter(labels, size=size, mode="nearest")
            conf = ndimage.uniform_filter(conf, size=size, mode="nearest")

        # Background predictions and low-confidence pixels become 0 (= no suggestion)
        if background is not None:
            labels = np.where(labels == int(background), 0, labels)
        labels = np.where(conf >= min_conf, labels, 0).astype(np.uint8)
        conf8 = np.clip(conf * 255.0, 0, 255).astype(np.uint8)

        out[str(idx)] = {
            "labels": base64.b64encode(labels.tobytes()).decode("ascii"),
            "confidence": base64.b64encode(conf8.tobytes()).decode("ascii"),
            "suggested": int(np.count_nonzero(labels)),
        }

    emit("PIXCLS_RESULT", {
        "slices": out,
        "width": width,
        "height": height,
        "seconds": round(time.time() - t0, 2),
    })


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Interactive pixel classifier")
    parser.add_argument("mode", choices=["train", "predict"])
    parser.add_argument("--config", required=True, help="JSON config file")
    args = parser.parse_args()

    try:
        with open(args.config) as fh:
            cfg = json.load(fh)
        if args.mode == "train":
            train(cfg)
        else:
            predict(cfg)
    except Exception as exc:  # noqa: BLE001 - reported through the protocol
        fail(exc)


if __name__ == "__main__":
    main()
