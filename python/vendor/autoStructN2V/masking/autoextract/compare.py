"""Extractor INPUT-SOURCE comparison: raw noisy vs Stage-1 denoised.

Why this module exists
----------------------
The AutoStructN2V workflow runs Stage 1 (N2V) first, so by the time the mask
extractor fires there are TWO candidate stacks it could read:

  * the **raw noisy** stack — carries the real structured noise, but also the
    pixel noise the mask is not meant to describe;
  * the **Stage-1 denoised** stack — pixel noise stripped, on the assumption that
    this *reveals* the structured noise more cleanly.

Session E (2026-06-24) hard-wired the second option. The 2026-07-24 finding
(``reports/denoising_artifact_report_2026-07-24.md``) showed that assumption is
**modality-dependent and, on confocal data, false**: Stage-1 does not enhance the
real noise cross there, it *replaces* it with a broad single-orientation artifact
(the angular fold flips 4f -> 2f, the signature of a blind-spot network writing its
own correlation structure into the image). On COSEM/FIB-SEM — the
electron-tomography-analogue modality — the same denoising is benign.

Because no blind rule is safe across modalities (and the distortion depends on the
structured-noise SNR, which varies with noise type and composition too, not just
with the microscope), the decision was settled in the 2026-07 supervisor meeting as
a **required user input, made per experiment**: build the ACF *and* the mask from
BOTH inputs, show them, and let the user choose. This mirrors the precedent set for
``bg_side`` — choosing what the extractor looks at is experiment setup, the same
choice a StructN2V user makes by hand when they pick a background patch; it is not
part of the automated mask *discovery* that AutoStructN2V claims.

The three modes (``extractor_input`` in the ``stage2.extractor`` config block):

  ``'raw'``       -- discover the mask from the raw noisy stack.
  ``'denoised'``  -- discover the mask from the Stage-1 denoised stack.
  ``'compare'``   -- run BOTH, write the review artifacts, and HALT so the user can
                     decide. Never trains Stage 2.

There is deliberately **no default**: a missing ``extractor_input`` raises, exactly
as a missing ``bg_side`` does.
"""
import json
import os

import numpy as np

#: Accepted values of the ``extractor_input`` config knob.
INPUT_CHOICES = ('raw', 'denoised', 'compare')

#: Display names for the two candidate inputs (figure row labels).
INPUT_LABELS = {'raw': 'RAW NOISY', 'denoised': 'STAGE-1 DENOISED'}


def validate_input_choice(value, *, where='config'):
    """Raise a descriptive error unless ``value`` is a valid ``extractor_input``.

    Mirrors the required-``bg_side`` error style: the point is that the user is told
    the choice exists and how to make it, never silently given one.
    """
    if value in INPUT_CHOICES:
        return value
    raise ValueError(
        f"extractor_input must be one of {INPUT_CHOICES} (got {value!r} from {where}). "
        "This is a REQUIRED user decision with no default: Stage-1 denoising distorts "
        "the noise ACF the extractor reads, and it does so differently per modality and "
        "per noise regime (see reports/denoising_artifact_report_2026-07-24.md). Run "
        "with extractor_input='compare' to produce the raw-vs-denoised ACF/mask review "
        "for this experiment, inspect it, then re-run with 'raw' or 'denoised'."
    )


class InputDecisionRequired:
    """Sentinel returned in place of a Stage-2 kernel when ``extractor_input='compare'``.

    Signals ``runner.run_pipeline`` to STOP before Stage-2 training and report the
    review artifacts to the user — the same halt-and-tell contract as
    :class:`~autoStructN2V.masking.autoextract.extractor.AbstainDecision`, but for a
    decision the user must make rather than one the extractor made.

    Attributes:
        review_dir (str): directory holding the review figure, masks and metrics.
        results (dict): ``{'raw': {...}, 'denoised': {...}}`` — per-input outcome
            (``reason``, ``n_mask``, gate metrics, artifact paths).
        figure_path (str or None): the side-by-side review figure.
    """

    reason = 'input_undecided'

    def __init__(self, review_dir, results, figure_path=None, label=None):
        self.review_dir = review_dir
        self.results = results
        self.figure_path = figure_path
        self.label = label

    @property
    def message(self):
        head = (
            "AutoStructN2V halted: the mask-extractor INPUT SOURCE is undecided "
            f"(extractor_input='compare'{f' — {self.label}' if self.label else ''}).\n"
            "Both candidate inputs were characterised; Stage 2 was NOT trained.\n"
        )
        rows = []
        for name in ('raw', 'denoised'):
            r = self.results.get(name)
            if r is None:
                continue
            if r['reason'] == 'extracted':
                outcome = f"mask {r['n_mask']} px"
            else:
                outcome = f"ABSTAIN ({r['reason']})"
            rows.append(f"  {INPUT_LABELS[name]:<18} -> {outcome}")
        tail = (
            f"\nReview artifacts: {self.review_dir}\n"
            + (f"  figure : {os.path.basename(self.figure_path)}\n" if self.figure_path else "")
            + "  masks  : mask_raw.npy, mask_denoised.npy (absent where the extractor abstained)\n"
            "  metrics: input_comparison.json\n"
            "\nInspect the ACFs and masks, then re-run with "
            "extractor_input='raw' or extractor_input='denoised'."
        )
        return head + "\n".join(rows) + "\n" + tail

    def __repr__(self):
        return (f"InputDecisionRequired(label={self.label!r}, "
                f"review_dir={self.review_dir!r})")


def _acf_vlim(acfs, center_exclude=1, floor=0.02):
    """Symmetric colour limit for one or more ACF panels.

    The center lag (== 1.0 by construction — the ACF is center-normalized) is excluded
    so it does not flatten the faint arms that carry the whole signal.
    """
    vals = []
    for a in acfs:
        if a is None:
            continue
        a = np.asarray(a, dtype=float)
        cy, cx = a.shape[0] // 2, a.shape[1] // 2
        m = np.ones(a.shape, dtype=bool)
        m[cy - center_exclude:cy + center_exclude + 1,
          cx - center_exclude:cx + center_exclude + 1] = False
        vals.append(np.abs(a[m]))
    if not vals:
        return floor
    return float(max(floor, np.percentile(np.concatenate(vals), 99.5)))


def make_review_figure(results, out_path, label=None, shared_scale=False):
    """Write the 2x2 raw-vs-denoised review figure.

    Rows = input source (raw / Stage-1 denoised), columns = background ACF and the
    extracted mask. Deliberately kept visual: the reviewer's job is to judge whether
    an ACF is a real noise correlation or a denoising artifact (is it a tight 4-fold
    cross, or a broad single-orientation smear?), and whether the mask that falls out
    of it is one they would have drawn by hand. Numeric gate metrics go to
    ``input_comparison.json``, not onto the figure.

    Each ACF gets its OWN robust colour limit by default, with the limit printed on its
    colourbar. Stage-1 denoising typically multiplies the correlation amplitude several
    times over, so a single shared scale washes the raw panel out to near-blank and
    hides exactly the geometry being judged; per-panel scaling keeps both shapes
    readable while the colourbar numbers preserve the amplitude comparison. Pass
    ``shared_scale=True`` for one common scale across rows.

    Returns the figure path, or None if matplotlib is unavailable.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except Exception:      # pragma: no cover - headless/ABI environments
        return None

    names = [n for n in ('raw', 'denoised') if n in results]
    common = _acf_vlim([results[n].get('acf') for n in names]) if shared_scale else None

    fig, axes = plt.subplots(len(names), 2, figsize=(6.8, 3.4 * len(names)),
                             squeeze=False)
    for row, name in enumerate(names):
        r = results[name]
        ax_acf, ax_mask = axes[row]

        acf = r.get('acf')
        if acf is not None:
            vlim = common if common is not None else _acf_vlim([acf])
            im = ax_acf.imshow(acf, cmap='seismic', vmin=-vlim, vmax=vlim,
                               interpolation='nearest')
            cb = fig.colorbar(im, ax=ax_acf, fraction=0.046, pad=0.03,
                              ticks=[-vlim, 0, vlim])
            cb.ax.set_yticklabels([f'-{vlim:.3f}', '0', f'{vlim:.3f}'], fontsize=7)
        else:
            ax_acf.text(0.5, 0.5, 'no ACF', ha='center', va='center',
                        transform=ax_acf.transAxes, fontsize=9)
        ax_acf.set_ylabel(INPUT_LABELS[name], fontsize=9, fontweight='bold')
        if row == 0:
            ax_acf.set_title('background ACF', fontsize=9)

        mask = r.get('mask')
        if mask is not None:
            ax_mask.imshow(mask, cmap='gray', interpolation='nearest')
            ax_mask.set_xlabel(f"{int(np.sum(mask))} px · {mask.shape[0]}x{mask.shape[1]}",
                               fontsize=8)
        else:
            ax_mask.text(0.5, 0.5, f"ABSTAIN\n({r['reason']})", ha='center', va='center',
                         transform=ax_mask.transAxes, fontsize=9, color='firebrick')
        if row == 0:
            ax_mask.set_title('extracted mask', fontsize=9)

        for ax in (ax_acf, ax_mask):
            ax.set_xticks([])
            ax.set_yticks([])

    if label:
        fig.suptitle(label, fontsize=10)
    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    fig.savefig(out_path, dpi=130, bbox_inches='tight')
    plt.close(fig)
    return out_path


#: Scalar gate fields recorded per input (the large ACF arrays are not JSON-serialised).
_METRIC_KEYS = ('dmax', 'fold', 'outer_scale', 'coherence', 'dmax_thr', 'coherence_thr')


def review_extractor_inputs(extractor, stacks, out_dir, label=None, verbose=False,
                            save_figure=True):
    """Run the extractor on BOTH candidate inputs and write the review artifacts.

    This is the single code path behind ``extractor_input='compare'`` — the batch
    review script and the pipeline call it identically, so what the user inspects is
    produced by exactly the code that will later consume their decision.

    Args:
        extractor (AutoMaskExtractor): a configured extractor (bg_side etc. already set).
        stacks (dict): ``{'raw': (N,H,W) array, 'denoised': (N,H,W) array}``. Either key
            may be omitted (e.g. no Stage-1 cache yet), in which case it is skipped.
        out_dir (str): directory to write ``acf_input_compare.png``, ``mask_<input>.npy``
            and ``input_comparison.json`` into.
        label (str, optional): experiment/variant name, used as the figure title.
        verbose (bool): forwarded to ``extract_mask``.
        save_figure (bool): set False to skip rendering (metrics/masks still written).

    Returns:
        InputDecisionRequired: the halt sentinel, carrying the per-input outcomes.
    """
    os.makedirs(out_dir, exist_ok=True)
    results = {}

    for name in ('raw', 'denoised'):
        stack = stacks.get(name)
        if stack is None:
            continue
        if verbose:
            print(f"[input-compare] extracting from {INPUT_LABELS[name]} "
                  f"stack {np.asarray(stack).shape} ...")
        mask, info = extractor.extract_mask(stack, verbose)

        entry = {
            'input': name,
            'reason': info['reason'],
            'n_mask': int(mask.sum()) if mask is not None else None,
            'mask_shape': list(mask.shape) if mask is not None else None,
            'n_patches': info.get('bg', {}).get('n_patches'),
            'sigma_used': info.get('bg', {}).get('sigma_used'),
            'bg_side_used': info.get('bg', {}).get('bg_side_used'),
        }
        for k in _METRIC_KEYS:
            v = info.get(k)
            entry[k] = float(v) if isinstance(v, (int, float, np.floating)) else v

        if mask is not None:
            mask_path = os.path.join(out_dir, f'mask_{name}.npy')
            np.save(mask_path, mask)
            entry['mask_path'] = mask_path
        # ACF kept in-memory for the figure only; not JSON-serialised.
        results[name] = dict(entry, mask=mask, acf=info.get('acf_raw'))

    fig_path = None
    if save_figure and results:
        fig_path = make_review_figure(
            results, os.path.join(out_dir, 'acf_input_compare.png'), label=label)

    payload = {
        'label': label,
        'extractor_input': 'compare',
        'inputs': {n: {k: v for k, v in r.items() if k not in ('mask', 'acf')}
                   for n, r in results.items()},
        'figure': fig_path,
        'decision': None,     # <- filled in by the user / the review sweep
    }
    with open(os.path.join(out_dir, 'input_comparison.json'), 'w') as fh:
        json.dump(payload, fh, indent=2)

    return InputDecisionRequired(out_dir, results, figure_path=fig_path, label=label)
