"""Packaged Phase-2/3 SPINE extraction (autoextract): signed z-map -> line-summary mask.

The alternative to ``extract.extract_mask`` + ``postprocess`` (the "region" style),
designed with Lucas on 2026-08-25 from his manual-mask review of the PhantEM smoke
run. The region style has two shortcomings he identified as a correlated-noise
practitioner:

  1. It is POSITIVE-ONLY. The Sato ridge clips negative values and the threshold
     is one-sided, so anti-correlation lobes are never masked -- yet negative
     correlation is correlation: an anti-correlated lag lets the network infer the
     center pixel just as a positively correlated one does. On PhantEM/Brno the
     lobes carry |z| = 22-33, stronger than much of the positive stripe.
  2. It masks REGIONS (areas). Over-masking removes the real signal context the
     network needs, risking < N2V. The mask that denoises reliably is a LINE
     SUMMARY: minimal pixels that still cover every strong correlation feature.

Design rules (Lucas, 2026-08-25 -- the mask he would draw by hand):
  * cover every strong correlation feature REGARDLESS OF SIGN;
  * one 1-px line per feature, along the feature's own principal axis, spanning
    the feature's SIGNIFICANT-EVIDENCE extent (no full-length safety arms);
  * a single center-connected structure (straight rays connect detached features
    to the center -- on a lobed ACF this ray IS the transect across the lobes);
  * 180-deg symmetric (exact autocorrelation symmetry);
  * minimal pixel count, preferring near-center pixels (optional |z| budget).

Validated against his manual Brno mask: 23 px, precision 0.83 / recall 0.76, with
identical anatomy (stripe spine + lobe ticks + transect). The naive fixes fail:
a two-sided |z| threshold merges the adjacent stripe + lobes into one 61-px blob,
and skeletonizing a blob collapses the multi-feature structure into one line --
hence the FEATURE-WISE treatment here.

Pipeline position: runs AFTER the router gates (Dmax / coherence act on the raw
ACF exactly as before -- see ``AutoMaskExtractor``) and INSTEAD OF ridge-enhance +
region-extract + thin/prune. Input is the pure signed radial z-score map
(``enhance(radial='zscore', scale_mode='outer', ridge=None)``): calibrated in
noise-sigmas, so the two-sided threshold is a literal significance cut.
"""
import numpy as np
from scipy.ndimage import label, generate_binary_structure

from . import enhance as p1
from .postprocess import _removable_pair


_STRUCT8 = generate_binary_structure(2, 2)


def _center_component(mask, cy, cx):
    labeled, _ = label(mask, structure=_STRUCT8)
    return labeled == labeled[cy, cx]


def feature_spine(feature_mask, weights):
    """1-px line through one connected feature along its |weights|-weighted
    principal axis, spanning the feature's own extent.

    For each integer position along the principal axis (weighted PCA of the
    feature's pixel coordinates) the feature pixel closest to that axis position
    is kept. Elongated features (stripes, lobes) reduce to their medial line;
    a 1-2 px feature is returned unchanged.
    """
    ys, xs = np.where(feature_mask)
    if len(ys) <= 2:
        return feature_mask.copy()
    w = np.abs(weights[ys, xs])
    if w.sum() <= 0:
        w = np.ones_like(w)
    my, mx = np.average(ys, weights=w), np.average(xs, weights=w)
    dy, dx = ys - my, xs - mx
    cov = np.array([[np.average(dy * dy, weights=w), np.average(dy * dx, weights=w)],
                    [np.average(dy * dx, weights=w), np.average(dx * dx, weights=w)]])
    evals, evecs = np.linalg.eigh(cov)
    ax = evecs[:, int(np.argmax(evals))]
    proj = dy * ax[0] + dx * ax[1]
    out = np.zeros_like(feature_mask)
    for t in range(int(np.floor(proj.min())), int(np.ceil(proj.max())) + 1):
        d2 = (proj - t) ** 2 + (dy - proj * ax[0]) ** 2 + (dx - proj * ax[1]) ** 2
        k = int(np.argmin(d2))
        out[ys[k], xs[k]] = True
    return out


def _connect_to_center(mask, cy, cx):
    """Connect every detached component to the center with a straight ray to its
    nearest pixel. On a lobed ACF this ray is the transect across the lobes --
    the connector is itself informative structure (the sign-oscillation axis)."""
    out = mask.copy()
    out[cy, cx] = True
    H, W = out.shape
    while True:
        labeled, n = label(out, structure=_STRUCT8)
        keep = labeled[cy, cx]
        if n <= 1:
            return out
        best = None
        for i in range(1, n + 1):
            if i == keep:
                continue
            ys, xs = np.where(labeled == i)
            d = np.hypot(ys - cy, xs - cx)
            k = int(np.argmin(d))
            if best is None or d[k] < best[0]:
                best = (float(d[k]), int(ys[k]), int(xs[k]))
        _, ty, tx = best
        steps = max(abs(ty - cy), abs(tx - cx))
        for s in range(1, steps + 1):
            yy = cy + round((ty - cy) * s / steps)
            xx = cx + round((tx - cx) * s / steps)
            if 0 <= yy < H and 0 <= xx < W:
                out[yy, xx] = True


def budget_prune(mask, value, max_pixels, cy, cx):
    """Greedy lowest-|value|-first removal in 180-deg-symmetric pairs, topology-
    safe (simple-point + no-orphan via ``postprocess._removable_pair``), until
    ``mask`` has at most ``max_pixels`` True pixels. Implements the "minimal,
    near-center preferred" budget: far weak pixels go first, arms never sever."""
    if max_pixels is None:
        return mask
    work = mask.copy()
    H, W = work.shape
    while int(work.sum()) > int(max_pixels):
        ys, xs = np.where(work)
        cands = sorted((abs(float(value[y, x])), y, x)
                       for y, x in zip(ys, xs) if (y, x) != (cy, cx))
        removed = False
        for _, y, x in cands:
            if not work[y, x]:
                continue
            q = (H - 1 - y, W - 1 - x)
            if _removable_pair(work, (y, x), q, cy, cx):
                work[y, x] = False
                work[q] = False
                removed = True
                break
        if not removed:
            break
    return work


def extract_spine_mask(acf_raw, *, thresh=8.0, rho_floor=None, max_pixels=None,
                       min_feature_px=1, return_zmap=False):
    """Signed raw ACF -> line-summary StructN2V mask.

    acf_raw     : the Phase-1 averaged detrended signed ACF (router already passed).
    thresh      : TWO-SIDED significance cut in noise-sigmas: a pixel is evidence
                  when |z| >= thresh on the radial z-score map. The validated
                  region-style value 8.0 carries over (same calibrated map).
    rho_floor   : optional EFFECT-SIZE floor (2026-08-25 discussion with Lucas).
                  The z-map measures certainty, not severity: ~2000 averaged
                  patches shrink the standard error until rho = 0.004 clears
                  z = 8. What determines the LEAK risk of an unmasked lag is the
                  actual correlation coefficient -- the center-normalized raw-ACF
                  value. With a floor set, mask pixels with |rho| < rho_floor are
                  dropped after assembly (z gates whether a feature is REAL, rho
                  gates whether it is WORTH masking). This may DISCONNECT the
                  mask -- deliberately so: connectivity is not required by the
                  StructN2V training math (design rule struck by Lucas,
                  2026-08-25); with a floor active, connectivity emerges where
                  correlation demands it and dissolves where it does not. If the
                  whole mask collapses to the center, the caller's degenerate
                  gate routes to N2V -- the floor doubles as an effect-size
                  routing criterion. None (default) disables the floor pending
                  the strict-vs-floor training ablation.
    max_pixels  : optional budget; greedy |z|-ranked topology-safe pruning
                  (applied before the floor, while the mask is still connected).
    min_feature_px : drop features smaller than this before spining (1 keeps
                  every significant pixel; raise to suppress isolated specks).
    return_zmap : if True, also return the signed z-map (for review figures).

    Returns (mask, info) -- or (mask, info, zmap). The mask is full ACF-sized
    (NOT tightened; the caller applies its own tightening), center True, exactly
    180-deg symmetric; a single center-connected component of 1-px feature lines
    when rho_floor is None, possibly disconnected when the floor is active.
    """
    z = p1.enhance(acf_raw, radial='zscore', scale_mode='outer', ridge=None)
    H, W = z.shape
    cy, cx = H // 2, W // 2

    lines = np.zeros((H, W), dtype=bool)
    n_features = 0
    for signed in (z >= thresh, z <= -thresh):
        labeled, n = label(signed, structure=_STRUCT8)
        for i in range(1, n + 1):
            f = labeled == i
            npx = int(f.sum())
            if npx < min_feature_px:
                continue
            n_features += 1
            lines |= feature_spine(f, z) if npx > 2 else f

    n_evidence = int((np.abs(z) >= thresh).sum())
    mask = _connect_to_center(lines, cy, cx)
    # z is exactly 180-deg symmetric (Phase-1 symmetrize), so features, spines and
    # rays come out symmetric already; assert defensively as the other styles do.
    mask = mask | mask[::-1, ::-1]
    mask = _center_component(mask, cy, cx)
    mask = budget_prune(mask, z, max_pixels, cy, cx)

    n_floor_dropped = 0
    if rho_floor is not None:
        # Effect-size floor on the raw center-normalized ACF (|rho|). Symmetric by
        # construction (the ACF is symmetrized upstream in averaging; assert with
        # the same 180-deg fold used everywhere). May disconnect -- see docstring.
        rho = 0.5 * (np.abs(acf_raw) + np.abs(acf_raw)[::-1, ::-1])
        keep = rho >= float(rho_floor)
        keep[cy, cx] = True
        n_floor_dropped = int((mask & ~keep).sum())
        mask = mask & keep
    mask[cy, cx] = True

    info = dict(n_features=n_features, n_evidence=n_evidence,
                n_mask=int(mask.sum()), spine_thresh=float(thresh),
                rho_floor=rho_floor, n_floor_dropped=n_floor_dropped)
    if return_zmap:
        return mask, info, z
    return mask, info
