"""Packaged Phase-2 extraction (autoextract): enhanced z-map -> binary mask + abstain.

Packaged port of the validated Phase-2 prototype (maskext_phase2.py). Turns the
Phase-1 enhanced z-map (``enhance``) into the binary StructN2V mask: the set of lag
offsets where the noise is correlated and must be co-masked. Two stages, in this order
(user decision 2026-06-24):

  (0) ABSTAIN GATE — computed on the RAW Stage-1 detrended ACF, *before* any Phase-1
      enhancement. The z-score/ridge enhancement amplifies the noise floor and could
      manufacture false-positive "structure" on genuinely non-directional noise, so the
      directionality decision must be made on the un-enhanced ACF. Uses the angular-
      harmonic ``Dmax`` metric. If Dmax < threshold -> NON-DIRECTIONAL ->
      ``structure_detected=False``, no mask, caller keeps the Stage-1 (N2V) output.

  (1) EXTRACTION (strategy A, user-chosen) — on the enhanced map. The z-map is
      calibrated in noise-sigmas (flat noise ~ N(0,1)), so a single threshold is a
      false-positive rate that transfers across datasets:
        threshold (z >= z_thresh)  ->  force the center  ->  optional 1-px gap close
        (preserve center-connectivity)  ->  keep the center-connected component.
      The enhanced map is already 180-deg symmetric (Phase-1 ``symmetrize``); we re-
      assert symmetry defensively. Returns ``(mask, structure_detected, info)``.

Center-connectivity was the OLD failure mode (2026-06-10: the central peak dominated
the inner ring, arms at r>=2 disconnected, the component collapsed). It is now
mitigated upstream — the radial z-score removes the central pedestal and studentizes
the inner rings — and defended here by the optional 1-px morphological close.

Runs under ``/usr/bin/python3`` (numpy 1.26 / scipy 1.11 / skimage 0.22); the anaconda
python has a numpy2/matplotlib ABI break (see session logs).
"""
import numpy as np
from scipy.ndimage import map_coordinates, label, binary_closing, generate_binary_structure

from . import enhance as p1


# ---------------------------------------------------------------------------
# (0) Abstain gate — angular-harmonic directionality (Dmax)
# Ported VERBATIM from autostructn2v_acf_analysis.ipynb cell 8 (the user's metric).
# Operates on the RAW center-normalized ACF crop (NOT the enhanced z-map).
# ---------------------------------------------------------------------------
_DIR_ANGLES = np.linspace(0, np.pi, 180, endpoint=False)   # ACF is centro-symmetric


def _harm_ab(profile, m):
    """Real/imag angular-harmonic components per radius (a=cos, b=sin)."""
    n = profile.shape[1]
    a = 2.0 / n * (profile * np.cos(2 * m * _DIR_ANGLES)).sum(1)
    b = 2.0 / n * (profile * np.sin(2 * m * _DIR_ANGLES)).sum(1)
    return a, b


def _harm_amp(profile, m):
    a, b = _harm_ab(profile, m)
    return np.hypot(a, b)                                  # amplitude per radius


def _radial_coherence(a, b, rr):
    """Radial phase-coherence of a complex angular harmonic over the arm rings ``rr``.

    ``(a[r], b[r])`` is the complex angular-harmonic vector at radius r. A real arm is
    a RIDGE, so its harmonic points the SAME way at every radius -> the vectors add
    constructively and |sum| approaches the sum of magnitudes -> coherence ~ 1. An
    isotropic blob (e.g. Gaussian-convolved noise / kernel_conv) has no true arm; its
    tiny measured direction is finite-sample wobble whose PHASE scatters across radii
    -> destructive addition -> coherence low. In [0, 1], scale-free (independent of
    directional magnitude, which is what ``Dmax`` already measures). Session 2026-07-02.
    """
    va, vb = float(a[rr].sum()), float(b[rr].sum())
    mag = float(np.hypot(a[rr], b[rr]).sum())
    return np.hypot(va, vb) / max(mag, 1e-12)


def directional_metrics(acf_crop):
    """Angular-harmonic directionality of a center-normalized 2D ACF crop.

    Dmax/f2/f4 read over the arm region r=2..9 px. ``fold`` = dominant symmetry
    ('2f' streak / '4f' cross). An isotropic structure -- including a plain decaying
    peak -- has ~0 energy in these harmonics, so Dmax isolates DIRECTIONAL
    correlation independent of how strongly the ACF decays.

    ``axes`` = the arm-axis angle(s) in radians (map_coordinates convention:
    row=c+r*sin, col=c+r*cos), recovered from the harmonic PHASE aggregated over the
    arm region. '2f' -> one axis; '4f' -> two perpendicular axes. Used by
    ``extract_mask`` to bridge disconnected significant arm segments back to the center
    along the detected orientation (session 2026-07-01, Issue-2 fix).

    ``coherence`` = radial phase-coherence of the directional harmonic over r=2..8 (the
    outermost edge ring r=9 is dropped -- it sits 1 px from a 10-px crop edge and is the
    noisiest). ``max`` over the 2f/4f harmonics so a mis-assigned ``fold`` cannot lose a
    real arm. Separates a coherent ridge (real stripe/cross/et arm -> ~1) from an
    isotropic blob whose measured direction is finite-sample noise (kernel_conv -> low),
    which ``Dmax`` alone conflates. Used by the arm-vs-blob abstain gate (session
    2026-07-02); see ``COHERENCE_THRESHOLD`` and ``run``/``AutoMaskExtractor``.
    """
    c = acf_crop.shape[0] // 2
    rmax = min(12, c - 1)
    radii = np.arange(0, rmax + 1)
    prof = np.empty((len(radii), len(_DIR_ANGLES)))
    for i, r in enumerate(radii):
        prof[i] = map_coordinates(
            acf_crop, [c + r * np.sin(_DIR_ANGLES), c + r * np.cos(_DIR_ANGLES)],
            order=1, mode="nearest")
    a2, b2 = _harm_ab(prof, 1)
    a4, b4 = _harm_ab(prof, 2)
    f2, f4 = np.hypot(a2, b2), np.hypot(a4, b4)
    rr = slice(2, min(10, rmax + 1))
    Dcoh = np.hypot(f2[rr], f4[rr])
    f2m, f4m = float(f2[rr].max()), float(f4[rr].max())
    fold = "4f" if f4m >= f2m else "2f"
    # Arm orientation from the phase of the aggregated complex harmonic over the arm region.
    if fold == "4f":
        th = float(np.angle(complex(a4[rr].sum(), b4[rr].sum())) / 4.0)
        axes = [th, th + np.pi / 2]
    else:
        th = float(np.angle(complex(a2[rr].sum(), b2[rr].sum())) / 2.0)
        axes = [th]
    # Radial phase-coherence over r=2..8 (drop the noisy edge ring r=9); max over folds.
    rr_c = slice(2, min(9, rmax + 1))
    coherence = float(max(_radial_coherence(a2, b2, rr_c),
                          _radial_coherence(a4, b4, rr_c)))
    return dict(Dmax=float(Dcoh.max()), f2=f2m, f4=f4m, fold=fold, axes=axes,
                coherence=coherence)


# Empirically recalibrated on the BACKGROUND-SELECTED cached ACFs (session 06-24_03).
# NOTE: the original 06-12 thresholds (iso floor ~0.011, real ET ~0.058) were
# measured on the FULL patch-averaged ACF; the bg-selected cache reads lower
# (real ET 0.041). Calibration sweep over all 90 synthetic + real ET:
#   MUST PASS  (directional balanced + mostly_structural):  min Dmax = 0.0128
#   MUST ABSTAIN (all kernel_conv, all combos):             max Dmax = 0.0105
#   => clean gap 0.0105 .. 0.0128; real ET = 0.0411 (passes).
# Caveat: stripe/cross_hatch/et_derived *mostly_pixel* (Dmax 0.0031-0.0095) fall
# BELOW the gate and abstain -> their structural arm is statistically
# indistinguishable from the non-directional floor (they overlap kernel_conv), so
# they cannot be passed without also passing kernel_conv. Abstain => N2V fallback
# (== N2V, satisfies the >= N2V constraint). All sinusoidal (incl. mostly_pixel,
# Dmax >= 0.0486) pass.
DMAX_THRESHOLD = 0.012   # in the 0.0105..0.0128 gap

# Arm-vs-blob abstain gate (session 2026-07-02). Dmax measures directional MAGNITUDE
# but conflates a real arm with the finite-sample directional wobble on an ISOTROPIC
# blob (kernel_conv = Gaussian-convolved white noise), which the R2 Stage-1 recipe
# amplifies -- so Dmax alone cannot make kernel_conv abstain (72-variant sweep,
# session 2026-07-01). Radial phase-COHERENCE (``directional_metrics['coherence']``)
# separates them ON SYNTHETIC DATA: a clean ridge has one phase across radius
# (coherence ~1), a blob's phase scatters (low). Calibrated on the R2 stage1_compare
# caches over the REQUIRED sets (stripe/cross_hatch/et_derived balanced +
# mostly_structural must PASS; kernel_conv must ABSTAIN; jurkat = membrane tail):
#   MUST PASS   min coherence = 0.993   (cosem_macrophage2_48_et_derived_mostly_structural)
#   MUST ABSTAIN max coherence = 0.973   (FMD_mice_kernel_conv_mostly_structural)
#   => synthetic gap 0.973 .. 0.993; threshold 0.98 loses 0/30 arms, leaks 0/10 kernel_conv.
#
# ***DOES NOT GENERALIZE TO REAL ET (session 2026-07-02 real-data check).*** The real
# ET bg-ACF is a genuine but LOW-SNR cross (fold=4f, clear arms + dark diagonal lobes),
# yet its per-radius arm phases wobble -> coherence ~0.72-0.80, BELOW the kernel_conv
# blob range (0.69-0.97). No threshold separates real ET from kernel_conv, and 0.98
# would make real ET WRONGLY ABSTAIN -- contradicting the Dmax gate's deliberate
# "real ET (Dmax 0.041) passes" calibration and the project's ET use case. => the gate
# is DISABLED BY DEFAULT (threshold 0.0). The metric is still computed and reported for
# diagnostics/future work; set coherence_threshold=0.98 to enable it for synthetic-only
# routing. Open: find an arm-vs-blob discriminator that also passes real ET (e.g. the
# negative diagonal ACF side-lobes between real arms, which the isotropic blob lacks).
COHERENCE_THRESHOLD = 0.0        # gate OFF by default; calibrated (synthetic) value = 0.98
COHERENCE_THRESHOLD_SYNTH = 0.98  # the synthetic-calibrated value, for opt-in / reference


def is_directional(acf_raw, threshold=DMAX_THRESHOLD):
    """Abstain gate: True if the RAW ACF carries directional structure (Dmax >= thr)."""
    return directional_metrics(acf_raw)["Dmax"] >= threshold


# ---------------------------------------------------------------------------
# Outer-annulus noise scale (diagnostic only)
# ---------------------------------------------------------------------------
# The explicit PERIODIC gate was REMOVED (session 2026-06-26). It rejected any
# non-decaying ACF (outer-annulus scale >= 0.03) as "periodic -> out of scope",
# but that also denied legitimately structured-noisy datasets: the gate fired on
# every sinusoidal variant, including the COSEM crops whose periodic noise yields a
# real, center-connected diagonal mask (jurkat fails on ALL three combos). The
# trade-off chosen by the user: rather than deny valid structured noise, let all
# noise types through the directionality gate and handle the genuinely useless
# cases at the OTHER end — the DEGENERATE (center-only) mask gate in ``run`` /
# ``AutoMaskExtractor`` (a center-only mask == N2V, so abstaining loses nothing).
# Validation: 13/18 sinusoidal variants self-collapse to a 1-px (== N2V) mask and
# are caught by the degenerate gate; the other 5 extract a real diagonal mask and
# proceed to Stage 2 (see session_log 2026-06-26_01, phase2/phase3 notebooks).
#
# ``outer_annulus_scale`` is kept as a reported DIAGNOSTIC (``outer_scale`` in the
# result/gate dicts), but it no longer gates anything.


def outer_annulus_scale(acf, outer_frac=0.55):
    """Robust scale (1.4826*MAD) of the center-normalized ACF over r >= outer_frac*rmax.

    Diagnostic only (the periodic gate that used this was removed 2026-06-26):
    high values flag non-decaying / periodic correlation, but periodicity is no
    longer a routing decision — see the module note above.
    """
    r = p1.radius_map(acf, integer=False)
    sel = r >= outer_frac * r.max()
    vals = acf[sel]
    med = float(np.median(vals))
    return float(np.median(np.abs(vals - med)) * 1.4826)


# ---------------------------------------------------------------------------
# (1) Extraction — calibrated significance threshold + center-connected component
# ---------------------------------------------------------------------------
def _symmetrize_bool(mask):
    """180-deg-symmetric OR (exact autocorrelation symmetry)."""
    return mask | mask[::-1, ::-1]


def _bridge_arms(binary, axes, tol=1.2):
    """Reconnect disconnected significant arm segments to the center along the detected
    arm axis/axes (session 2026-07-01, Issue-2 fix).

    On broad-peak datasets (large detrend sigma) the inner arm is blob-like, so the Sato
    ridge gives it ~0 response and a gap opens at the center; the strict-threshold OUTER
    arm segments then fail the center-connected-component test and get discarded (mask
    collapses to the center pixel). This walks each arm ``axes`` angle, finds the OUTERMOST
    threshold-passing pixel within ``tol`` perpendicular of the axis ray, and fills the ray
    from the center out to it. Bounded by significant reach, so it connects real structure
    along the validated orientation WITHOUT fabricating arms (an axis with no near-ray
    significant pixel fills nothing). No-op if ``axes`` is falsy.
    """
    if not axes:
        return binary
    H, W = binary.shape
    cy, cx = H // 2, W // 2
    out = binary.copy()
    ys, xs = np.where(binary)
    dy, dx = ys - cy, xs - cx
    for th in axes:
        s, co = np.sin(th), np.cos(th)
        p = dy * s + dx * co                 # signed radius along the axis
        q = np.abs(dy * co - dx * s)         # perpendicular distance to the axis
        near = q <= tol
        if not near.any():
            continue
        rmax = float(np.abs(p[near]).max())
        for r in range(1, int(np.floor(rmax)) + 1):
            for sign in (+1, -1):
                yy = int(round(cy + sign * r * s))
                xx = int(round(cx + sign * r * co))
                if 0 <= yy < H and 0 <= xx < W:
                    out[yy, xx] = True
    return out


def _outer_studentize(enhanced, outer_frac=0.55, eps=1e-9):
    """Re-studentize any enhanced map by its OWN outer-annulus robust noise:
    (a - outer_median) / (1.4826 * outer_MAD). Makes the threshold a dataset-
    agnostic robust-sigma cut regardless of the map's native units.

    For the z-score map this is ~identity (outer ~ N(0,1)). For the Sato ridge
    map (a non-negative [0,1] vesselness response with a near-zero floor) it turns
    the threshold into 'robust-sigma above the ridge floor' -- so the SAME single
    parameter transfers across datasets even though ridge values are not calibrated.
    """
    r = p1.radius_map(enhanced, integer=False)
    sel = r >= outer_frac * r.max()
    vals = enhanced[sel]
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med)) * 1.4826)
    return (enhanced - med) / max(mad, eps)


def extract_mask(enhanced, thresh=8.0, robust=True, close_gaps=True, symmetrize=True,
                 bridge_axes=None):
    """Binary StructN2V mask from an enhanced ACF map.

    enhanced    : Phase-1 output (default pipeline = z-score/outer + Sato ridge).
    thresh      : robust-sigma detection cut (see ``robust``).
    robust      : if True, re-studentize ``enhanced`` by its outer-annulus robust
                  noise first, so ``thresh`` is a robust-sigma cut above the map's
                  own floor (dataset-agnostic on the non-calibrated ridge map; ~8 is
                  the validated default). If False, ``thresh`` is applied to
                  ``enhanced`` directly (e.g. a literal z-sigma on the pure z-map).
    close_gaps  : 1-iteration 3x3 binary closing to bridge single-pixel breaks before
                  the connected-component step (defends center-connectivity).
    symmetrize  : enforce exact 180-deg symmetry of the final mask.
    bridge_axes : arm-axis angle(s) in radians (from ``directional_metrics(...)['axes']``).
                  If given, reconnect disconnected significant arm segments to the center
                  along these axes BEFORE the connected-component step (Issue-2 fix; see
                  ``_bridge_arms``). None disables bridging (pre-2026-07-01 behavior).

    Returns (mask, info). The center is always set True (StructN2V masks the center).
    """
    H, W = enhanced.shape
    cy, cx = H // 2, W // 2

    score = _outer_studentize(enhanced) if robust else np.asarray(enhanced)
    binary = score >= thresh
    n_thresh = int(binary.sum())
    binary[cy, cx] = True                      # StructN2V always masks the center

    if bridge_axes:
        binary = _bridge_arms(binary, bridge_axes)
        binary[cy, cx] = True

    if close_gaps:
        binary = binary_closing(binary, structure=np.ones((3, 3), bool), iterations=1)
        binary[cy, cx] = True

    # keep only the connected component touching the center (8-connectivity)
    structure = generate_binary_structure(2, 2)
    labeled, _ = label(binary, structure=structure)
    mask = labeled == labeled[cy, cx]

    if symmetrize:
        mask = _symmetrize_bool(mask)
        # re-take the center component in case the mirror added a bridge/speck
        labeled, _ = label(mask, structure=structure)
        mask = labeled == labeled[cy, cx]

    info = dict(n_thresh=n_thresh, n_mask=int(mask.sum()),
                extent=_mask_extent(mask))
    return mask, info


def _mask_extent(mask):
    """Max Chebyshev radius of the mask from center (how far the arms reach)."""
    cy, cx = mask.shape[0] // 2, mask.shape[1] // 2
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0
    return int(np.max(np.maximum(np.abs(ys - cy), np.abs(xs - cx))))


# ---------------------------------------------------------------------------
# Full Stage-2 pipeline: raw ACF -> gate -> enhance -> extract -> degenerate gate
# ---------------------------------------------------------------------------
def run(acf_raw, *, dmax_threshold=DMAX_THRESHOLD, coherence_threshold=COHERENCE_THRESHOLD,
        enhance_kw=None, thresh=8.0, robust=True, close_gaps=True):
    """Full Stage-2: abstain gate -> Phase-1 enhance -> extract -> degenerate gate.

    Decisions (session 2026-06-26 — periodic gate removed, degenerate gate added;
    session 2026-07-02 — isotropic/coherence gate added):
      1. Dmax < threshold -> NON-DIRECTIONAL (reason='nondirectional'); abstain,
         keep the Stage-1 (N2V) output. mask=None.
      1b. Dmax passes but coherence < coherence_threshold -> ISOTROPIC blob
         (reason='isotropic'): directional magnitude present but its phase scatters
         across radius, so it is finite-sample wobble on an isotropic correlation
         (kernel_conv), not a real arm -> abstain, keep N2V. mask=None. Set
         coherence_threshold=0 to disable this gate.
      2. otherwise enhance + extract the contiguous-arm mask, then:
      3. if the extracted mask is CENTER-ONLY (<= 1 px) -> DEGENERATE
         (reason='degenerate'); a center-only StructN2V mask is identical to N2V,
         so there is nothing for Stage 2 to do -> abstain, keep N2V. mask=None.
      4. otherwise -> reason='extracted' with the structural mask.

    There is NO periodic gate: periodicity is no longer a routing decision (it
    rejected valid structured-noisy data). Strongly-periodic ACFs self-collapse to a
    center-only mask and are caught by the degenerate gate (3); the few that yield a
    real center-connected mask proceed to Stage 2 like any other structured noise.

    Enhancement default = the 06-12 signed-off config: z-score/outer + Sato ridge.

    Returns dict: structure_detected, reason, mask (None unless extracted), dmax,
    fold, outer_scale, enhanced map, info.
    """
    dm = directional_metrics(acf_raw)
    outer = outer_annulus_scale(acf_raw)              # diagnostic only (no gate)
    base = dict(dmax=dm["Dmax"], fold=dm["fold"], outer_scale=outer,
                coherence=dm["coherence"])

    if dm["Dmax"] < dmax_threshold:
        return dict(structure_detected=False, reason="nondirectional", mask=None,
                    enhanced=None, info=None, **base)

    if dm["coherence"] < coherence_threshold:         # isotropic blob (kernel_conv)
        return dict(structure_detected=False, reason="isotropic", mask=None,
                    enhanced=None, info=None, **base)

    enhance_kw = enhance_kw or dict(radial="zscore", scale_mode="outer", ridge="sato")
    enhanced = p1.enhance(acf_raw, **enhance_kw)
    mask, info = extract_mask(enhanced, thresh=thresh, robust=robust, close_gaps=close_gaps,
                              bridge_axes=dm["axes"])

    if int(mask.sum()) <= 1:                          # center-only mask == N2V
        return dict(structure_detected=False, reason="degenerate", mask=None,
                    enhanced=enhanced, info=info, **base)

    return dict(structure_detected=True, reason="extracted", mask=mask,
                enhanced=enhanced, info=info, **base)
