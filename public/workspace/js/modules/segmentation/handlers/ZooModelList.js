/**
 * ZooModelList.js - searchable list of bioimage.io zoo models
 *
 * Used twice in the Segmentation module: Step 1 (pick a model to run,
 * ADR-015) and Step 2 (pick a model to fine-tune, ADR-017). The list is
 * fetched from /api/bioimageio/models; an optional filter narrows it (for
 * example to entries flagged `finetunable`).
 */

import { icon } from '/workspace/js/core/icons.js';
import SegmentationAPI from '../SegmentationAPI.js';

const MAX_TAGS = 3;

class ZooModelList {
  /**
   * @param {object} options
   * @param {string} options.listId - id of the <ul> that holds the rows
   * @param {string} [options.searchId] - id of the search input
   * @param {string} [options.showAllId] - id of the "show all" checkbox
   * @param {function} [options.filter] - entry => boolean, applied after the server filter
   * @param {function} options.onSelect - called with the model id of a clicked row
   * @param {function} [options.notify] - (type, message, ms) for the stale-cache warning
   * @param {string} [options.emptyText] - text when nothing matches
   */
  constructor(options) {
    this.listId = options.listId;
    this.searchId = options.searchId || null;
    this.showAllId = options.showAllId || null;
    this.filter = options.filter || null;
    this.onSelect = options.onSelect;
    this.notify = options.notify || null;
    this.emptyText = options.emptyText || 'No models match.';
    this.api = new SegmentationAPI();
    this.models = [];
    this.hidden = 0;
    this.query = '';
    this.showAll = false;
    this.loading = false;
    this.error = null;
    this.selectedId = null;
  }

  /** Bind the search box, the show-all toggle and row clicks (DOM must exist) */
  init() {
    const search = this.searchId ? document.getElementById(this.searchId) : null;
    if (search) {
      search.addEventListener('input', () => {
        this.query = search.value.trim().toLowerCase();
        this.render();
      });
    }
    const showAll = this.showAllId ? document.getElementById(this.showAllId) : null;
    if (showAll) {
      showAll.checked = this.showAll;
      showAll.addEventListener('change', () => {
        this.showAll = showAll.checked;
        this.load();
      });
    }
    const list = document.getElementById(this.listId);
    if (list) {
      list.addEventListener('click', (event) => {
        const row = event.target.closest('.bio-model-row[data-id]');
        if (row && list.contains(row) && this.onSelect) this.onSelect(row.dataset.id);
      });
    }
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      const result = await this.api.listBioimageioModels(this.showAll);
      this.models = result.models || [];
      this.hidden = result.hidden || 0;
      if (result.stale && this.notify) {
        this.notify('warning', 'The model zoo could not be refreshed; showing a cached list.', 6000);
      }
    } catch (error) {
      console.error('[ZooModelList] Zoo list failed:', error);
      this.models = [];
      this.error = error.message;
    }
    this.loading = false;
    this.render();
  }

  setSelected(id) {
    this.selectedId = id || null;
    this.render();
  }

  filtered() {
    let models = this.filter ? this.models.filter(this.filter) : this.models;
    if (this.query) {
      const q = this.query;
      models = models.filter(m =>
        m.name.toLowerCase().includes(q)
        || m.id.toLowerCase().includes(q)
        || (m.description || '').toLowerCase().includes(q)
        || m.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return models;
  }

  render() {
    const list = document.getElementById(this.listId);
    if (!list) return;
    if (this.loading) {
      list.innerHTML = '<li class="bio-model-row empty">Loading the model zoo...</li>';
      return;
    }
    if (this.error) {
      list.innerHTML = `<li class="bio-model-row error">${icon('cross')} ${this.escape(this.error)}
        You can still use a package from the workspace.</li>`;
      return;
    }
    const models = this.filtered();
    if (models.length === 0) {
      list.innerHTML = `<li class="bio-model-row empty">${this.escape(this.emptyText)}</li>`;
      return;
    }
    const footnote = this.hidden && this.showAllId
      ? `<li class="bio-model-row empty">${this.hidden} zoo model${this.hidden === 1 ? '' : 's'} not listed: their architecture code needs Python packages this server does not have.</li>`
      : '';
    list.innerHTML = models.map(m => {
      const cover = m.cover
        ? `<img class="bio-model-cover" src="${this.escape(m.cover)}" alt="" loading="lazy">`
        : `<span class="bio-model-cover placeholder">${m.emoji || ''}</span>`;
      const tags = m.tags.slice(0, MAX_TAGS).map(t => `<span class="bio-badge">${this.escape(t)}</span>`).join('');
      return `
        <li class="bio-model-row${m.id === this.selectedId ? ' selected' : ''}" data-id="${this.escape(m.id)}" title="${this.escape(m.description || '')}">
          ${cover}
          <div class="bio-model-main">
            <div class="bio-model-name">${this.escape(m.name)}</div>
            <div class="bio-model-meta">
              <span class="bio-badge dims">${m.dims}D</span>
              ${tags}
              ${m.license ? `<span class="bio-badge">${this.escape(m.license)}</span>` : ''}
            </div>
          </div>
        </li>`;
    }).join('') + footnote;
  }

  escape(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export default ZooModelList;
