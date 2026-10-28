# ADR-019: Local Mode

**Release:** v1.12.0
**Status:** Accepted, implemented (2026-10-28)
**Context:** The workspace was built for one publicly hosted instance with
many users. Login with admin approval, the 48 h retention policy (ADR-012)
and the per-kind upload limits exist to protect that server. Since the
repository went public (1.5.1) the app is also installed on single-user
machines: Lucas's workstations and colleagues' laptops. There the same
rules are only in the way: a forgotten admin password locks the owner out
of their own machine, a workspace vanishes after two days of holiday, and
a 200 MB image limit makes no sense on a workstation that exists for
large volumes.

## What the audit found

- The three restrictions are already centralised. `requireAuth` guards
  102 routes, `requireApproved` and four inline status checks guard
  uploads and model import, and all of them only read `req.session.user`.
  Retention is one constant (`RETENTION_HOURS`) feeding the session TTL,
  the cookie lifetime and the `CleanupService` grace period. Upload sizes
  are one object (`UPLOAD_LIMITS`), consumed by the multer middleware and
  `uploadKind`, with a hard-coded copy of the numbers in the file browser's
  client-side check.
- The real obstacle is not login but identity: workspaces are keyed by
  the express session id (ADR-003) and nothing maps a user to a
  workspace. Switching off cleanup alone would leave the workspace on disk
  but unreachable as soon as the cookie is lost (new browser, cleared
  site data, expired session file). A local mode therefore has to give
  the workspace a stable id, not just skip the login page.
- `req.session.id` is read in 83 places across the routes. Rewriting them
  to a "workspace id" abstraction would be a large diff for no behavioural
  gain. express-session's `genid` option lets the server decide the id of
  every new session, which makes the session itself stable instead.

## Decision

One flag, `LOCAL_MODE=true` in `.env`. Unset or anything but `true`, the
server behaves exactly as before; nothing on the public server changes.

1. **Built-in user.** A middleware installed right after the session
   middleware (Express and the Socket.IO engine alike) puts a fixed user
   into every session that has none: username `local`, status `active`,
   admin. The existing guards are untouched and keep working.
2. **Stable session.** In local mode `genid` returns the constant `local`,
   so every new session, in any browser, is the same session and the
   workspace lives at `workspaces/local/`. A lost cookie means a new
   cookie for the same session, not a new workspace.
3. **No expiry, no cleanup.** Session TTL and cookie lifetime become one
   year and roll on every request; the `CleanupService` is not started.
   The retention text in the help articles gains a sentence saying it does
   not apply to local installs.
4. **Generous limits.** Upload limits are now read from `.env`
   (`UPLOAD_LIMIT_IMAGE_MB`, `UPLOAD_LIMIT_MODEL_MB`, `UPLOAD_LIMIT_ZIP_MB`)
   in both modes. Defaults stay 200 MB / 2 GB / 5 GB on the public server
   and become 20 GB / 20 GB / 50 GB in local mode. The server reports the
   effective limits in `/check-auth`, and the file browser validates against
   those instead of its hard-coded table, so the client and server never
   disagree again.
5. **UI.** `/` redirects straight to `/workspace`. The sidebar shows
   "Local mode" where the approval status used to be, and the logout button
   is hidden. `POST /logout` answers 400 in local mode, because logging out
   deletes the workspace after a confirmation, and in local mode that
   workspace is the only one.

Not changed: `/register`, `/login` and the admin dashboard still exist and
work (the built-in user is an admin), `users.json` is simply never
needed. `DATA_DIR` keeps its meaning. `HOST` still defaults to 127.0.0.1;
local mode has no authentication, so binding it to a network interface is
the installer's deliberate choice, and the README says so.

## Verification

- Producer harness (`scripts/harness-producers.js --skip-dl`) unchanged in
  normal mode: the harness bypasses the session middleware with its own
  fake session, so the built-in-user middleware is a no-op there.
- Fresh clone booted with and without the flag: in normal mode `/`
  serves the welcome page and `/workspace` redirects to `/`; in local mode
  `/` redirects to `/workspace`, `/check-auth` returns the built-in user
  with the raised limits, two clients without cookies get the same
  workspace id, the cleanup service does not start, and `/logout` is
  refused.
