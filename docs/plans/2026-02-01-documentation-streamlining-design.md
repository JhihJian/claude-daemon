# Documentation Streamlining Design

**Date:** 2026-02-01
**Goal:** Reduce documentation to essential user-facing and technical reference only, removing all process documentation.

## Overview

This design streamlines the project's documentation from ~55 files to 9 essential files, removing process documentation (testing reports, release procedures, legacy docs) while preserving user-facing documentation and core technical reference.

### What Stays (9 files total)

**Root level (5 files):**
- README.md - Enhanced with quick-start content
- CLAUDE.md - AI assistant instructions
- CONTRIBUTING.md - Contribution guidelines
- CODE_OF_CONDUCT.md - Community standards
- CHANGELOG.md - Version history

**Technical reference (4 files):**
- docs/architecture/OVERVIEW.md - Consolidated architecture overview
- docs/guides/DAEMON-GUIDE.md - Daemon usage
- docs/guides/WEB-UI-GUIDE.md - Web UI usage
- docs/README.md - Documentation index

### What Gets Removed (~45 files)

- **docs/testing-reports/** - All 14 test/bug reports
- **docs/release/** - All 4 release process docs
- **docs/legacy/** - All 4 legacy Windows docs
- **docs/features/** - All 3 feature descriptions
- **docs/architecture/** - 4 redundant architecture docs (keep OVERVIEW.md only)
- **docs/guides/** - 3 redundant guides (QUICKSTART, SYNC-GUIDE, PUSH-GUIDE)
- **docs/demos/** - Demo documentation
- **Misc docs:** AGENT-MESSAGING.md, E2E-TEST-PLAN.md, AGENT-REGISTRY.md

## Content Consolidation Strategy

### README.md Enhancement

Merge QUICK-START.md content into README.md by adding a "Quick Start" section near the top, right after the project overview. This section should include:
- Installation command: `npx @jhihjian/claude-daemon install`
- Basic daemon startup: `bun daemon/main.ts --enable-web-ui`
- Link to detailed guides for more information

The merged content keeps README.md as a single entry point while maintaining quick onboarding flow.

### docs/architecture/OVERVIEW.md Consolidation

This file should absorb essential technical concepts from the files being removed:
- Key integration patterns from `claude-daemon-integration-architecture.md`
- Agent system fundamentals from `AGENTS.md`
- Critical implementation details from `DAEMON-IMPLEMENTATION.md`

Focus on architectural decisions and system design, not implementation procedures. Keep it under 1000 words - enough for developers to understand the system without overwhelming detail.

### docs/README.md Update

Rewrite as a simple index pointing to the 3 remaining docs:
- Link to architecture/OVERVIEW.md
- Link to guides/DAEMON-GUIDE.md
- Link to guides/WEB-UI-GUIDE.md

This provides clear navigation for technical documentation.

## Migration Plan

### Step 1: Content Extraction and Merging

- Extract quick-start content from QUICK-START.md
- Insert into README.md as new "Quick Start" section (after "Project Overview", before "Features")
- Extract key architectural concepts from DAEMON-IMPLEMENTATION.md, AGENTS.md, and claude-daemon-integration-architecture.md
- Consolidate into docs/architecture/OVERVIEW.md with clear subsections

### Step 2: Safe Deletion with Git

- Create a git branch for this work: `docs/streamline-documentation`
- Delete files in batches by category:
  - Batch 1: testing-reports/ (14 files)
  - Batch 2: release/ (4 files)
  - Batch 3: legacy/ (4 files)
  - Batch 4: features/ (3 files)
  - Batch 5: Redundant architecture and guide files
- Commit after each batch with descriptive messages
- Delete QUICK-START.md after merging into README.md

### Step 3: Update Cross-References

- Search for links to deleted files in remaining docs
- Update or remove broken links
- Verify CLAUDE.md doesn't reference deleted files

### Step 4: Final Cleanup

- Rewrite docs/README.md as simple index
- Remove empty directories
- Update CHANGELOG.md with documentation streamlining entry

## Final Structure

```
/
├── README.md (enhanced with quick-start)
├── CLAUDE.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
└── docs/
    ├── README.md (simple index)
    ├── architecture/
    │   └── OVERVIEW.md (consolidated)
    └── guides/
        ├── DAEMON-GUIDE.md
        └── WEB-UI-GUIDE.md
```

## Validation Checklist

- [ ] README.md includes quick-start section with installation and basic usage
- [ ] docs/architecture/OVERVIEW.md is under 1000 words and covers key concepts
- [ ] No broken links in remaining documentation
- [ ] CLAUDE.md still accurately describes project for AI assistants
- [ ] All deleted content is committed to git (recoverable)
- [ ] Empty directories removed

## Important Considerations

**Git history preservation:** All deleted files remain in git history, accessible via `git log --all --full-history -- path/to/file`

**No information loss:** Testing reports and release docs are historical records, not needed for current users

**Reduced maintenance:** Fewer docs means less to keep updated

**Clear purpose:** Each remaining doc has a distinct, essential purpose

## Risk Mitigation

- Work in a branch so changes can be reviewed before merging
- Keep commits atomic by category for easy rollback if needed
- All deleted content remains in git history for recovery

## Next Steps

After design approval:
1. Use `superpowers:using-git-worktrees` to create isolated workspace
2. Use `superpowers:writing-plans` to create detailed implementation plan
3. Execute migration following the plan above
