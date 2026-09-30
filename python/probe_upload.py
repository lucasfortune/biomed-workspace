#!/usr/bin/env python3
"""
Probe an uploaded TIFF to tell raw image data from a label map (ADR-018).

    python probe_upload.py <file.tif>

Prints one line: PROBE:{"kind": "raw"|"annotation", "dtype": ..., "sliceCount": ...,
"width": ..., "height": ..., "uniqueSampled": ..., "maxValue": ..., "reason": ...}

Rule: an integer stack with at most MAX_LABEL_VALUES distinct values on a
sample of slices is a label map; everything else (float data, many grey
levels) is raw image data. The sample keeps the probe fast on large stacks.
"""

import json
import sys

import numpy as np

from tiff_validation_utils import safe_imread

MAX_LABEL_VALUES = 100   # same limit validate_tiff.py applies to annotation classes
SAMPLE_SLICES = 8


def probe(path):
    data = safe_imread(path)
    if data.ndim == 2:
        data = data[np.newaxis, ...]
    if data.ndim != 3:
        # Multi-channel or higher-dimensional stacks are image data
        return {
            "kind": "raw",
            "dtype": str(data.dtype),
            "sliceCount": int(data.shape[0]),
            "width": int(data.shape[-1]),
            "height": int(data.shape[-2]),
            "uniqueSampled": None,
            "maxValue": None,
            "reason": f"{data.ndim}-dimensional data"
        }

    n = data.shape[0]
    idx = np.unique(np.linspace(0, n - 1, min(n, SAMPLE_SLICES)).astype(int))
    sample = data[idx]
    is_integer = np.issubdtype(data.dtype, np.integer) or data.dtype == np.bool_
    values = np.unique(sample)
    n_unique = int(values.size)
    max_value = float(values.max()) if values.size else 0.0

    if is_integer and n_unique <= MAX_LABEL_VALUES:
        kind = "annotation"
        reason = f"integer data with {n_unique} distinct values"
    else:
        kind = "raw"
        reason = ("floating-point data" if not is_integer
                  else f"integer data with more than {MAX_LABEL_VALUES} distinct values")

    return {
        "kind": kind,
        "dtype": str(data.dtype),
        "sliceCount": int(n),
        "width": int(data.shape[2]),
        "height": int(data.shape[1]),
        "uniqueSampled": n_unique,
        "maxValue": max_value,
        "reason": reason
    }


def main():
    if len(sys.argv) < 2:
        print("PROBE_ERROR:" + json.dumps({"message": "usage: probe_upload.py <file.tif>"}))
        sys.exit(1)
    try:
        print("PROBE:" + json.dumps(probe(sys.argv[1])), flush=True)
    except Exception as e:  # noqa: BLE001
        print("PROBE_ERROR:" + json.dumps({"message": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
