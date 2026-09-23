// Utility functions

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this when inserting user-provided or server-provided data into innerHTML.
 * @param {string|number|null|undefined} text - The text to escape
 * @returns {string} The escaped HTML-safe string
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showLoading(title, description) {
    document.getElementById('loadingText').textContent = title;
    document.getElementById('loadingDescription').textContent = description;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}
