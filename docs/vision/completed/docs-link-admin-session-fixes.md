# Fix Plan: Docs Link + Admin Session Fixes

## Context

Three low-complexity open issues from BUGS_ISSUES.md:

1. **Docs link on login page** — Users can't learn about the platform before creating an account. The external docs site (https://lucasfortune.github.io/the-virtual-parasite/workspace/) should be linked from the welcome page.
2. **Admin: user unknown** — Denoising sessions always show "User: Unknown" on the admin dashboard because `DenoisingService.createSession()` never stores `username`.
3. **Admin: session module type** — Active sessions don't indicate which module (Segmentation, DL Denoising, Mesh) is being used. Training/inference sessions come from the segmentation module but aren't labeled.

---

## Issue 1: Docs Link on Welcome Page

**Files:** `public/welcome.html`, `public/css/welcome.css`

**Change:** Add a documentation link between the header tagline (line 50) and the auth container (line 53) in `welcome.html`. Style it as a subtle text link matching the page's minimal design.

```html
<!-- After line 50 (</header>), before line 52 (auth container comment) -->
<a href="https://lucasfortune.github.io/the-virtual-parasite/workspace/" 
   target="_blank" rel="noopener noreferrer" class="docs-link">
    Documentation & User Guide
</a>
```

**CSS:** Add `.docs-link` style in `welcome.css` after `.tagline` block (~line 212). Simple centered link with `var(--text-secondary)` color, hover transitions to `var(--accent-primary)`.

---

## Issue 2: Admin — User Unknown for Denoising Sessions

**Files:** `src/services/DenoisingService.js`, `src/routes/denoising.routes.js`

**Root cause:** `denoisingService.createSession()` (DenoisingService.js:50-101) doesn't include `username` or `fullName` fields. The route (denoising.routes.js:619-625) doesn't pass them. The admin endpoint reads from `denoisingService.denoisingSessions`, so it always gets `undefined` → fallback to 'Unknown'.

**Fix:**
1. In `denoising.routes.js` line 619-625: Add `username` and `fullName` to the session data passed to `createSession()`:
   ```js
   denoisingService.createSession(trainingId, {
       sessionId,
       method,
       mode,
       config: fullConfig,
       inputFileId: inputFileId || null,
       username: req.session.user?.username || 'unknown',
       fullName: req.session.user?.fullName || null
   });
   ```

2. In `DenoisingService.js` line 51-92: Add `username` and `fullName` to the session object:
   ```js
   const session = {
       id: trainingId,
       sessionId: sessionData.sessionId,
       username: sessionData.username || null,
       fullName: sessionData.fullName || null,
       method: sessionData.method,
       ...
   ```

3. In `admin.routes.js` line 398-406: Add `fullName` to denoising session response (already has `username` with fallback):
   ```js
   denoising.push({
       denoisingId: session.id,
       status: session.status,
       method: session.method,
       fullName: session.fullName || null,   // ADD
       username: session.username || 'Unknown',
       ...
   ```

4. In `admin.js` line 865: Update denoising card to use `fullName || username` pattern like other cards:
   ```js
   ${session.fullName || session.username || 'Unknown'}
   ```

---

## Issue 3: Admin — Module Type Labels

**Files:** `src/routes/ml.routes.js`, `src/routes/mesh.routes.js`, `src/routes/denoising.routes.js`, `src/services/DenoisingService.js`, `src/routes/admin.routes.js`, `public/js/admin.js`

**Approach:** Add a `moduleType` field when sessions are created. The admin endpoint passes it through. The frontend renders it as a label on each session card.

**Session creation changes:**
- `ml.routes.js:386` (training): Add `moduleType: 'Segmentation'`
- `ml.routes.js:1098` (inference): Add `moduleType: 'Segmentation'`
- `mesh.routes.js:432`: Add `moduleType: 'Mesh Generation'`
- `denoising.routes.js:619` + `DenoisingService.js:51`: Add `moduleType: 'DL Denoising'`

**Admin endpoint changes** (`admin.routes.js`):
- Include `moduleType` in all four session type responses

**Frontend changes** (`admin.js`):
- Add a "Module" detail row to each session card type showing `session.moduleType || 'N/A'`

---

## Verification

1. Start dev server: `npm run dev`
2. **Docs link:** Visit `http://localhost:3000/` — verify link appears below tagline, opens docs in new tab, works in both light/dark mode
3. **Admin fixes:** Would require an active denoising session to fully test. Verify by:
   - Code review: confirm `username`/`fullName`/`moduleType` flow from route → service → admin endpoint → frontend
   - If possible, start a quick test denoising session and check admin dashboard
