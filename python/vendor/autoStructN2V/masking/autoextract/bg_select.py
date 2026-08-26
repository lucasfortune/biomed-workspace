"""Packaged Phase-1 input: automatic background selector (autoextract).

This module is the AutoStructN2V Stage-2 Phase-1 *input* — the background-patch
selector that supplies the averaged detrended noise ACF the mask extractor reads.
It is the auto-analogue of the manual ``PATCH_BY_DATASET`` pick in the StructN2V
baseline: it picks structure-free regions automatically, extracts patches across
all slices, and averages their *detrended* ACFs (the ever-present noise structure
reinforces while incidental signal averages out).

Core idea (session 2026-06-09_02): discoveries #1 (background) and #2 (detrend)
fuse. The "structure-content" score is measured AT A SCALE COARSER than the noise
correlation length, via a Gaussian gradient magnitude at scale ``sigma``. This
suppresses the high-frequency noise (so the structured noise we WANT to measure is
not penalised) and lights up coherent low-frequency signal structure (edges,
organelle boundaries). Background = low structure score, optionally gated by a
``dark|light|off`` intensity side.

The functions here are ported verbatim from the validated prototype
(``prototype_bg_selector.py``). The public data-driven entry point
``background_acf`` mirrors ``bg_extract_real_et.extract`` /
``analyze_variant``'s accumulation loop, fully parameterized and data-driven
(no dataset names, no file IO — it receives an in-memory stack).
"""
import numpy as np
from scipy.ndimage import (gaussian_filter, gaussian_gradient_magnitude,
                           binary_erosion)

ACF_CROP = 10
DETREND_SIGMA = 4.0          # high-pass scale (same as the analysis notebook)
STRUCT_SIGMA = 4.0           # structure-detection scale (>= noise corr length)


# --- ACF helpers (verbatim from autostructn2v_acf_analysis.ipynb) -----------
def _acf2d(x):
    x = x - x.mean()
    F = np.fft.fft2(x)
    a = np.fft.fftshift(np.real(np.fft.ifft2(np.abs(F) ** 2)))
    c = a[a.shape[0] // 2, a.shape[1] // 2]
    return a / c if c > 0 else a


def crop_center(arr, half=ACF_CROP):
    h, w = arr.shape
    half = min(half, h // 2, w // 2)        # never slice past the array (neg-index bug)
    cy, cx = h // 2, w // 2
    return arr[cy - half:cy + half + 1, cx - half:cx + half + 1]


def _detrend(x, sigma=DETREND_SIGMA):
    return x - gaussian_filter(x, sigma)


def estimate_noise_scale(stack, k=2.0, smin=4, smax=12, max_slices=12):
    """Estimate the structure/detrend scale FROM THE DATA (no dataset knowledge),
    so the method self-tunes to the input's pixel size / noise width instead of a
    fixed sigma.

    Measures the noise correlation half-width from the RAW slice-averaged ACF: the
    sharp central peak (noise + PSF) sits on a slow signal pedestal (estimated at
    radius 8-12); the radius where the peak falls to half above that pedestal is the
    noise HWHM. sigma = clip(round(k * HWHM), smin, smax). The smin FLOOR (=4, the
    validated default) guarantees no regression on data whose noise is fine (our
    cosem/FMD estimate ~4-6); sigma only grows for coarser-noise / upsampled inputs.
    """
    step = max(1, len(stack) // max_slices)
    acc, n = None, 0
    for sl in stack[::step]:
        a = _acf2d(sl.astype(np.float64))
        acc = a if acc is None else acc + a
        n += 1
    g = acc / n
    cy, cx = g.shape[0] // 2, g.shape[1] // 2
    K = min(14, cy - 1, cx - 1)
    prof = np.array([(g[cy, cx + k_] + g[cy, cx - k_] +
                      g[cy + k_, cx] + g[cy - k_, cx]) / 4 for k_ in range(K + 1)])
    ped = np.median(prof[8:13]) if K >= 12 else prof[-1]
    peak = prof[0] - ped
    if peak <= 1e-9:
        return smin
    half = ped + 0.5 * peak
    hk = float(K)
    for k_ in range(1, K + 1):
        if prof[k_] <= half:
            hk = (k_ - 1) + (prof[k_ - 1] - half) / (prof[k_ - 1] - prof[k_] + 1e-12)
            break
    return int(np.clip(round(k * hk), smin, smax))


# --- Background-patch selector ---------------------------------------------
def slice_structure(sl, sigma=STRUCT_SIGMA):
    """Per-pixel structure-content map of ONE slice: Gaussian gradient magnitude at
    scale ``sigma`` (detects coherent edges/boundaries while smoothing away the
    high-frequency noise -- incl. the structured stripe noise we KEEP for the ACF).

    Computed PER SLICE (not z-averaged): the volumes vary through z (cosem: smooth
    3D drift, corr~0.96 adjacent / ~0 far; FMD & synth: independent scene per slice,
    corr~0.1), so a z-averaged map picks a location that is background only ON
    AVERAGE -- fine where background is abundant (confocal) but lands on structure
    in dense stacks (the cosem-jurkat failure). Per-slice selection is robust to
    any z-regime.
    """
    return gaussian_gradient_magnitude(sl.astype(np.float64), sigma)


def detect_bg_side(struct, inten):
    """Decide whether background is the LIGHT or DARK intensity side, FROM THE DATA
    (no dataset knowledge). Background = low-structure pixels; if those are brighter
    on average than the high-structure (edge/signal) pixels, the background is light,
    else dark. This is what makes the intensity gate usable on unknown inputs.
    """
    from skimage.filters import threshold_otsu
    ls = np.log1p(struct)
    thr = threshold_otsu(ls)
    flat_i = inten[ls <= thr]                 # background candidates (low structure)
    edge_i = inten[ls > thr]                  # signal/edges (high structure)
    if flat_i.size == 0 or edge_i.size == 0:
        return "off"
    return "light" if flat_i.mean() >= edge_i.mean() else "dark"


def background_mask(struct, inten, struct_keep="otsu",
                    bg_side="off", inten_keep_pct=60.0):
    """Boolean background mask: flat AND (optionally) on the right intensity side.

    struct_keep: structure-flatness threshold selector.
        'otsu'  -> Otsu split of log1p(structure) (adaptive; default). The map is
                   heavily right-skewed (most pixels flat, edges spike), so Otsu on
                   the log separates the flat lobe from the structured tail without
                   a hand-set percentile that's wrong for both sparse-bg (cosem) and
                   abundant-bg (synth_cells) stacks.
        float   -> keep the flattest X percent of pixels (legacy fixed percentile).
    bg_side: 'dark' (bg is dark) | 'light' (bg is bright) | 'off' (flatness only).
    """
    if struct_keep == "otsu":
        from skimage.filters import threshold_otsu
        ls = np.log1p(struct)
        thr = threshold_otsu(ls)
        mask = ls <= thr
    elif isinstance(struct_keep, (int, float)):
        mask = struct <= np.percentile(struct, float(struct_keep))
    else:
        raise ValueError(f"struct_keep must be 'otsu' or a number, got {struct_keep!r}")
    if bg_side == "dark":
        mask &= inten <= np.percentile(inten, inten_keep_pct)
    elif bg_side == "light":
        mask &= inten >= np.percentile(inten, 100.0 - inten_keep_pct)
    elif bg_side != "off":
        raise ValueError(f"bg_side must be dark|light|off, got {bg_side!r}")
    return mask


def select_background_tiles(bgmask, psize=64, stride=None, purity=0.9):
    """Tile positions that are >= ``purity`` background. Returns list of (y0,x0).

    Collecting MANY pure tiles (vs one big rectangle) is the auto-analogue of the
    user's "select several patches and average" — it avoids the thin-strip
    pathology of a max-area rectangle and auto-adapts to fragmented background.
    """
    H, W = bgmask.shape
    psize = min(psize, H, W)
    stride = stride or psize // 2
    integ = np.zeros((H + 1, W + 1))            # summed-area table for fast purity
    integ[1:, 1:] = np.cumsum(np.cumsum(bgmask.astype(np.float64), 0), 1)
    tiles = []
    for y in range(0, H - psize + 1, stride):
        for x in range(0, W - psize + 1, stride):
            frac = (integ[y + psize, x + psize] - integ[y, x + psize]
                    - integ[y + psize, x] + integ[y, x]) / (psize * psize)
            if frac >= purity:
                tiles.append((y, x))
    return tiles, psize


def auto_select(bgmask, sizes=(64, 48, 32, 24), purities=(0.95, 0.85, 0.75, 0.6),
                min_tiles=4):
    """PURITY-FIRST tiling (user decision 2026-06-09_02): take the highest purity
    that yields >= min_tiles, and at that purity the LARGEST tile size that does.

    Cleaner ACF beats more lags-per-patch: structure leaking into the ACF (the
    cosem failure) corrupts the very directional signal we read, whereas a smaller
    pure tile loses only outer lags and we recover statistics by averaging many
    tiles x slices. Returns (tiles, psize, purity_used).
    """
    for pur in purities:                      # outer = purity (prefer pure)
        for P in sizes:                       # inner = size (largest that fits)
            tiles, PP = select_background_tiles(bgmask, psize=P, purity=pur)
            if len(tiles) >= min_tiles:
                return tiles, PP, pur
    tiles, PP = select_background_tiles(bgmask, psize=min(sizes), purity=0.5)
    return tiles, PP, 0.5


def averaged_acf_from_tiles(stack, tiles, psize, detrend=True, sigma=DETREND_SIGMA):
    """Average detrended ACFs over all (tile x slice) patches.

    ``sigma`` is the detrend (high-pass) scale. Defaults to ``DETREND_SIGMA`` so a
    bare call reproduces the prototype's fixed-4.0 behavior; ``background_acf`` passes
    the *active* (estimated or supplied) sigma so the ACF detrend matches the
    structure-detection scale (prototype production path detrends at the active sigma).
    """
    acc, n = None, 0
    for sl in stack:
        for (y, x) in tiles:
            p = sl[y:y + psize, x:x + psize].astype(np.float64)
            if detrend:
                p = _detrend(p, sigma)
            a = crop_center(_acf2d(p))
            acc = a if acc is None else acc + a
            n += 1
    return (acc / n if n else None), n


def averaged_acf_from_region(stack, box, detrend=True, sigma=DETREND_SIGMA):
    """Average detrended ACFs of one ``box`` extracted from every slice.

    ``sigma`` is the detrend scale (see ``averaged_acf_from_tiles``).
    """
    y0, y1, x0, x1 = box
    acc, n = None, 0
    for sl in stack:
        p = sl[y0:y1, x0:x1].astype(np.float64)
        if detrend:
            p = _detrend(p, sigma)
        a = crop_center(_acf2d(p))
        acc = a if acc is None else acc + a
        n += 1
    return acc / n, n


# --- Data-driven stack -> ACF entry point ----------------------------------
def bg_side_for(modality_or_variant):
    """Intensity side by MODALITY (user, session 2026-06-09): COSEM / FIB-SEM /
    real-ET-like data have a LIGHT background (dark stain / membranes); confocal
    (FMD, synth_cells) have a DARK (black) background. Convenience for supplying the
    now-required ``bg_side``; a name starting 'cosem' -> 'light', else 'dark'.
    (The intensity side is genuine acquisition knowledge the user always has; the
    former auto-detector was fooled on dense stacks -- see ``background_acf``.)"""
    return "light" if str(modality_or_variant).startswith("cosem") else "dark"


def background_acf(stack, *, bg_side, sigma='auto', struct_keep='otsu',
                   acf_crop=ACF_CROP, tile_sizes=(64, 48, 32, 24),
                   purities=(0.95, 0.85, 0.75, 0.6), min_tiles=4, detrend=True,
                   bg_erode=1, bg_box=None):
    """Averaged detrended background ACF for a stack of noisy slices (N,H,W).

    Mirrors bg_extract_real_et.extract / analyze_variant's accumulation, fully data-driven:
      1. sigma: if 'auto', estimate_noise_scale(stack); else use the float. Used as the
         detrend scale AND the structure-detection scale (the prototype ties DETREND_SIGMA
         and STRUCT_SIGMA to one value).
      2. bg_box (optional, HIGHEST precedence): a user background rectangle (y0,y1,x0,x1);
         if given, the ACF is taken directly from that region on every slice and side/tiling
         are skipped entirely (manual escape hatch).
      2b. bg_side: REQUIRED user input, one of 'light'|'dark'|'off' (session 2026-07-24). No
         default -- the former 'auto' majority-vote default is retired (it was fooled on dense
         stacks: cosem-jurkat voted 'dark', the wrong side, which the old bg_erode=2 then hid
         by starving patches). Supply per-modality via bg_side_for(). 'auto' still works if
         passed explicitly, but is diagnostic-only.
      3. bg_erode: erode the per-slice background mask by this many iterations before tiling,
         so tiles sit in background CORES away from structure edges (session 2026-07-01 Issue-1
         fix). The bg-selector's founding assumption is that incidental signal averages out
         across tiles; that BREAKS when the signal is globally co-oriented (cosem-jurkat's
         parallel diagonal membranes reinforce instead of cancelling), and low-purity small
         tiles admit membrane whose sharp edges survive the detrend high-pass. Eroding the mask
         forces tiles off the membrane edges, cutting the leaked diagonal ACF ~3x (outer-lag
         Dmax 0.094 -> ~0.03, the clean-cosem level) with no harm to the isotropic-structure
         datasets (hela/macrophage bg-ACF unchanged). bg_erode=0 restores the pre-fix behavior.
      4. per slice: struct = slice_structure(sl, sigma); bgm = background_mask(struct, sl,
         struct_keep, side); erode bgm by bg_erode; tiles, P, _ = auto_select(bgm, ...);
         accumulate averaged_acf_from_tiles across ALL (slice x tile) patches, then average.
      5. crop to acf_crop via crop_center if averaged_acf_from_tiles does not already
         (it already crops to ACF_CROP — keep the 21x21 result).
    Returns (acf_raw, info) where acf_raw is the 21x21 signed center-normalized ACF and info is a
    dict with at least: n_patches, sigma_used, bg_side_used, mean_bg_frac, median_psize.
    """
    sig = estimate_noise_scale(stack) if sigma == 'auto' else float(sigma)

    # Tier C (highest precedence): a user-drawn background box. When given, the ACF
    # comes straight from that region on every slice -- no flatness/side heuristic at
    # all. This is the manual escape hatch, the direct auto-analogue of the StructN2V
    # baseline's hand-picked background patch. bg_box = (y0, y1, x0, x1).
    if bg_box is not None:
        acf_raw, n_box = averaged_acf_from_region(stack, bg_box, detrend, sigma=sig)
        info = dict(n_patches=n_box, sigma_used=sig, bg_side_used='box',
                    mean_bg_frac=float('nan'), median_psize=None, bg_box=tuple(bg_box))
        return (acf_raw if n_box else None), info

    # Tier B: the intensity side is a REQUIRED user input (session 2026-07-24). The
    # former 'auto' majority-vote default is RETIRED -- it was fooled on dense stacks
    # (cosem-jurkat: voted 'dark', the WRONG side, then bg_erode=2 hid the resulting
    # membrane leak by starving ~80% of patches; the correct side 'light' needs no
    # erosion). 'auto' is still honoured if passed EXPLICITLY, for diagnostics only.
    # Supply bg_side per-modality via bg_side_for().
    if bg_side == 'auto':
        votes = [detect_bg_side(slice_structure(sl, sig), sl) for sl in stack]
        side = max(set(votes), key=votes.count) if votes else 'off'
    elif bg_side in ('light', 'dark', 'off'):
        side = bg_side
    else:
        raise ValueError(
            f"bg_side must be 'light'|'dark'|'off' (or explicit 'auto' for diagnostics); "
            f"got {bg_side!r}. It is a required user input -- supply it per-modality via "
            "bg_side_for(), or pass a bg_box to bypass side selection entirely.")

    acc, n_auto = None, 0
    Ps, bgfracs = [], []
    for sl in stack:
        st = slice_structure(sl, sig)
        bgm = background_mask(st, sl, struct_keep, side)
        if bg_erode > 0:
            bgm = binary_erosion(bgm, iterations=int(bg_erode))
        bgfracs.append(float(bgm.mean()))
        tiles, P, _ = auto_select(bgm, sizes=tile_sizes, purities=purities,
                                  min_tiles=min_tiles)
        Ps.append(P)
        if not tiles:
            continue
        a, n = averaged_acf_from_tiles(sl[None], tiles, P, detrend, sigma=sig)
        if a is None or n == 0:
            continue
        contrib = a * n
        acc = contrib if acc is None else acc + contrib
        n_auto += n

    side_report = side
    info = dict(
        n_patches=n_auto,
        sigma_used=sig,
        bg_side_used=side_report,
        mean_bg_frac=float(np.mean(bgfracs)) if bgfracs else float('nan'),
        median_psize=int(np.median(Ps)) if Ps else None,
    )
    if n_auto == 0:
        return None, info
    acf_raw = acc / n_auto
    return acf_raw, info
