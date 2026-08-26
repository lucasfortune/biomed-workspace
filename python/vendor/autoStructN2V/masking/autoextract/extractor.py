"""AutoStructN2V Stage-2 orchestrator (autoextract): noisy stack -> StructN2V kernel.

``AutoMaskExtractor`` wires the four packaged phases into a single public entry
point that turns a stack of noisy slices into the small 2D StructN2V mask kernel:

  Phase 1 (input)  : ``bg_select.background_acf`` — automatic background-patch
                     selection + averaged detrended noise ACF.
  Phase 1 (enhance): ``enhance.enhance`` — symmetrize / radial-normalize / ridge,
                     lifting the faint structural arms above a flat ~0 noise floor.
  Phase 2/3        : mask extraction, by ``mask_style``:
                     'spine' (default, 2026-08-25) — ``spine.extract_spine_mask``,
                     the sign-agnostic line-summary mask (one 1-px spine per
                     significant feature, ray-connected, |z|-budget-pruned);
                     'region' (legacy; ablation arm) — ``extract.extract_mask``
                     (positive-only calibrated threshold + center component) then
                     ``postprocess.thin_mask`` + ``postprocess.value_prune``.

The output is a SMALL 2D bool kernel (center masked, 180-deg symmetric, single
center-connected component, tightened to its bounding rect), matching the legacy
``struct_mask, _ = extractor.extract_mask(...)`` call site.
"""
import numpy as np

from . import bg_select, enhance, extract, postprocess, spine


# ---------------------------------------------------------------------------
# Abstain router decision (session 10 / Session D; periodic gate removed 2026-06-26)
# ---------------------------------------------------------------------------
# The full AutoStructN2V workflow is Stage 1 (single-pixel N2V denoising) ->
# mask extractor (Stage 2) -> StructN2V. By the time the extractor runs, N2V has
# ALREADY been applied. So when the extractor cannot build a USEFUL structural mask,
# the right action is NOT to fabricate a center-only mask (that would just re-run
# N2V) but to STOP and tell the user that the Stage-1 output is final. Two ways that
# happens: the RAW ACF is non-directional (Dmax gate, pre-enhancement), or the
# extracted mask collapses to the center pixel only (degenerate gate, post-extract).
ABSTAIN_MESSAGES = {
    "nondirectional": (
        "AutoStructN2V abstained (non-directional noise): the background ACF shows "
        "no directional correlation (Dmax {dmax:.4f} < {dmax_thr}). Stage 1 (N2V) is "
        "sufficient for this data — there is no structured noise for Stage 2 to remove. "
        "The Stage-1 (N2V) output is your final result; Stage 2 was skipped."
    ),
    "isotropic": (
        "AutoStructN2V abstained (isotropic noise): the background ACF has directional "
        "magnitude (Dmax {dmax:.4f}) but its phase is not coherent across radius "
        "(coherence {coherence:.3f} < {coherence_thr}) — the correlation is a smooth, "
        "near-isotropic blob rather than a real arm/ridge, so there is no structural "
        "lag pattern for a StructN2V mask to capture. Stage 1 (N2V) is sufficient; the "
        "Stage-1 (N2V) output is your final result; Stage 2 was skipped."
    ),
    "weak_leak": (
        "AutoStructN2V abstained (weak leak): the discovered mask plugs only "
        "sum(rho^2) = {mask_rho2:.3f} of the center's noise variance, below the "
        "configured minimum -- co-masking would cost more signal context than the "
        "removable leak is worth (E1 finding, C.eleg). The N2V branch is trained "
        "instead."
    ),
    "degenerate": (
        "AutoStructN2V abstained (degenerate mask): the discovered correlation mask "
        "collapsed to the center pixel only — there are no structural lags beyond the "
        "center to co-mask (Dmax {dmax:.4f}, outer-annulus scale {outer_scale:.4f}). A "
        "center-only StructN2V mask is identical to N2V, so Stage 2 was skipped; the "
        "Stage-1 (N2V) output is your final result."
    ),
}


class AbstainDecision:
    """Sentinel returned in place of a Stage-2 kernel when ``AutoMaskExtractor``
    declines to build a structural mask.

    Three reasons (session 2026-06-26 — periodic gate removed; 2026-07-02 — isotropic
    gate added):
      * ``'nondirectional'`` — Dmax (on the RAW ACF, before enhancement) below the
        directionality gate; the noise has no structural correlation, so N2V (Stage 1)
        already suffices.
      * ``'isotropic'`` — Dmax passes but the directional harmonic's phase is not
        coherent across radius (coherence below the gate); the correlation is a
        near-isotropic blob (e.g. kernel_conv), not a real arm, so N2V suffices.
      * ``'degenerate'`` — the extracted+postprocessed mask reduced to the center
        pixel only (== N2V); there is nothing for Stage 2 to remove. This subsumes the
        old periodic gate: strongly-periodic ACFs self-collapse to a center-only mask.

    Signals ``runner.run_pipeline`` to SKIP Stage-2 training and keep the
    Stage-1 (N2V) output as the final result (see session 10 / Session D, 2026-06-26).
    """

    GATE_KEYS = ("dmax", "fold", "outer_scale", "coherence", "dmax_thr", "coherence_thr")

    def __init__(self, reason, metrics):
        self.reason = reason            # 'nondirectional' | 'degenerate'
        self.metrics = dict(metrics)    # dmax, fold, outer_scale, dmax_thr

    @classmethod
    def from_info(cls, info):
        """Build from an ``AutoMaskExtractor.extract_mask`` abstain ``info`` dict
        (keeps only the scalar gate fields, not the large ACF arrays). Extra
        scalar fields used by specific abstain messages (e.g. ``mask_rho2`` for
        the weak-leak gate) are carried through when present."""
        metrics = {k: info[k] for k in cls.GATE_KEYS if k in info}
        for extra in ("mask_rho2", "n_mask"):
            if extra in info:
                metrics[extra] = info[extra]
        return cls(info["reason"], metrics)

    @property
    def message(self):
        return ABSTAIN_MESSAGES[self.reason].format(**self.metrics)

    def __repr__(self):
        return f"AbstainDecision(reason={self.reason!r}, metrics={self.metrics!r})"


class RouteDecision:
    """The routed-pipeline decision object (restructure 2026-07-31, built 2026-08-25).

    Replaces the ``AbstainDecision`` HALT sentinel: under the one-routed-decision
    architecture nothing halts — the extractor's verdict selects which single
    model gets trained. Every abstain reason survives as a *routing reason*.

    Attributes:
        branch (str): ``'structn2v'`` (train StructN2V with ``mask``) or
            ``'n2v'`` (train plain N2V; ``mask`` is the 1x1 center kernel —
            mechanically the same code path, a discovered mask of one pixel).
        mask (np.ndarray): small 2D bool kernel. Never None: the N2V branch
            carries the 1x1 center kernel explicitly.
        reason (str): ``'extracted'`` | ``'nondirectional'`` | ``'isotropic'``
            | ``'degenerate'`` | ``'manual'`` (mask from file) |
            ``'center_only'`` (explicit N2V baseline).
        metrics (dict): router metrics (dmax, fold, coherence, outer_scale,
            thresholds) when the extractor ran; {} for manual/center sources.
    """

    N2V_REASONS = ("nondirectional", "isotropic", "degenerate", "weak_leak",
                   "center_only")

    def __init__(self, branch, mask, reason, metrics=None):
        if branch not in ("structn2v", "n2v"):
            raise ValueError(f"branch must be 'structn2v' or 'n2v', got {branch!r}")
        self.branch = branch
        self.mask = np.asarray(mask, dtype=bool)
        self.reason = reason
        self.metrics = dict(metrics or {})

    @classmethod
    def center_kernel(cls, size=1):
        return np.ones((int(size), int(size)), dtype=bool)

    @classmethod
    def from_extraction(cls, mask, info):
        """Build from an ``AutoMaskExtractor.extract_mask`` result: an extracted
        mask routes to StructN2V; every abstain reason routes to N2V (1x1)."""
        gate = {k: info.get(k) for k in AbstainDecision.GATE_KEYS if k in info}
        if mask is None:
            return cls("n2v", cls.center_kernel(1), info["reason"], gate)
        return cls("structn2v", mask, info.get("reason", "extracted"), gate)

    @property
    def message(self):
        if self.branch == "structn2v":
            src = {"manual": "manual mask file"}.get(self.reason, "discovered mask")
            return (f"Routed to StructN2V ({src}, {int(self.mask.sum())} px, "
                    f"{self.mask.shape[0]}x{self.mask.shape[1]}).")
        why = {
            "nondirectional": "the background ACF shows no directional correlation",
            "isotropic": "the directional signal is an isotropic blob, not a real arm",
            "degenerate": "the discovered mask collapsed to the center pixel",
            "center_only": "explicit N2V configuration",
        }.get(self.reason, self.reason)
        return f"Routed to N2V ({why})."

    def __repr__(self):
        return (f"RouteDecision(branch={self.branch!r}, reason={self.reason!r}, "
                f"mask={self.mask.shape}/{int(self.mask.sum())}px)")


def _tighten_to_bounding_rect(mask):
    """Crop ``mask`` to the smallest rectangle containing all True pixels.

    The crop is symmetric about the original center pixel (i.e. extends
    to ``±max(|y - cy|)`` along y and ``±max(|x - cx|)`` along x), which
    preserves 180-deg autocorrelation symmetry.

    Raises:
        ValueError: if the mask has no True pixels (extractor failure).
    """
    if not mask.any():
        raise ValueError(
            "StructuralNoiseExtractor produced an empty mask "
            "(no True pixels). Check input data and extractor parameters."
        )
    h, w = mask.shape
    cy, cx = h // 2, w // 2
    ys, xs = np.where(mask)
    dy = int(np.abs(ys - cy).max())
    dx = int(np.abs(xs - cx).max())
    return mask[cy - dy:cy + dy + 1, cx - dx:cx + dx + 1]


class AutoMaskExtractor:
    """Stage-2 orchestrator: noisy slice stack -> small 2D StructN2V mask kernel."""

    def __init__(self, *,
                 # Phase-1 background selection.
                 # bg_side is a REQUIRED user input ('light'|'dark'|'off'); bg_box (y0,y1,x0,x1)
                 # is an optional manual background rectangle that overrides side selection.
                 bg_side, sigma='auto', struct_keep='otsu', acf_crop=10,
                 tile_sizes=(64, 48, 32, 24), purities=(0.95, 0.85, 0.75, 0.6),
                 min_tiles=4, detrend=True, bg_erode=1, bg_box=None,
                 # Mask style: 'spine' (line-summary, sign-agnostic; the method
                 # default since 2026-08-25 -- see spine.py) or 'region' (the
                 # legacy positive-only region mask, kept as an ablation arm).
                 # rho_floor SHIPPED at 0.05 (E1 mask sweep 2026-08-25); None = strict
                 mask_style='spine', spine_thresh=8.0, rho_floor=0.05,
                 # Leak-magnitude gate (E5 follow-up, 2026-08-25): abstain to N2V
                 # when the discovered mask's pluggable leak sum(rho^2) over its
                 # off-center lags falls below this. Separates benefit from harm
                 # on the E1 benchmark (gap 0.53 vs 1.29; candidate cut ~0.8) but
                 # is calibrated IN-SAMPLE on six volumes -> OFF by default,
                 # documented as a refinement hypothesis. None disables.
                 min_mask_rho2=None,
                 # Phase-1 enhancement ('region' style only)
                 enhance_kw=None,   # None -> {'radial':'zscore','scale_mode':'outer','ridge':'sato'}
                 # Phase-2 extraction ('region' style only)
                 thresh=8.0, robust=True, close_gaps=True, bridge=True,
                 # Phase-2 router (RAW-ACF abstain gates; session 10 + 2026-07-02)
                 dmax_threshold=extract.DMAX_THRESHOLD,
                 coherence_threshold=extract.COHERENCE_THRESHOLD,
                 # Phase-3 postprocess ('region' style; 'spine' uses only max_pixels)
                 thin_n=3, value_k=3.0, value_ref='zmap', protect_extent=True, max_pixels=None,
                 tighten_output_mask=True):
        if mask_style not in ('spine', 'region'):
            raise ValueError(f"mask_style must be 'spine' or 'region', got {mask_style!r}")
        self.mask_style = mask_style
        self.spine_thresh = spine_thresh
        self.rho_floor = rho_floor
        self.min_mask_rho2 = min_mask_rho2
        # Phase-1 background selection
        self.bg_side = bg_side
        self.sigma = sigma
        self.struct_keep = struct_keep
        self.acf_crop = acf_crop
        self.tile_sizes = tile_sizes
        self.purities = purities
        self.min_tiles = min_tiles
        self.detrend = detrend
        self.bg_erode = bg_erode
        self.bg_box = bg_box
        # Phase-1 enhancement
        self.enhance_kw = enhance_kw
        # Phase-2 extraction
        self.thresh = thresh
        self.robust = robust
        self.close_gaps = close_gaps
        self.bridge = bridge
        # Phase-2 router (RAW-ACF abstain gates)
        self.dmax_threshold = dmax_threshold
        self.coherence_threshold = coherence_threshold
        # Phase-3 postprocess
        self.thin_n = thin_n
        self.value_k = value_k
        self.value_ref = value_ref
        self.protect_extent = protect_extent
        self.max_pixels = max_pixels
        self.tighten_output_mask = tighten_output_mask

    def extract_mask(self, stack, verbose=False):
        """stack: ndarray (N,H,W) of noisy slices, or (N,1,H,W) which is squeezed to (N,H,W).

        Returns (mask, info): mask is a SMALL 2D bool kernel — center masked, 180-deg
        symmetric, single center-connected component, tightened to bounding rect (if
        ``tighten_output_mask``).
        """
        # 1. squeeze (N,1,H,W) -> (N,H,W)
        stack = np.asarray(stack)
        if stack.ndim == 4 and stack.shape[1] == 1:
            stack = stack[:, 0, :, :]

        # 2. Phase-1 background selection -> averaged detrended noise ACF
        acf_raw, bg_info = bg_select.background_acf(
            stack, bg_side=self.bg_side, sigma=self.sigma, struct_keep=self.struct_keep,
            acf_crop=self.acf_crop, tile_sizes=self.tile_sizes, purities=self.purities,
            min_tiles=self.min_tiles, detrend=self.detrend, bg_erode=self.bg_erode,
            bg_box=self.bg_box)
        if acf_raw is None:
            raise ValueError("background_acf found no usable background patches")

        # 2b. Phase-2 ROUTER (session 10 / Session D; periodic gate removed 2026-06-26):
        # decide on the RAW ACF, before enhancement, whether the noise is directional.
        # Enhancement amplifies the noise floor and could manufacture false "structure",
        # so the verdict must be made on the un-enhanced ACF (mirrors extract.run's
        # order). Non-directional -> ABSTAIN: no mask (mask=None), the caller skips
        # Stage 2 and keeps the Stage-1 (N2V) output. There is NO periodic gate: it
        # rejected valid structured-noisy data; periodic ACFs are instead handled by the
        # DEGENERATE (center-only mask) gate after extraction (step 5b).
        dm = extract.directional_metrics(acf_raw)
        outer = extract.outer_annulus_scale(acf_raw)         # diagnostic only (no gate)
        gate = dict(dmax=dm["Dmax"], fold=dm["fold"], outer_scale=outer,
                    coherence=dm["coherence"], dmax_thr=self.dmax_threshold,
                    coherence_thr=self.coherence_threshold)

        if dm["Dmax"] < self.dmax_threshold:
            if verbose:
                print(f"[AutoMaskExtractor] ABSTAIN (nondirectional): Dmax "
                      f"{dm['Dmax']:.4f} < {self.dmax_threshold} -> no mask")
            return None, dict(reason="nondirectional", structure_detected=False,
                              bg=bg_info, acf_raw=acf_raw, enhanced=None, **gate)

        # arm-vs-blob gate (session 2026-07-02): directional magnitude present but its
        # phase scatters across radius -> isotropic blob (kernel_conv), not a real arm.
        if dm["coherence"] < self.coherence_threshold:
            if verbose:
                print(f"[AutoMaskExtractor] ABSTAIN (isotropic): coherence "
                      f"{dm['coherence']:.3f} < {self.coherence_threshold} "
                      f"(Dmax {dm['Dmax']:.4f}) -> no mask")
            return None, dict(reason="isotropic", structure_detected=False,
                              bg=bg_info, acf_raw=acf_raw, enhanced=None, **gate)

        # 3-5. Mask extraction, by style.
        if self.mask_style == 'spine':
            # SPINE (default since 2026-08-25): sign-agnostic line-summary mask
            # straight from the signed radial z-map -- one 1-px spine per
            # significant feature (positive OR negative), ray-connected to the
            # center, |z|-budget-pruned. Replaces ridge-enhance + region-extract
            # + thin/value_prune entirely; see spine.py for the design rules.
            mask, ex_info, enhanced = spine.extract_spine_mask(
                acf_raw, thresh=self.spine_thresh, rho_floor=self.rho_floor,
                max_pixels=self.max_pixels, return_zmap=True)
        else:
            # REGION (legacy; ablation arm): positive-only significant region,
            # ridge-enhanced, thinned and value-pruned.
            # 3. Phase-1 enhancement
            ekw = self.enhance_kw or {'radial': 'zscore', 'scale_mode': 'outer', 'ridge': 'sato'}
            enhanced = enhance.enhance(acf_raw, **ekw)

            # 4. Phase-2 extraction (bridge disconnected significant arms along the arm
            # axes recovered by the gate's directional_metrics -- Issue-2 fix, 2026-07-01)
            mask, ex_info = extract.extract_mask(
                enhanced, thresh=self.thresh, robust=self.robust, close_gaps=self.close_gaps,
                bridge_axes=dm["axes"] if self.bridge else None)

            # 5. Phase-3 postprocess
            mask = postprocess.thin_mask(mask, n_iters=self.thin_n)
            mask = postprocess.value_prune(
                mask, acf_raw, value_k=self.value_k, value_ref=self.value_ref,
                protect_extent=self.protect_extent, max_pixels=self.max_pixels)

        # 5a. Leak magnitude: sum(rho^2) over the mask's off-center lags -- the
        # fraction of center-noise variance the mask actually plugs. Always
        # reported; gates only when min_mask_rho2 is set (E5, off by default).
        cy_, cx_ = acf_raw.shape[0] // 2, acf_raw.shape[1] // 2
        mask_rho2 = 0.0
        for y_, x_ in zip(*np.where(mask)):
            if (y_, x_) != (cy_, cx_):
                mask_rho2 += float(acf_raw[y_, x_]) ** 2
        if self.min_mask_rho2 is not None and mask_rho2 < self.min_mask_rho2:
            if verbose:
                print(f"[AutoMaskExtractor] ABSTAIN (weak_leak): mask leak "
                      f"sum(rho^2) {mask_rho2:.3f} < {self.min_mask_rho2} -> no mask")
            return None, dict(reason="weak_leak", structure_detected=False,
                              bg=bg_info, acf_raw=acf_raw, enhanced=enhanced,
                              mask_rho2=mask_rho2, n_mask=int(mask.sum()), **gate)

        # 5b. DEGENERATE gate (session 2026-06-26): if the final mask is center-only
        # (<= 1 px) there are no structural lags to co-mask -- it is identical to N2V,
        # so ABSTAIN rather than run a no-op Stage 2. This is where strongly-periodic
        # noise lands: it self-collapses to a 1-px mask (13/18 sinusoidal variants);
        # the rest keep a real center-connected mask and proceed.
        if int(mask.sum()) <= 1:
            if verbose:
                print(f"[AutoMaskExtractor] ABSTAIN (degenerate): mask collapsed to "
                      f"the center pixel only ({int(mask.sum())} px) -> no mask")
            return None, dict(reason="degenerate", structure_detected=False,
                              bg=bg_info, acf_raw=acf_raw, enhanced=enhanced,
                              n_mask=int(mask.sum()), **gate)

        # 6. tighten to bounding rect
        if self.tighten_output_mask:
            mask = _tighten_to_bounding_rect(mask)

        # 7. assemble info
        info = dict(reason="extracted", structure_detected=True,
                    bg=bg_info, **ex_info, acf_raw=acf_raw, enhanced=enhanced,
                    mask_rho2=mask_rho2, **gate)
        if verbose:
            print(f"[AutoMaskExtractor] n_patches={bg_info.get('n_patches')} "
                  f"sigma={bg_info.get('sigma_used')} bg_side={bg_info.get('bg_side_used')} "
                  f"-> mask {mask.shape} ({int(mask.sum())} px)")

        # 8.
        return mask, info

    def route(self, stack, verbose=False):
        """Routed-pipeline entry point: stack -> ``RouteDecision`` (never a halt).

        Wraps :meth:`extract_mask`: an extracted mask routes to the StructN2V
        branch; every abstain reason becomes a route to the N2V branch with the
        1x1 center kernel. Returns (decision, info)."""
        mask, info = self.extract_mask(stack, verbose=verbose)
        return RouteDecision.from_extraction(mask, info), info
