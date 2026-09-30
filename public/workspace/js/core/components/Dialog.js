/**
 * Dialog - the workspace's own confirm and prompt dialogs (ADR-018).
 *
 * Replaces the browser's native confirm()/prompt()/alert() with the modal
 * every other file action uses (.workspace-confirm-* styles). Both calls
 * return a promise:
 *
 *   const ok = await Dialog.confirm({ title, message, confirmLabel, danger });
 *   const value = await Dialog.prompt({ title, label, value, validate });
 *
 * confirm resolves true/false; prompt resolves the entered string or null
 * when cancelled. `validate(value)` returns an error message (string) to
 * keep the dialog open, or nothing to accept. Escape and the overlay cancel,
 * Enter confirms.
 *
 * Loaded as a plain script (window.Dialog) so the file browser and the ES
 * modules can share it.
 */
(function () {
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Lines separated by \n become paragraphs; keeps messages readable */
  const paragraphs = (message, className) => String(message || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `<p class="${className || ''}">${esc(s)}</p>`)
    .join('');

  function open({ title, bodyHtml, confirmLabel, cancelLabel, danger, onConfirm, focus }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'workspace-confirm-modal';
      modal.innerHTML = `
        <div class="workspace-confirm-overlay"></div>
        <div class="workspace-confirm-content" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <h3 id="dialog-title">${esc(title || 'Confirm')}</h3>
          ${bodyHtml}
          <div class="workspace-confirm-actions">
            <button type="button" class="btn-cancel">${esc(cancelLabel || 'Cancel')}</button>
            <button type="button" class="btn-confirm ${danger ? 'btn-danger' : ''}">${esc(confirmLabel || 'OK')}</button>
          </div>
        </div>
      `;

      const cancelBtn = modal.querySelector('.btn-cancel');
      const confirmBtn = modal.querySelector('.btn-confirm');
      const previouslyFocused = document.activeElement;

      const close = (result) => {
        document.removeEventListener('keydown', onKey);
        modal.remove();
        if (previouslyFocused && previouslyFocused.focus) {
          try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
        }
        resolve(result);
      };
      const confirm = () => {
        if (!onConfirm) return close(true);
        // onConfirm returns { error } to keep the dialog open, or { value }
        const result = onConfirm(modal) || {};
        if (result.error) {
          const err = modal.querySelector('.dialog-error');
          if (err) { err.textContent = result.error; err.hidden = false; }
          return;
        }
        close(result.value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(onConfirm ? null : false); }
        else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA')) { e.preventDefault(); confirm(); }
      };

      modal.querySelector('.workspace-confirm-overlay').addEventListener('click', () => close(onConfirm ? null : false));
      cancelBtn.addEventListener('click', () => close(onConfirm ? null : false));
      confirmBtn.addEventListener('click', confirm);
      document.addEventListener('keydown', onKey);

      document.body.appendChild(modal);
      const target = focus ? modal.querySelector(focus) : confirmBtn;
      if (target) {
        target.focus();
        if (target.select) target.select();
      }
    });
  }

  const Dialog = {
    /**
     * @param {object} o
     * @param {string} o.title
     * @param {string} o.message - plain text; newlines separate paragraphs
     * @param {string} [o.detail] - secondary text (rendered as info)
     * @param {string} [o.confirmLabel='OK']
     * @param {string} [o.cancelLabel='Cancel']
     * @param {boolean} [o.danger=false] - red confirm button
     * @returns {Promise<boolean>}
     */
    confirm(o = {}) {
      const bodyHtml = paragraphs(o.message)
        + (o.warning ? paragraphs(o.warning, 'warning-text') : '')
        + (o.detail ? paragraphs(o.detail, 'info-text') : '');
      return open({
        title: o.title,
        bodyHtml,
        confirmLabel: o.confirmLabel,
        cancelLabel: o.cancelLabel,
        danger: o.danger
      });
    },

    /**
     * @param {object} o
     * @param {string} o.title
     * @param {string} [o.message]
     * @param {string} [o.label] - input label
     * @param {string} [o.value] - initial value
     * @param {string} [o.placeholder]
     * @param {string} [o.confirmLabel='OK']
     * @param {(value: string) => string|void} [o.validate] - returns an error to reject
     * @returns {Promise<string|null>} the value, or null when cancelled
     */
    prompt(o = {}) {
      const bodyHtml = paragraphs(o.message) + `
        <div class="split-form dialog-form">
          <div class="split-input-row dialog-input-row">
            ${o.label ? `<label for="dialog-input">${esc(o.label)}</label>` : ''}
            <input type="text" id="dialog-input" class="split-input dialog-input"
                   value="${esc(o.value)}" placeholder="${esc(o.placeholder)}" autocomplete="off">
          </div>
          <div class="dialog-error bio-export-status error" hidden></div>
        </div>`;
      return open({
        title: o.title,
        bodyHtml,
        confirmLabel: o.confirmLabel,
        cancelLabel: o.cancelLabel,
        danger: false,
        focus: '#dialog-input',
        onConfirm: (modal) => {
          const value = modal.querySelector('#dialog-input').value;
          if (o.validate) {
            const error = o.validate(value);
            if (error) return { error: String(error) };
          }
          return { value };
        }
      });
    },

    /**
     * Non-blocking error notice (replaces alert()): a notification when the
     * workspace is up, a dialog otherwise.
     * @param {string} message
     * @param {object} [stateManager]
     */
    error(message, stateManager) {
      if (stateManager && typeof stateManager.notify === 'function') {
        stateManager.notify('error', message, 8000);
        return Promise.resolve(true);
      }
      return open({ title: 'Error', bodyHtml: paragraphs(message, 'warning-text'), confirmLabel: 'OK', cancelLabel: 'Close' });
    }
  };

  window.Dialog = Dialog;
})();
