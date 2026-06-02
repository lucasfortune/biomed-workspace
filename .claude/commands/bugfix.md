---
description: Pick an open bug/issue/feature, fix it on a branch, log the session, and merge cleanly
---

# Bug / Issue / Feature Workflow

You are working through the project's living bug tracker to fix a bug, resolve an issue, or
implement a feature. Follow this workflow in order. Do not skip steps. Wait for the user at every
point that asks for input or confirmation.

> **Scope note:** Only the **workspace** version matters. The classic version is being removed —
> ignore it unless the user says otherwise.

> **Important:** `docs/dev/BUGS_ISSUES.md` is gitignored. Never stage or commit it. All other
> changes (the actual fix, session log, version bump, etc.) ARE committed.

---

## 1. Select what to work on

Read `@docs/dev/BUGS_ISSUES.md`. Each entry under **OPEN bugs/issues/features** has a description,
where it occurs, possible error messages, the desired behaviour, a **priority** rating (0 = fix
whenever → 5 = critical) and an **estimated complexity** (0/1 = very low → 5 = very high). Treat the
estimated complexity as a hint only — it may be inaccurate.

Then ask the user which item to work on using `AskUserQuestion`. Each option's label is a one-line
summary of the item; put the priority and complexity in the description (e.g. `prio 4 · compl 2`).
Order options by priority (highest first). Always include:
- **"All open items"** — work through every open item in priority order
- **"Custom"** — let the user specify exactly which item(s) in their own words

If `$ARGUMENTS` is provided, treat it as the user's pre-selection and skip the question if it
clearly identifies an item.

When working on multiple items, do steps 2–8 for one item (or one logically-grouped batch) at a
time before moving to the next.

---

## 2. Build a complete picture

Ask the user **clarifying questions** about the selected item — reproduction, scope, expected vs.
actual behaviour, edge cases, anything ambiguous. Investigate the relevant code (read files, trace
the data flow) until you genuinely understand the root cause and the shape of the fix.

Do **not** write a separate implementation-plan document or save anything to `docs/vision/`. Keep
the plan in the conversation. Briefly tell the user your intended approach and, for anything beyond
a trivial one-liner, get a quick thumbs-up before implementing.

If the item involves **design or layout**, use the `frontend-design` skill and follow
`@docs/decisions/005_design_system_color_scheme.md` for colors and visual conventions.

---

## 3. Create a branch (if needed)

If the fix/feature will plausibly take **more than one commit** (multi-phase, multiple files,
exploratory), create a dedicated branch from `main` before making changes:

```bash
git checkout -b fix/<short-slug>      # bugs/issues
git checkout -b feat/<short-slug>     # features
```

For a genuinely small, single-commit change, you may work directly on `main` and skip branching.
Note which path you took — it determines whether step 8 includes a merge.

---

## 4. Create the session log (with placeholders)

Once you have a complete picture of the situation (root cause understood, approach agreed), create
a session log from `@docs/templates/SESSION_TEMPLATE.md`:

- Path: `docs/sessions/YYYY-MM-DD_<short_slug>.md` (use today's date).
- Fill in everything you already know: title, date, goals, problem description, investigation
  findings, and intended approach.
- Leave **clear placeholders** (e.g. `_TODO: fill at end_`) for anything only knowable after the
  work is done: final files-changed list, results, metrics, lessons learned, commit count.
- Omit the manual "Testing Performed" checklist section from the template — we no longer script
  manual test steps. Keep the rest of the structure.

---

## 5. Implement

Carry out the fix/feature. For higher actual complexity, work in clear phases and keep the user
informed of progress. Match the surrounding code's style and conventions.

**Test your work thoroughly before showing it to the user.** Every implementation must be verified
to actually do what it's supposed to — don't rely on the code looking correct. Where it makes sense,
run the app and exercise the changed path (the `run` / `verify` skills can help), check the relevant
edge cases you identified in step 2, and confirm nothing adjacent regressed. This is about
confirming the fix works, not about writing a scripted test checklist for the session log.

If appropriate (a meaningful fix or new feature), update the **workspace version number** reference
at the bottom of the workspace hub page. This will be reflected with a git tag at commit time
(step 8).

---

## 6. User confirmation

Show the user what changed and let them try it. **Do not proceed to finalize until the user
confirms they are happy with the fix.** Iterate as needed.

---

## 7. Finalize the documentation

Once the user is satisfied:

1. **Fill in the session log** — replace every placeholder with real content: accomplishments,
   files changed, results, metrics, lessons learned.
2. **Update `docs/sessions/INDEX.md`** — add the new session under the Complete Timeline (reverse
   chronological, newest first) following the existing table format (date, linked title, type icon,
   duration, status).
3. **Update `@docs/dev/BUGS_ISSUES.md`** — move the resolved item out of OPEN. Add a `FIXED:`
   (or `IMPLEMENTED:`) note describing the root cause and what was done, matching the style of
   existing CLOSED entries. (Remember: this file is gitignored — do not commit it.)

---

## 8. Commit and merge

1. **Stage and commit** all tracked changes (the fix, session log, INDEX.md, version bump).
   **Never** stage `docs/dev/BUGS_ISSUES.md`. Use a conventional-commit message matching the repo
   style (`fix(scope): …`, `feat(scope): …`, `docs: …`).
   - If you bumped the workspace version, add a git tag for the new version on this commit.
   - End the commit message with:
     `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
2. **If you created a branch** and the implementation is fully done, merge it back into `main` with
   a merge commit and delete the branch:
   ```bash
   git checkout main
   git merge --no-ff fix/<short-slug>
   git branch -d fix/<short-slug>
   ```
   If the work on the branch is **not** finished, leave it unmerged and tell the user it's still
   open.

---

## 9. Next item

If the user chose multiple items (or "All open items") and unfinished ones remain, return to
step 2 for the next item. Otherwise, give a short summary of everything accomplished this session.
