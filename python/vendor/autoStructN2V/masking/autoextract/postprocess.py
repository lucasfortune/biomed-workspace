"""Packaged Phase-3 postprocessing (autoextract): mask area reduction.

The Phase-2 extractor emits clean, shape-correct masks (stripe→bar,
cross/et/real-ET→"+") that are **uniformly thick** but **too wide**. This module
trims the covered area while **keeping the shape intact** — a stripe stays a
stripe, a cross stays a cross — so StructN2V co-masks only the genuinely-correlated
lag offsets and does not over-mask (over-masking removes real signal context,
risking < N2V).

Two geometric thinning methods:

  (A) SKELETONIZE — collapse every arm to its 1-px medial axis
      (``skimage.morphology.skeletonize``). Maximal area cut, topology preserved
      (bar→line, +→cross). The aggressive baseline; discards all width nuance and can
      sprout short spurs on an irregular boundary.

  (B) THIN / ERODE (N iterations) — peel N outer layers, tunable between the full mask
      (N=0) and the skeleton (N→∞).
        - ``thin``  : ``skimage.morphology.thin`` — topology-preserving thinning that
          keeps endpoints and arm length; the better-behaved knob.
        - ``erode`` : ``scipy.ndimage.binary_erosion`` — simple morphological peel; also
          retracts arm *length* (endpoints recede), so arms shorten as well as narrow.

Width here is NOT a faithful correlation width — it is largely a Sato-ridge artifact
(fixed vessel scale) — so geometric thinning is justified.

Every method enforces the same invariants as Phase-2 so the output stays a valid
StructN2V mask:
  * the **center is always masked** (StructN2V blinds the center pixel),
  * the mask is **180°-symmetric** (exact autocorrelation symmetry), and
  * only the **center-connected component** is kept (drop detached specks).

Runs under ``/usr/bin/python3`` (numpy 1.26 / scipy 1.11 / skimage 0.22).
"""
import numpy as np
from scipy.ndimage import binary_erosion, label, generate_binary_structure
from skimage.morphology import skeletonize, thin

from . import enhance as p1


# ---------------------------------------------------------------------------
# Shared invariants (mirror maskext_phase2.extract_mask)
# ---------------------------------------------------------------------------
def _symmetrize_bool(mask):
    """180°-symmetric OR (exact autocorrelation symmetry)."""
    return mask | mask[::-1, ::-1]


def _center_component(mask):
    """Keep only the 8-connected component touching the center."""
    cy, cx = mask.shape[0] // 2, mask.shape[1] // 2
    structure = generate_binary_structure(2, 2)
    labeled, _ = label(mask, structure=structure)
    lab = labeled[cy, cx]
    if lab == 0:                      # center fell off — force it back on
        return _single_center(mask)
    return labeled == lab


def _single_center(mask):
    out = np.zeros_like(mask, bool)
    out[mask.shape[0] // 2, mask.shape[1] // 2] = True
    return out


def _finalize(mask):
    """Enforce the StructN2V invariants: center masked, 180°-symmetric, center
    component only. Applied after every thinning op so the result is always valid.
    """
    cy, cx = mask.shape[0] // 2, mask.shape[1] // 2
    mask = mask.copy()
    mask[cy, cx] = True               # center is always masked
    mask = _symmetrize_bool(mask)     # the symmetrize may re-bridge a speck...
    mask = _center_component(mask)    # ...so re-take the center component
    mask[cy, cx] = True
    return mask


# ---------------------------------------------------------------------------
# (A) Skeletonize
# ---------------------------------------------------------------------------
def skeletonize_mask(mask):
    """1-px medial-axis skeleton of ``mask`` (aggressive area cut, shape preserved).

    ``skeletonize`` may break exact symmetry by tie-breaking, so ``_finalize``
    re-symmetrizes and re-takes the center component.
    """
    sk = skeletonize(np.asarray(mask, bool))
    return _finalize(sk)


# ---------------------------------------------------------------------------
# (B) Thin / erode by N iterations
# ---------------------------------------------------------------------------
def thin_mask(mask, n_iters=1):
    """Topology-preserving thinning by ``n_iters`` (``skimage.morphology.thin``).

    n_iters=0 returns the (finalized) input; large n_iters → the skeleton. Endpoints
    and arm length are preserved, so arms narrow without shrinking in reach.
    """
    mask = np.asarray(mask, bool)
    if n_iters <= 0:
        return _finalize(mask)
    th = thin(mask, max_num_iter=int(n_iters))
    return _finalize(th)


def erode_mask(mask, n_iters=1):
    """Morphological erosion by ``n_iters`` 3×3 peels (``scipy.ndimage.binary_erosion``).

    Unlike ``thin``, erosion also retracts arm *length* (endpoints recede). ``_finalize``
    restores the center if erosion deletes it entirely.
    """
    mask = np.asarray(mask, bool)
    if n_iters <= 0:
        return _finalize(mask)
    er = binary_erosion(mask, structure=np.ones((3, 3), bool), iterations=int(n_iters))
    return _finalize(er)


# ---------------------------------------------------------------------------
# Value-prune — remove low-raw-ACF masked pixels, topology-safe
# ---------------------------------------------------------------------------
# The Phase-1 enhancement (z-score/outer + Sato ridge) can mask pixels whose TRUE
# correlation (raw, pre-enhancement ACF) is ~0 or negative -- e.g. the Sato ridge
# "blooms" at the junction where cross arms intersect, and the radial z-score boosts
# near-center diagonal lags. Jurkat (centrally-concentrated cross) triggers both and
# ends up with the most masked pixels despite thin arms. We veto those pixels using
# the ORIGINAL signal: drop masked lags whose raw-ACF value is below a noise-relative
# significance threshold -- but only where removal is TOPOLOGY-SAFE.
#
# Safety gate = the textbook "simple point" test (crossing number A(p)=1): the two
# user-requested guards collapse into one condition --
#   * interior pixel (all 8 nbrs masked)            -> A=0 -> BLOCKED (no holes), and
#   * mid-arm / cut pixel (arm enters & exits)      -> A=2 -> BLOCKED (no severed arms),
#   * genuine tip/border pixel (one fg run)         -> A=1 -> removable.
# A(p)=1 is local; removing the symmetric PAIR at once can still disconnect, so we
# back it with a global orphan re-check (center component must keep every other pixel).

def _crossing_number(mask, y, x):
    """A(p): #background->foreground transitions around the 8-neighborhood cycle.
    A=1 <=> simple/border point (removable); A=0 interior; A>=2 cut/branch point.
    """
    nb = [mask[y - 1, x], mask[y - 1, x + 1], mask[y, x + 1], mask[y + 1, x + 1],
          mask[y + 1, x], mask[y + 1, x - 1], mask[y, x - 1], mask[y - 1, x - 1]]
    return sum(1 for i in range(8) if (not nb[i]) and nb[(i + 1) % 8])


def _removable_pair(mask, p, q, cy, cx):
    """True if removing masked pixels p (and its mirror q) is topology-safe.

    Guards: never the center; both must be simple points (A=1, so no holes and no
    mid-arm cuts); and a global orphan check (after removing the pair, the center
    component must still contain every other masked pixel).
    """
    if p == (cy, cx) or q == (cy, cx):
        return False
    if _crossing_number(mask, *p) != 1 or _crossing_number(mask, *q) != 1:
        return False
    trial = mask.copy()
    trial[p] = False
    trial[q] = False
    structure = generate_binary_structure(2, 2)
    labeled, _ = label(trial, structure=structure)
    keep = labeled == labeled[cy, cx]
    return int(keep.sum()) == int(trial.sum())     # nothing orphaned


def _outer_scale(acf, outer_frac=0.55):
    r = p1.radius_map(acf, integer=False)
    vals = acf[r >= outer_frac * r.max()]
    med = float(np.median(vals))
    return float(np.median(np.abs(vals - med)) * 1.4826)


def value_map(acf_raw, ref="zmap"):
    """Per-pixel significance map used to RANK/THRESHOLD pruning (not for shape).

    ref='zmap' (default, user 2026-06-24): the **pre-Sato** radial z-score map
        (``enhance(radial='zscore', scale_mode='outer', ridge=None)``). The radial
        z-score removes the central isotropic pedestal, so weak directional arms stand
        out (high z relative to their ring) and the Sato junction *bloom* -- which only
        entered the mask via the ridge filter -- ranks low. Calibrated in noise-sigmas
        (flat floor ~N(0,1)), so ``value_k`` is a literal z-cut and ``thr_scale``=1.
    ref='raw' : symmetrized center-normalized raw ACF (legacy). Dominated by the central
        peak, so it removes weak valid arms and preserves the diagonal widening -- kept
        only for comparison. ``thr_scale`` = the raw outer-annulus robust noise.

    Returns (vmap, thr_scale); the prune threshold is ``value_k * thr_scale``.
    """
    if ref == "zmap":
        return p1.enhance(acf_raw, radial="zscore", scale_mode="outer", ridge=None), 1.0
    if ref == "raw":
        a = p1.symmetrize(acf_raw)
        return a, _outer_scale(a)
    raise ValueError(f"unknown value ref {ref!r}; choose 'zmap' or 'raw'")


def _axis_extent(mask):
    """(ex, ey) = the mask's axis-aligned reach: max |dx| and max |dy| from center."""
    cy, cx = mask.shape[0] // 2, mask.shape[1] // 2
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0, 0
    return int(np.max(np.abs(xs - cx))), int(np.max(np.abs(ys - cy)))


def value_prune(mask, acf_raw, *, value_k=3.0, value_ref="zmap", protect_extent=True,
                max_pixels=None):
    """Topology-safe removal of low-significance masked pixels.

    mask       : a (postprocessed) binary mask, e.g. ``thin_mask(..., 3)``.
    acf_raw    : the RAW Stage-1 ACF (pre Phase-1 enhancement).
    value_ref  : significance map for ranking -- 'zmap' (pre-Sato radial z-score; the
                 directional-significance map; default) or 'raw' (legacy absolute ACF).
                 Shape comes from ``mask``; only *which* pixels are weak comes from here.
    value_k    : prune masked lags whose value-map score < value_k * thr_scale. For
                 'zmap' this is a z-sigma cut (thr_scale=1); for 'raw' a robust-noise
                 multiple. None disables the value criterion (cap-only).
    protect_extent : if True (user gate 2026-06-24), never remove a pixel whose removal
                 would shorten the mask's axis-aligned reach (max |dx| or max |dy|). This
                 protects the weak-but-valid arm tips (which define the extent) while
                 still allowing off-axis / diagonal pixels to be pruned -- so a cross
                 keeps its arm length and just loses its junction bloom.
    max_pixels : hard backstop. After the value pass, keep removing the lowest-score
                 *removable* pixels (now possibly above threshold) until <= max_pixels.
                 None disables the cap.

    Removal is greedy lowest-score-first, in 180-symmetric pairs, and only where
    ``_removable_pair`` allows (simple point + no orphan). Peels inward from the
    boundary; stops the moment it would cut an arm or hole a core.
    """
    work = np.asarray(mask, bool).copy()
    cy, cx = work.shape[0] // 2, work.shape[1] // 2
    vmap, thr_scale = value_map(acf_raw, ref=value_ref)
    thr = None if value_k is None else value_k * thr_scale
    ex0, ey0 = _axis_extent(work)            # original reach to preserve (constant)

    while True:
        ys, xs = np.where(work)
        cands = []
        for y, x in zip(ys, xs):
            if (y, x) == (cy, cx):
                continue
            v = float(vmap[y, x])
            below_thr = (thr is not None) and (v < thr)
            over_cap = (max_pixels is not None) and (int(work.sum()) > max_pixels)
            if below_thr or over_cap:
                cands.append((v, y, x))
        if not cands:
            break
        cands.sort()                                   # lowest significance first
        removed = False
        for v, y, x in cands:
            if not work[y, x]:
                continue
            my, mx = work.shape[0] - 1 - y, work.shape[1] - 1 - x
            if not _removable_pair(work, (y, x), (my, mx), cy, cx):
                continue
            if protect_extent:
                trial = work.copy(); trial[y, x] = False; trial[my, mx] = False
                ex1, ey1 = _axis_extent(trial)
                if ex1 < ex0 or ey1 < ey0:             # would shorten arm reach
                    continue
            work[y, x] = False
            work[my, mx] = False
            removed = True
            break                                      # re-evaluate topology after each
        if not removed:
            break                                      # remaining candidates are protected
        if max_pixels is not None and thr is None and int(work.sum()) <= max_pixels:
            break
    work[cy, cx] = True
    return work


# ---------------------------------------------------------------------------
# Unified dispatcher + stats
# ---------------------------------------------------------------------------
_METHODS = {
    "skeleton": lambda m, n: skeletonize_mask(m),
    "thin": thin_mask,
    "erode": erode_mask,
}


def postprocess(mask, method="thin", n_iters=1):
    """Apply a Phase-3 postprocessor. method ∈ {'skeleton','thin','erode'}.

    'skeleton' ignores ``n_iters`` (it is the n→∞ limit).
    """
    if method not in _METHODS:
        raise ValueError(f"unknown method {method!r}; choose from {sorted(_METHODS)}")
    return _METHODS[method](mask, n_iters)


def mask_extent(mask):
    """Max Chebyshev radius of the mask from center (how far the arms reach)."""
    cy, cx = mask.shape[0] // 2, mask.shape[1] // 2
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0
    return int(np.max(np.maximum(np.abs(ys - cy), np.abs(xs - cx))))


def mask_stats(before, after):
    """Area-reduction summary for a before→after postprocessing pair."""
    nb, na = int(before.sum()), int(after.sum())
    return dict(
        n_before=nb, n_after=na,
        reduction=1.0 - na / max(nb, 1),
        extent_before=mask_extent(before), extent_after=mask_extent(after),
    )
