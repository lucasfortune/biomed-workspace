/**
 * SliceViewerChrome
 *
 * The shared header / slider strip / footer around a slice canvas
 * (consolidation Phase 2, tracker B5). Styles live in core/css/slice-viewer.css.
 *
 * The module keeps its own canvas or engine; the chrome only renders the
 * frame and translates clicks, slider input, the slice number field and
 * the ←/→ keys into callbacks. Slice indices are 0-based in the API and
 * displayed 1-based ("n / N", decision 4).
 *
 * Usage:
 *   this.chrome = new SliceViewerChrome({
 *     slices: 12,
 *     onSliceChange: (i0) => this.goToSlice(i0),
 *     onZoomIn: () => this.canvas.zoomIn(), ...
 *   });
 *   template: `<div class="sv-main">${this.chrome.render()}<div class="sv-toolbar">…</div></div>`
 *   after the template is in the DOM: this.chrome.mount(rootElement);
 *   put the canvas into this.chrome.area (a host div that fills the canvas
 *   box); update with setSlice / setZoom /
 *   setStatus / setFooter / setHistory; call destroy() on deactivate.
 */
class SliceViewerChrome {
  /**
   * @param {object} options
   * @param {number}   [options.slices=1]           total slice count
   * @param {number}   [options.slice=0]            initial slice (0-based)
   * @param {boolean}  [options.showPrevNext=true]  ◀ n / N ▶ group in the header
   * @param {boolean}  [options.showSlider=true]    full-width slider strip under the canvas
   * @param {boolean}  [options.showZoom=true]      − % + ⊡ 1:1 group
   * @param {boolean}  [options.showUndoRedo=false] ↶ ↷ group
   * @param {string}   [options.headerExtra='']     extra HTML for the right side of the header
   * @param {string}   [options.footerLeft='']      initial footer text (left)
   * @param {string}   [options.footerRight='']     initial footer text (right)
   * @param {boolean}  [options.keyboard=true]      bind ←/→ on document to change the slice
   * @param {function} [options.isActive]           () => boolean; keys are ignored when false
   * @param {function} [options.onSliceChange]      (index0) => void
   * @param {function} [options.onZoomIn]
   * @param {function} [options.onZoomOut]
   * @param {function} [options.onZoomFit]
   * @param {function} [options.onZoomReset]
   * @param {function} [options.onUndo]
   * @param {function} [options.onRedo]
   */
  constructor(options = {}) {
    this.options = {
      slices: 1,
      slice: 0,
      showPrevNext: true,
      showSlider: true,
      showZoom: true,
      showUndoRedo: false,
      headerExtra: '',
      footerLeft: '',
      footerRight: '',
      keyboard: true,
      isActive: () => true,
      ...options
    };

    this.slices = Math.max(1, this.options.slices | 0);
    this.slice = Math.max(0, Math.min(this.slices - 1, this.options.slice | 0));
    this.root = null;
    this.el = {};
    this.sliderScrubbing = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._keysBound = false;
  }

  // ---------------------------------------------------------------------------
  // Markup
  // ---------------------------------------------------------------------------

  /** @returns {string} the `.sv-wrap` markup (header, empty area, strip, footer) */
  render() {
    const o = this.options;
    const nav = o.showPrevNext ? `
      <div class="sv-group">
        <label>Slice:</label>
        <div class="sv-nav">
          <button type="button" class="btn-icon" data-sv="prev" title="Previous slice (←)">◀</button>
          <span class="sv-nav-readout">
            <input type="number" class="sv-nav-num" data-sv="num" min="1" max="${this.slices}"
                   value="${this.slice + 1}" title="Go to slice" aria-label="Current slice">
            <span>/</span>
            <span data-sv="total">${this.slices}</span>
          </span>
          <button type="button" class="btn-icon" data-sv="next" title="Next slice (→)">▶</button>
        </div>
      </div>` : '';

    const zoom = o.showZoom ? `
      <div class="sv-group">
        <label>Zoom:</label>
        <div class="sv-zoom">
          <button type="button" class="btn-icon" data-sv="zoom-out" title="Zoom out">−</button>
          <span class="sv-zoom-readout" data-sv="zoom-readout">100%</span>
          <button type="button" class="btn-icon" data-sv="zoom-in" title="Zoom in">+</button>
          <button type="button" class="btn-icon" data-sv="zoom-fit" title="Fit to view">⊡</button>
          <button type="button" class="btn-icon" data-sv="zoom-reset" title="Actual size (100%)">1:1</button>
        </div>
      </div>` : '';

    const history = o.showUndoRedo ? `
      <div class="sv-group">
        <button type="button" class="btn-icon" data-sv="undo" title="Undo (Ctrl+Z)" disabled>↶</button>
        <button type="button" class="btn-icon" data-sv="redo" title="Redo (Ctrl+Y)" disabled>↷</button>
      </div>` : '';

    const strip = o.showSlider ? `
      <div class="sv-slider-strip">
        <input type="range" class="range-slider sv-slider" data-sv="slider"
               min="0" max="${this.slices - 1}" value="${this.slice}"
               title="Drag to change slice" aria-label="Slice">
      </div>` : '';

    return `
      <div class="sv-wrap">
        <div class="sv-header">
          <div class="sv-header-left">${nav}${history}</div>
          <div class="sv-header-right">${o.headerExtra || ''}${zoom}</div>
        </div>
        <div class="sv-area">
          <div class="sv-canvas-host" data-sv="area"></div>
          <div class="sv-status" data-sv="status" hidden>
            <div class="sv-spinner"></div>
            <span data-sv="status-text"></span>
          </div>
        </div>
        ${strip}
        <div class="sv-footer">
          <span class="sv-footer-item" data-sv="footer-left">${o.footerLeft || ''}</span>
          <span class="sv-footer-item" data-sv="footer-right">${o.footerRight || ''}</span>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Mount / destroy
  // ---------------------------------------------------------------------------

  /**
   * Bind to the rendered markup.
   * @param {HTMLElement} root - the `.sv-wrap` element or an ancestor containing one
   * @returns {SliceViewerChrome}
   */
  mount(root) {
    if (!root) throw new Error('SliceViewerChrome.mount: root element missing');
    this.root = root.matches?.('.sv-wrap') ? root : root.querySelector('.sv-wrap');
    if (!this.root) throw new Error('SliceViewerChrome.mount: no .sv-wrap under root');

    const q = (name) => this.root.querySelector(`[data-sv="${name}"]`);
    this.el = {
      prev: q('prev'), next: q('next'), num: q('num'), total: q('total'),
      slider: q('slider'),
      zoomIn: q('zoom-in'), zoomOut: q('zoom-out'), zoomFit: q('zoom-fit'),
      zoomReset: q('zoom-reset'), zoomReadout: q('zoom-readout'),
      undo: q('undo'), redo: q('redo'),
      area: q('area'), status: q('status'), statusText: q('status-text'),
      footerLeft: q('footer-left'), footerRight: q('footer-right')
    };

    const o = this.options;
    const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

    on(this.el.prev, 'click', () => this._request(this.slice - 1));
    on(this.el.next, 'click', () => this._request(this.slice + 1));
    on(this.el.num, 'change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (Number.isNaN(v)) { e.target.value = this.slice + 1; return; }
      this._request(v - 1);
    });
    on(this.el.num, 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      e.stopPropagation();   // keep ←/→ inside the field from changing slices
    });
    on(this.el.slider, 'input', (e) => this._request(parseInt(e.target.value, 10)));
    // While the user drags, a completing load must not snap the thumb back
    on(this.el.slider, 'pointerdown', () => { this.sliderScrubbing = true; });
    on(this.el.slider, 'change', () => { this.sliderScrubbing = false; });

    on(this.el.zoomIn, 'click', () => o.onZoomIn?.());
    on(this.el.zoomOut, 'click', () => o.onZoomOut?.());
    on(this.el.zoomFit, 'click', () => o.onZoomFit?.());
    on(this.el.zoomReset, 'click', () => o.onZoomReset?.());
    on(this.el.undo, 'click', () => o.onUndo?.());
    on(this.el.redo, 'click', () => o.onRedo?.());

    if (o.keyboard && !this._keysBound) {
      document.addEventListener('keydown', this._onKeyDown);
      this._keysBound = true;
    }

    this._sync();
    return this;
  }

  /** Remove document listeners; the markup is left to the module's own teardown */
  destroy() {
    if (this._keysBound) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._keysBound = false;
    }
    this.root = null;
    this.el = {};
  }

  /**
   * The `.sv-canvas-host` element (fills `.sv-area`) the module puts its
   * canvas into. Modules may clear it; the status overlay is a sibling.
   */
  get area() {
    return this.el.area || null;
  }

  // ---------------------------------------------------------------------------
  // State updates
  // ---------------------------------------------------------------------------

  /**
   * Reflect the current slice (0-based) and optionally a new total.
   * Does not fire onSliceChange.
   */
  setSlice(index0, total = null) {
    if (total != null) this.slices = Math.max(1, total | 0);
    this.slice = Math.max(0, Math.min(this.slices - 1, index0 | 0));
    this._sync();
  }

  /** Change the total slice count, clamping the current slice */
  setSlices(total) {
    this.setSlice(this.slice, total);
  }

  /** @param {number} zoom - scale factor (1 = 100 %) */
  setZoom(zoom) {
    if (this.el.zoomReadout) {
      this.el.zoomReadout.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  /**
   * Show the overlay with a message (spinner unless isError), or hide it
   * when text is empty / null.
   */
  setStatus(text, isError = false) {
    const { status, statusText } = this.el;
    if (!status) return;
    if (!text) {
      status.hidden = true;
      status.classList.remove('is-error');
      return;
    }
    statusText.textContent = text;
    status.classList.toggle('is-error', !!isError);
    status.hidden = false;
  }

  /**
   * Footer readouts; pass `undefined` to leave a side unchanged, '' to clear it.
   * `leftClass` / `rightClass` add a modifier ('good' | 'poor' | '') to the item.
   */
  setFooter(left, right, leftClass, rightClass) {
    const apply = (el, text, cls) => {
      if (!el) return;
      if (text !== undefined) el.textContent = text ?? '';
      if (cls !== undefined) el.className = `sv-footer-item${cls ? ' ' + cls : ''}`;
    };
    apply(this.el.footerLeft, left, leftClass);
    apply(this.el.footerRight, right, rightClass);
  }

  /** Enable / disable the undo and redo buttons */
  setHistory(canUndo, canRedo) {
    if (this.el.undo) this.el.undo.disabled = !canUndo;
    if (this.el.redo) this.el.redo.disabled = !canRedo;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _request(index0) {
    const clamped = Math.max(0, Math.min(this.slices - 1, index0 | 0));
    if (clamped === this.slice) {
      this._sync();   // out-of-range or unchanged: just normalise the controls
      return;
    }
    this.options.onSliceChange?.(clamped);
  }

  _sync() {
    const { prev, next, num, total, slider } = this.el;
    if (num) {
      num.max = this.slices;
      num.value = this.slice + 1;
      num.disabled = this.slices <= 1;
    }
    if (total) total.textContent = String(this.slices);
    if (prev) prev.disabled = this.slice <= 0;
    if (next) next.disabled = this.slice >= this.slices - 1;
    if (slider) {
      slider.max = Math.max(0, this.slices - 1);
      if (!this.sliderScrubbing) slider.value = this.slice;
      slider.disabled = this.slices <= 1;
    }
  }

  _onKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.root || !this.root.isConnected) return;
    if (!this.options.isActive()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    this._request(this.slice + (e.key === 'ArrowLeft' ? -1 : 1));
  }
}

export default SliceViewerChrome;
