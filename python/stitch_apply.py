#!/usr/bin/env python3
"""
Stitch composition: apply a stitch recipe to a set of stacks (ADR-007).

Reads a recipe config, places every stack by its rigid transform (integer
z-offset; in-plane dx, dy, rotation), and streams the composed volume to a
single output TIFF slice by slice (memory-safe for full-size EM stacks).

Composition rules by mode:
    grayscale - linear interpolation, feathered blending across xy-overlap
                bands, optional mean/std intensity match to the reference
                stack
    labels    - nearest-neighbor only (class IDs never average), precedence
                by stack order in xy overlap (hard seam by design), no
                intensity matching, class-set consistency warning

z-duplicate sections are resolved by TRIMMING (the recipe's z_keep ranges),
never by blending: duplicated z-positions are two images of the same
physical section and averaging them softens detail.

Config JSON:
{
  "output_path": str,
  "mode": "grayscale" | "labels",
  "fill_value": number | null,      # null: grayscale -> reference mean, labels -> 0
  "crop_to_common": bool,           # xy intersection instead of union
  "intensity_match": bool,          # grayscale only
  "feather_px": int,                # default 64
  "stacks": [                       # first entry = reference (precedence order)
    {"path": str,
     "z_offset": int,               # global z of the stack's slice 0
     "dx": float, "dy": float,      # in-plane translation (px, global frame)
     "rotation_deg": float,         # about the slice center
     "z_keep": [start, end]}        # kept slice range (end exclusive)
  ]
}

stdout protocol: STITCH_PROGRESS: / STITCH_RESULT: / STITCH_ERROR: + JSON
"""

import sys
import json
import math
import argparse
import traceback

import numpy as np
import tifffile
from scipy import ndimage


def emit(prefix, data):
    print(f"{prefix}:{json.dumps(data)}", flush=True)


class PlacedStack:
    """One input stack with its placement and cached geometry."""

    def __init__(self, spec, index):
        self.index = index
        self.path = spec['path']
        self.z_offset = int(spec.get('z_offset', 0))
        self.dx = float(spec.get('dx', 0.0))
        self.dy = float(spec.get('dy', 0.0))
        self.rot = float(spec.get('rotation_deg', 0.0))

        self.tif = tifffile.TiffFile(self.path)
        series = self.tif.series[0]
        shape = series.shape
        if len(shape) == 2:
            self.n_slices, (self.h, self.w) = 1, shape
        else:
            self.n_slices, self.h, self.w = shape[0], shape[-2], shape[-1]
        self.dtype = np.dtype(series.dtype)

        z_keep = spec.get('z_keep') or [0, self.n_slices]
        self.keep0 = max(0, int(z_keep[0]))
        self.keep1 = min(self.n_slices, int(z_keep[1]))

        # Global z range covered by the kept slices
        self.g_z0 = self.z_offset + self.keep0
        self.g_z1 = self.z_offset + self.keep1

        # Fast path: no rotation and integer translation -> pure paste
        self.simple = (abs(self.rot) < 1e-9
                       and abs(self.dx - round(self.dx)) < 1e-6
                       and abs(self.dy - round(self.dy)) < 1e-6)

        # Intensity match (identity unless enabled later)
        self.gain, self.offset = 1.0, 0.0
        self._weights = None  # lazy, cached (canvas-sized)

    def read_slice(self, own_z):
        img = self.tif.pages[own_z].asarray()
        if img.ndim == 3:
            img = img[..., 0]
        return img

    def footprint_corners(self):
        """Slice corner coordinates in the global xy frame (y, x)."""
        c = np.array([(self.h - 1) / 2.0, (self.w - 1) / 2.0])
        t = np.array([self.dy, self.dx])
        th = math.radians(self.rot)
        R = np.array([[math.cos(th), -math.sin(th)],
                      [math.sin(th), math.cos(th)]])
        corners = np.array([[0, 0], [0, self.w - 1],
                            [self.h - 1, 0], [self.h - 1, self.w - 1]], dtype=float)
        return (R @ (corners - c).T).T + c + t

    def inverse_affine(self, origin):
        """(matrix, offset) for ndimage.affine_transform mapping canvas -> slice.

        Forward: global = R @ (own - c) + c + t; canvas = global - origin.
        Inverse: own = R^-1 @ (canvas + origin - c - t) + c
        """
        c = np.array([(self.h - 1) / 2.0, (self.w - 1) / 2.0])
        t = np.array([self.dy, self.dx])
        th = math.radians(self.rot)
        Rinv = np.array([[math.cos(th), math.sin(th)],
                         [-math.sin(th), math.cos(th)]])
        offset = Rinv @ (np.asarray(origin, dtype=float) - c - t) + c
        return Rinv, offset

    def project(self, img, canvas_shape, origin, order):
        """Place a slice onto the canvas frame."""
        if self.simple:
            out = np.zeros(canvas_shape, dtype=np.float32)
            y0 = int(round(self.dy)) - int(origin[0])
            x0 = int(round(self.dx)) - int(origin[1])
            cy0, cx0 = max(0, y0), max(0, x0)
            cy1 = min(canvas_shape[0], y0 + self.h)
            cx1 = min(canvas_shape[1], x0 + self.w)
            if cy1 > cy0 and cx1 > cx0:
                out[cy0:cy1, cx0:cx1] = img[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
            return out
        matrix, offset = self.inverse_affine(origin)
        return ndimage.affine_transform(
            img.astype(np.float32), matrix, offset=offset,
            output_shape=canvas_shape, order=order, mode='constant', cval=0.0)

    def weights(self, canvas_shape, origin, feather_px, mode):
        """Canvas-sized weight map (cached). Feathered for grayscale,
        binary for labels."""
        if self._weights is not None:
            return self._weights

        if self.simple:
            # Rectangular footprint: separable edge ramp, no transform needed
            def ramp(n):
                r = np.minimum(np.arange(n) + 1, np.arange(n)[::-1] + 1).astype(np.float32)
                return np.minimum(r / max(1, feather_px), 1.0)
            local = np.minimum.outer(ramp(self.h), ramp(self.w)) \
                if mode == 'grayscale' else np.ones((self.h, self.w), np.float32)
            w = self.project(local, canvas_shape, origin, order=1 if mode == 'grayscale' else 0)
        else:
            mask = self.project(np.ones((self.h, self.w), np.float32),
                                canvas_shape, origin, order=1)
            mask = (mask > 0.5).astype(np.float32)
            if mode == 'grayscale':
                dist = ndimage.distance_transform_edt(mask)
                w = np.minimum(dist / max(1, feather_px), 1.0).astype(np.float32)
            else:
                w = mask
        self._weights = w
        return w

    def sample_stats(self, max_samples=5):
        idx = np.linspace(self.keep0, self.keep1 - 1,
                          min(max_samples, self.keep1 - self.keep0)).astype(int)
        vals = [self.read_slice(int(i)).astype(np.float64) for i in idx]
        flat = np.concatenate([v.ravel() for v in vals])
        return float(flat.mean()), float(flat.std())


def run(config):
    mode = config.get('mode', 'grayscale')
    feather_px = int(config.get('feather_px', 64))
    output_path = config['output_path']

    stacks = [PlacedStack(s, i) for i, s in enumerate(config['stacks'])]
    if not stacks:
        raise ValueError('No stacks in recipe')
    warnings = []

    # ---- consistency checks -------------------------------------------------
    ref_dtype = stacks[0].dtype
    for s in stacks[1:]:
        if s.dtype != ref_dtype:
            warnings.append(f'dtype mismatch: {s.path} is {s.dtype}, '
                            f'reference is {ref_dtype}; casting to reference')
    if mode == 'labels':
        ref_classes = set(np.unique(stacks[0].read_slice(stacks[0].keep0)).tolist())
        for s in stacks[1:]:
            cls = set(np.unique(s.read_slice(s.keep0)).tolist())
            if cls - ref_classes:
                warnings.append(
                    f'label sets differ: {s.path} has classes '
                    f'{sorted(cls - ref_classes)} not present in the reference '
                    f'(sampled from the junction slices)')

    # ---- intensity match ----------------------------------------------------
    if mode == 'grayscale' and config.get('intensity_match'):
        ref_mean, ref_std = stacks[0].sample_stats()
        for s in stacks[1:]:
            m, sd = s.sample_stats()
            s.gain = ref_std / (sd + 1e-8)
            s.offset = ref_mean - s.gain * m

    # ---- canvas -------------------------------------------------------------
    corners = [s.footprint_corners() for s in stacks]
    if config.get('crop_to_common'):
        y0 = int(math.ceil(max(c[:, 0].min() for c in corners)))
        x0 = int(math.ceil(max(c[:, 1].min() for c in corners)))
        y1 = int(math.floor(min(c[:, 0].max() for c in corners)))
        x1 = int(math.floor(min(c[:, 1].max() for c in corners)))
        if y1 <= y0 or x1 <= x0:
            raise ValueError('crop_to_common: the stacks share no common area')
    else:
        y0 = int(math.floor(min(c[:, 0].min() for c in corners)))
        x0 = int(math.floor(min(c[:, 1].min() for c in corners)))
        y1 = int(math.ceil(max(c[:, 0].max() for c in corners)))
        x1 = int(math.ceil(max(c[:, 1].max() for c in corners)))
    origin = (y0, x0)
    canvas_shape = (y1 - y0 + 1, x1 - x0 + 1)

    g_z0 = min(s.g_z0 for s in stacks)
    g_z1 = max(s.g_z1 for s in stacks)
    total_slices = g_z1 - g_z0
    z_gaps = 0

    fill_value = config.get('fill_value')
    if fill_value is None:
        fill_value = 0.0 if mode == 'labels' else stacks[0].sample_stats()[0]

    # Interpolation order: labels must NEVER average class IDs
    order = 0 if mode == 'labels' else 1
    is_int = np.issubdtype(ref_dtype, np.integer)
    info = np.iinfo(ref_dtype) if is_int else None

    emit('STITCH_PROGRESS', {
        'status': 'starting', 'mode': mode,
        'width': canvas_shape[1], 'height': canvas_shape[0],
        'total_slices': total_slices, 'stacks': len(stacks),
    })

    # Keep at most a few weight maps in memory (chains touch <= 2 per z)
    weight_cache_order = []

    with tifffile.TiffWriter(output_path, bigtiff=True) as writer:
        for zi, gz in enumerate(range(g_z0, g_z1)):
            contributors = [s for s in stacks if s.g_z0 <= gz < s.g_z1]

            if not contributors:
                out = np.full(canvas_shape, fill_value, dtype=np.float32)
                z_gaps += 1
            elif mode == 'labels':
                out = np.full(canvas_shape, fill_value, dtype=np.float32)
                claimed = np.zeros(canvas_shape, dtype=bool)
                # Precedence: earlier stacks in the recipe win xy overlaps
                for s in contributors:
                    img = s.read_slice(gz - s.z_offset)
                    placed = s.project(img, canvas_shape, origin, order=0)
                    mask = (s.weights(canvas_shape, origin, feather_px, mode) > 0.5) & ~claimed
                    out[mask] = placed[mask]
                    claimed |= mask
            else:
                acc = np.zeros(canvas_shape, dtype=np.float32)
                wsum = np.zeros(canvas_shape, dtype=np.float32)
                for s in contributors:
                    img = s.read_slice(gz - s.z_offset).astype(np.float32)
                    if s.gain != 1.0 or s.offset != 0.0:
                        img = img * s.gain + s.offset
                    placed = s.project(img, canvas_shape, origin, order=order)
                    w = s.weights(canvas_shape, origin, feather_px, mode)
                    acc += placed * w
                    wsum += w
                out = np.where(wsum > 1e-6, acc / np.maximum(wsum, 1e-6), fill_value)

            # Evict cached weight maps of stacks no longer contributing
            for s in contributors:
                if s.index not in weight_cache_order:
                    weight_cache_order.append(s.index)
            active = {s.index for s in contributors}
            for s in stacks:
                if s._weights is not None and s.index not in active \
                        and s.g_z1 <= gz:
                    s._weights = None

            if is_int:
                out = np.clip(np.round(out), info.min, info.max)
            # contiguous=True appends every slice to ONE series; readers then
            # see a (Z, H, W) volume instead of 150 single-page series.
            writer.write(out.astype(ref_dtype), contiguous=True)

            if (zi + 1) % 5 == 0 or zi + 1 == total_slices:
                emit('STITCH_PROGRESS', {
                    'current_slice': zi + 1,
                    'total_slices': total_slices,
                    'progress_percent': round((zi + 1) / total_slices * 100.0, 1),
                })

    if z_gaps:
        warnings.append(f'{z_gaps} output slice(s) had no contributing stack '
                        '(z gap between placements) and were filled')

    for s in stacks:
        s.tif.close()

    emit('STITCH_RESULT', {
        'outputPath': output_path,
        'width': canvas_shape[1],
        'height': canvas_shape[0],
        'slices': total_slices,
        'mode': mode,
        'dtype': str(ref_dtype),
        'warnings': warnings,
    })


def main():
    parser = argparse.ArgumentParser(description='Apply a stitch recipe (ADR-007)')
    parser.add_argument('--config', required=True, help='Path to recipe/config JSON')
    args = parser.parse_args()

    try:
        with open(args.config) as f:
            config = json.load(f)
        run(config)
    except Exception as e:
        emit('STITCH_ERROR', {'message': str(e), 'details': traceback.format_exc()})
        sys.exit(1)


if __name__ == '__main__':
    main()
