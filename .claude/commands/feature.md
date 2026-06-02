---
description: Pick an open feature idea, discuss it collaboratively, implement on a branch, log the session, and merge cleanly
---

# Feature Implementation Workflow

You are working through the project's living feature backlog to design and implement a new feature
(or change an existing one). Follow this workflow in order. Do not skip steps. Wait for the user at
every point that asks for input or confirmation.

> **Scope note:** Only the **workspace** version matters. The classic version is being removed —
> ignore it unless the user says otherwise.

> **Important:** `docs/dev/FEATURES.md` is gitignored. Never stage or commit it. All other changes
> (the actual implementation, session log, version bump, etc.) ARE committed.

---

## 1. Select what to work on

Read `@docs/dev/FEATURES.md`. Each entry under **OPEN feature ideas** describes a new feature (or a
change to an existing one), with a **priority** rating (0 = implement whenever → 5 = critical) and
an **estimated complexity** (0 = low → 5 = high). Treat the estimated complexity as a hint only — it
may be inaccurate.

Then ask the user which feature to work on using `AskUserQuestion`. Each option's label is a
one-line summary of the feature; put the priority and complexity in the description (e.g.
`prio 1 · compl 4`). Order options by priority (highest first). Always include:
- **"Custom"** — let the user specify exactly which feature(s) in their own words

If `$ARGUMENTS` is provided, treat it as the user's pre-selection and skip the question if it
clearly identifies a feature.

When working on multiple features, do steps 2–8 for one feature at a time before moving to the next.

---

## 2. Discuss and design (be thorough)

This is the heart of the workflow. **Every feature idea is open for discussion and the user wants
your active involvement in shaping it.** Ask thorough clarifying questions, explore trade-offs,
weigh implementation approaches (e.g. browser-side vs. backend, separate module vs. extension of an
existing one), and surface constraints. If you see worthwhile **additions or improvements** to the
feature idea, propose them.

Investigate the relevant code so your input is grounded in how the system actually works. Keep going
until the discussion has converged on a clear, agreed design.

Do **not** write a separate implementation-plan document or save anything to `docs/vision/`. Once
the design is settled, briefly lay out the implementation approach in the conversation — split into
clear phases if the actual complexity warrants it — and get the user's go-ahead before building.

If the feature involves **design or layout**, use the `frontend-design` skill and follow
`@docs/decisions/005_design_system_color_scheme.md` for colors and visual conventions.

---

## 3. Create a branch (if needed)

If the feature will plausibly take **more than one commit** (multi-phase, multiple files,
exploratory) — which is typical for features — create a dedicated branch from `main` before making
changes:

```bash
git checkout -b feat/<short-slug>
```

For a genuinely small, single-commit change, you may work directly on `main` and skip branching.
Note which path you took — it determines whether step 8 includes a merge.

---

## 4. Create the session log (with placeholders)

Once you have a complete picture of the situation (design agreed, approach clear), create a session
log from `@docs/templates/SESSION_TEMPLATE.md`:

- Path: `docs/sessions/YYYY-MM-DD_<short_slug>.md` (use today's date).
- Fill in everything you already know: title, date, goals, the feature design, the discussion
  outcome, and intended approach (phases if any).
- Leave **clear placeholders** (e.g. `_TODO: fill at end_`) for anything only knowable after the
  work is done: final files-changed list, results, metrics, lessons learned, commit count.
- Omit the manual "Testing Performed" checklist section from the template — we no longer script
  manual test steps. Keep the rest of the structure.

---

## 5. Implement

Build the feature. For multi-phase work, complete one phase at a time and keep the user informed of
progress. Match the surrounding code's style and conventions.

**Test your work thoroughly before showing it to the user.** Every implementation must be verified
to actually do what it's supposed to — don't rely on the code looking correct. Where it makes sense,
run the app and exercise the new feature (the `run` / `verify` skills can help), check the relevant
edge cases raised during discussion, and confirm nothing adjacent regressed. This is about
confirming the feature works, not about writing a scripted test checklist for the session log.

If appropriate (a meaningful new feature), update the **workspace version number** reference at the
bottom of the workspace hub page. This will be reflected with a git tag at commit time (step 8).

---

## 6. User confirmation

Show the user what was built and let them try it. For multi-phase work, confirm each phase before
moving on. **Do not proceed to finalize until the user confirms they are happy with the feature.**
Iterate as needed.

---

## 7. Finalize the documentation

Once the user is satisfied:

1. **Fill in the session log** — replace every placeholder with real content: accomplishments,
   files changed, results, metrics, lessons learned.
2. **Update `docs/sessions/INDEX.md`** — add the new session under the Complete Timeline (reverse
   chronological, newest first) following the existing table format (date, linked title, type icon,
   duration, status).
3. **Update `@docs/dev/FEATURES.md`** — move the implemented feature out of OPEN. Add an
   `IMPLEMENTED:` note describing what was built and any notable design decisions, matching the
   style of existing closed entries. (Remember: this file is gitignored — do not commit it.)

---

## 8. Commit and merge

1. **Stage and commit** all tracked changes (the implementation, session log, INDEX.md, version
   bump). **Never** stage `docs/dev/FEATURES.md`. Use a conventional-commit message matching the
   repo style (`feat(scope): …`, `docs: …`).
   - If you bumped the workspace version, add a git tag for the new version on this commit.
   - End the commit message with:
     `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
2. **If you created a branch** and the implementation is fully done, merge it back into `main` with
   a merge commit and delete the branch:
   ```bash
   git checkout main
   git merge --no-ff feat/<short-slug>
   git branch -d feat/<short-slug>
   ```
   If the work on the branch is **not** finished, leave it unmerged and tell the user it's still
   open.

---

## 9. Next feature

If the user chose multiple features (or unfinished ones remain), return to step 2 for the next one.
Otherwise, ask the user whether they want to work on more features — if yes, start again from
step 1. If not, give a short summary of everything accomplished this session.
