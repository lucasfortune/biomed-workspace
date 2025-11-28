# Documentation Archive

**Purpose:** This directory preserves historical documentation files from before the documentation system reorganization (November 2025).

**Date Archived:** 2025-11-28

---

## Archived Files

### VISION.md
**Original Location:** `/VISION.md` (project root)
**Date Created:** ~November 2024
**Last Modified:** 2025-11-17

**What it contained:**
- Original product vision and goals
- Target users and use cases
- Technology stack decisions
- Long-term roadmap (Phases 1-7+)
- Success metrics and business model

**Where to find updated content:**
- **Product Vision:** [docs/vision/PLATFORM_VISION.md](../vision/PLATFORM_VISION.md)
- **Roadmap:** [docs/vision/ROADMAP.md](../vision/ROADMAP.md)
- **Module Specifications:** [docs/vision/MODULE_SPECS.md](../vision/MODULE_SPECS.md)

**Why archived:**
Content has been reorganized, updated, and distributed across the new documentation structure. This file is preserved for historical reference and to track how the vision evolved over time.

---

### ACTIONPLAN.md
**Original Location:** `/ACTIONPLAN.md` (project root)
**Date Created:** ~November 2024
**Last Modified:** 2025-11-20

**What it contained:**
- Phase-by-phase development plan
- Task breakdowns for each phase
- Timeline estimates
- Success criteria
- Dependencies between phases
- Risk management

**Where to find updated content:**
- **Development Roadmap:** [docs/vision/ROADMAP.md](../vision/ROADMAP.md) - Complete phase-by-phase plan with current status
- **Phase 1 Session Log:** [docs/sessions/2025-11-20_phase1_completion.md](../sessions/2025-11-20_phase1_completion.md) - What was actually accomplished
- **Phase 2 Session Log:** [docs/sessions/2025-11-26_phase2_completion.md](../sessions/2025-11-26_phase2_completion.md) - Segmentation module integration

**Why archived:**
The action plan was a living document that tracked Phases 1 and 2. Now that both phases are complete, the detailed plan has been superseded by:
1. **Session logs** (what actually happened in each phase)
2. **ROADMAP.md** (updated plan for remaining phases)
3. **MODULE_SPECS.md** (detailed specifications for planned modules)

---

## Documentation System Evolution

### Before (Nov 2024 - Nov 2025)
Documentation was scattered across the project root:
- `VISION.md` - Product vision
- `ACTIONPLAN.md` - Development roadmap
- `CLAUDE.md` - AI assistant guide (still in root, updated)
- `README.md` - Project overview (still in root, updated)
- Various session logs in `/docs/troubleshooting/`

**Problems:**
- No central index or navigation
- Hard to find specific information
- Inconsistent structure
- Missing critical documentation (API reference, module creation guide)

### After (Nov 2025)
Comprehensive documentation system in `/docs/`:
```
/docs/
├── INDEX.md                    # Master navigation hub
├── DOCUMENTATION_PLAN.md       # Reorganization plan
├── guides/                     # How-to documentation (5 guides)
├── reference/                  # Technical reference (6 docs)
├── architecture/               # System design (5 docs)
├── sessions/                   # Development history (7 logs)
├── decisions/                  # ADRs (4 decisions)
├── vision/                     # Product roadmap (3 docs)
├── templates/                  # Doc templates (4 templates)
└── archive/                    # Historical docs (this directory)
```

**Improvements:**
- ✅ Central master index ([docs/INDEX.md](../INDEX.md))
- ✅ Clear navigation for all user types
- ✅ Consistent structure via templates
- ✅ 32 documentation files, ~19,000 lines
- ✅ 5-minute context gathering for AI assistants
- ✅ 1-hour onboarding for new developers

---

## When to Consult Archive

**You should read archived files when:**
1. **Historical context needed:** Understanding how vision evolved over time
2. **Original decisions:** Seeing initial planning before course corrections
3. **Comparison:** Comparing original plan vs. what was actually built
4. **Research:** Studying project evolution for retrospectives

**You should NOT read archived files for:**
1. **Current product vision** → Read [PLATFORM_VISION.md](../vision/PLATFORM_VISION.md)
2. **Current roadmap** → Read [ROADMAP.md](../vision/ROADMAP.md)
3. **Phase 1/2 details** → Read session logs ([Phase 1](../sessions/2025-11-20_phase1_completion.md), [Phase 2](../sessions/2025-11-26_phase2_completion.md))
4. **Architecture understanding** → Read [architecture docs](../architecture/)

---

## Preservation Rationale

These files are preserved rather than deleted because:

1. **Historical Record:** Documents how the vision and plan evolved
2. **Original Intent:** Captures initial thinking before implementation reality
3. **Decision Tracking:** Shows why certain approaches were chosen or abandoned
4. **Transparency:** Demonstrates project evolution honestly
5. **Learning:** Future projects can learn from this project's evolution

---

## File Integrity

Both archived files are preserved in their original state from their last modification date. No content has been altered. They are read-only for historical reference.

**Original Locations:**
- `/VISION.md` (root) → `/docs/archive/VISION.md`
- `/ACTIONPLAN.md` (root) → `/docs/archive/ACTIONPLAN.md`

**Git History:**
The full git history of these files is preserved in the repository. Use `git log -- VISION.md` or `git log -- ACTIONPLAN.md` to see the complete evolution.

---

## Documentation Reorganization

This archival was part of the comprehensive documentation reorganization completed over 4.5 days in November 2025:

**Timeline:**
- **Day 1 (Nov 27):** Foundation (directory structure, templates, initial guides)
- **Day 2 (Nov 27):** API & Reference docs (6 comprehensive reference docs)
- **Day 3 (Nov 27):** Architecture docs (5 architecture docs, 4 ADRs)
- **Day 4 (Nov 27):** Guides & Vision (3 guides, 3 vision docs)
- **Day 5 (Nov 28):** Cleanup & Finalization (archival, link verification, polish)

**Plan:** [docs/DOCUMENTATION_PLAN.md](../DOCUMENTATION_PLAN.md)
**Session Logs:**
- [Days 1-2 Documentation System](../sessions/2025-11-27_documentation_system.md)
- [Day 4 Guides & Vision](../sessions/2025-11-27_day4_guides_vision.md)

---

## Navigation

← [Back to Documentation Index](../INDEX.md)

---

**Last Updated:** 2025-11-28
**Archive Maintenance:** No updates planned (preserved as historical record)
