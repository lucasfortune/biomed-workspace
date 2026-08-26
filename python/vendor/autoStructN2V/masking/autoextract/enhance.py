"""Packaged Phase-1 ACF enhancement (autoextract).

Turns the Stage-1 background selector's **averaged detrended (signed) ACF** into
an *enhanced* map in which the faint structural correlation pattern stands clearly
above a flat ~0 noise floor — the input Phase 2 (extraction) will threshold.

Design lesson from the failed 2026-06-10 prototype: **keep the ACF signed — never
``np.abs``.** Rectification lifts the noise floor to the level of the faint arms
("unspecific noise"). Everything here operates on signed values.

Backbone (user-agreed 2026-06-12, near parameter-free statistics):
  1. symmetrize       — fold ACF onto its 180-deg rotation and average. Auto-
                        correlation is EXACTLY 180-deg symmetric, so real arms
                        survive and uncorrelated estimation noise halves in
                        variance (~sqrt(2) SNR gain). No parameters.
  2. radial normalize — remove the isotropic nuisance (central-peak tail +
                        isotropic noise pedestal), which depends only on radius,
                        leaving the ANISOTROPIC structural residual. Modes:
                          'subtract' : a - ring_robust_center  (signed, ~0 floor)
                          'zscore'   : (a - ring_center) / ring_robust_scale
                                       -> unitless "sigmas above this ring's noise";
                                       flat noise ~ N(0,1), arms = high-z ridges,
                                       so a SINGLE global threshold is meaningful.
                          'none'     : skip.
                        Ring center/scale use robust stats (median / 1.4826*MAD).
                        Few-pixel inner rings -> optional 'global'/'outer' scale.
  3. ridge (optional) — Frangi/Sato vesselness to boost faint ELONGATED arms and
                        suppress isotropic noise. Adds a scale parameter, so it is
                        OPT-IN (a toggle), not part of the default backbone.
  4. contrast (visual)— log1p / CLAHE. Included so the user can JUDGE them; NOT
                        load-bearing (both amplify noise / are non-robust).

The center pixel (r=0) is the autocorrelation peak; Phase 2/3 always re-assert it
(StructN2V masks the center). Here it carries no structural information, so the
radial steps naturally send it to ~0 and helpers can blank it for display.

Runs under ``/usr/bin/python3`` (numpy 1.26 / mpl 3.8 / skimage 0.22); the anaconda
python has a numpy2/matplotlib ABI break (see session logs).
"""
import numpy as np


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def center_yx(acf):
    return acf.shape[0] // 2, acf.shape[1] // 2


def radius_map(acf, integer=True):
    """Euclidean distance of each pixel from the center (rounded to int by default)."""
    H, W = acf.shape
    cy, cx = center_yx(acf)
    yy, xx = np.indices((H, W))
    r = np.hypot(yy - cy, xx - cx)
    return np.round(r).astype(int) if integer else r


def blank_center(a, value=np.nan):
    """Return a copy with the center pixel set to ``value`` (for display/stats)."""
    out = a.copy()
    cy, cx = center_yx(out)
    out[cy, cx] = value
    return out


# ---------------------------------------------------------------------------
# Step 1 — symmetrize (exact 180-deg autocorrelation symmetry)
# ---------------------------------------------------------------------------
def symmetrize(acf):
    """Average the ACF with its 180-deg rotation: 0.5*(a + a[::-1, ::-1]).

    Real structure (symmetric) is preserved; uncorrelated estimation noise has
    its variance halved. Parameter-free.
    """
    return 0.5 * (acf + acf[::-1, ::-1])


# ---------------------------------------------------------------------------
# Step 2 — radial normalization (remove the isotropic nuisance)
# ---------------------------------------------------------------------------
def _ring_robust_stats(acf, exclude_center=True):
    """Per-integer-radius robust center (median) and scale (1.4826*MAD).

    Returns (r_map, center[r], scale[r]). The center pixel is excluded from its
    own (degenerate, 1-sample) ring when ``exclude_center``.
    """
    r = radius_map(acf, integer=True)
    rmax = int(r.max())
    center = np.zeros(rmax + 1)
    scale = np.zeros(rmax + 1)
    cy, cx = center_yx(acf)
    for rr in range(rmax + 1):
        m = r == rr
        if exclude_center and rr == 0:
            center[rr] = acf[cy, cx]
            scale[rr] = 0.0
            continue
        vals = acf[m]
        med = float(np.median(vals))
        mad = float(np.median(np.abs(vals - med)))
        center[rr] = med
        scale[rr] = mad * 1.4826
    return r, center, scale


def _global_scale(acf, mode="outer", outer_frac=0.55):
    """Robust noise scale from a region where structure is rare.

    mode 'global' uses all off-center pixels; 'outer' uses radius >= outer_frac*rmax.
    Used when per-ring scale is too noisy (few-pixel inner rings).
    """
    rcont = radius_map(acf, integer=False)
    off = blank_center(acf)
    if mode == "outer":
        sel = rcont >= outer_frac * rcont.max()
        vals = acf[sel]
    else:  # 'global'
        vals = off[~np.isnan(off)]
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med)))
    return max(mad * 1.4826, 1e-12)


def radial_subtract(acf, reduce="median"):
    """Subtract, at each radius, the ring's robust center -> anisotropic residual
    on a ~0 floor. Signed (no clipping)."""
    r, center, _ = _ring_robust_stats(acf)
    return acf - center[r]


def radial_zscore(acf, scale_mode="ring", outer_frac=0.55, eps=1e-9):
    """Per-radius studentization: (a - ring_center) / scale.

    scale_mode:
      'ring'   : per-ring robust scale (1.4826*MAD). Most adaptive; noisy for the
                 few-pixel inner rings.
      'outer'  : single robust scale from the outer annulus (radius >= outer_frac
                 * rmax), where structure is rare. Stable; assumes the noise scale
                 is roughly radius-independent after detrend.
      'global' : single robust scale from all off-center pixels.

    Output: "sigmas above this ring's noise floor". Flat noise ~ N(0,1); structural
    arms become high-z ridges -> a single global threshold separates them.
    """
    r, center, ring_scale = _ring_robust_stats(acf)
    resid = acf - center[r]
    if scale_mode == "ring":
        scale = np.where(ring_scale[r] > eps, ring_scale[r], np.nan)
        # Degenerate (uniform) rings -> fall back to the global outer scale so we
        # don't divide by ~0 and explode noise.
        gs = _global_scale(acf, mode="outer", outer_frac=outer_frac)
        scale = np.where(np.isnan(scale), gs, scale)
    else:
        scale = _global_scale(acf, mode=scale_mode, outer_frac=outer_frac)
    z = resid / scale
    cy, cx = center_yx(acf)
    z[cy, cx] = 0.0  # center carries no structural info; re-asserted downstream
    return z


# ---------------------------------------------------------------------------
# Step 3 — ridge / vesselness (OPTIONAL toggle)
# ---------------------------------------------------------------------------
def ridge_enhance(a, method="sato", sigmas=(1, 2), black_ridges=False):
    """Vesselness response to boost faint elongated arms, suppress isotropic noise.

    OPT-IN (user 2026-06-12: statistics backbone, ridge optional). Operates on the
    enhanced (e.g. z-scored) map. ``black_ridges=False`` detects bright ridges
    (our arms are positive after enhancement). Negative values are clipped to 0
    first (vesselness expects bright structures on a dark background).
    """
    from skimage.filters import frangi, sato
    x = np.maximum(np.asarray(a, dtype=np.float64), 0.0)
    if x.max() > 0:
        x = x / x.max()
    fn = sato if method == "sato" else frangi
    return fn(x, sigmas=sigmas, black_ridges=black_ridges)


# ---------------------------------------------------------------------------
# Step 4 — contrast (VISUAL ONLY; not load-bearing)
# ---------------------------------------------------------------------------
def contrast(a, method="none", clip_negative=True):
    """Visual contrast remaps for the user to judge. NOT part of extraction.

    'log'   : sign-preserving log1p (compresses dynamic range).
    'clahe' : contrast-limited adaptive histogram equalization (skimage), on the
              positive part rescaled to [0, 1].
    """
    if method == "none":
        return a
    if method == "log":
        return np.sign(a) * np.log1p(np.abs(a))
    if method == "clahe":
        from skimage.exposure import equalize_adapthist
        x = np.maximum(a, 0.0) if clip_negative else a - a.min()
        rng = x.max() - x.min()
        x = (x - x.min()) / rng if rng > 0 else np.zeros_like(x)
        return equalize_adapthist(x, clip_limit=0.03)
    raise ValueError(f"unknown contrast method {method!r}")


# ---------------------------------------------------------------------------
# Full Phase-1 pipeline (all toggles)
# ---------------------------------------------------------------------------
def enhance(acf, *, sym=True, radial="zscore", scale_mode="ring", outer_frac=0.55,
            ridge=None, ridge_sigmas=(1, 2), contrast_method="none",
            return_stages=False):
    """Run the Phase-1 enhancement chain with toggles.

    sym             : symmetrize (180-deg fold).
    radial          : 'zscore' | 'subtract' | 'none'.
    scale_mode      : z-score scale source ('ring' | 'outer' | 'global').
    ridge           : None | 'sato' | 'frangi' (optional vesselness).
    ridge_sigmas    : scale range for the ridge filter.
    contrast_method : 'none' | 'log' | 'clahe' (visual only).
    return_stages   : if True, also return an ordered dict of intermediate maps.

    Returns the enhanced map (or (map, stages) if return_stages).
    """
    stages = {"raw": acf}
    a = acf
    if sym:
        a = symmetrize(a)
        stages["symmetrized"] = a
    if radial == "zscore":
        a = radial_zscore(a, scale_mode=scale_mode, outer_frac=outer_frac)
        stages["zscore"] = a
    elif radial == "subtract":
        a = radial_subtract(a)
        stages["radial_subtract"] = a
    if ridge:
        a = ridge_enhance(a, method=ridge, sigmas=ridge_sigmas)
        stages["ridge"] = a
    if contrast_method != "none":
        a = contrast(a, method=contrast_method)
        stages[f"contrast_{contrast_method}"] = a
    return (a, stages) if return_stages else a
