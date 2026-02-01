# Documentation Streamlining Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce project documentation from ~55 files to 9 essential files by removing process documentation and consolidating user-facing content.

**Architecture:** Content consolidation (merge QUICK-START.md → README.md, consolidate architecture docs → OVERVIEW.md), batch deletion by category with git commits, link verification, and index updates.

**Tech Stack:** Markdown, Git, Bash

---

## Task 1: Extract and Merge Quick Start Content

**Files:**
- Read: `QUICK-START.md`
- Modify: `README.md` (add Quick Start section after Project Overview)
- Delete: `QUICK-START.md` (after merge)

**Step 1: Read QUICK-START.md to extract content**

Run: `cat QUICK-START.md`
Expected: Content showing installation and basic usage instructions

**Step 2: Identify insertion point in README.md**

Run: `grep -n "## " README.md | head -10`
Expected: List of section headers with line numbers

**Step 3: Add Quick Start section to README.md**

Insert after "## Project Overview" section (around line 20-30):

```markdown
## Quick Start

### Installation

```bash
npx @jhihjian/claude-daemon install
```

This will:
- Install hooks to `~/.claude/hooks/`
- Configure Claude Code settings
- Set up the daemon service (systemd/launchd/Task Scheduler)

### Basic Usage

Start the daemon with Web UI:

```bash
bun daemon/main.ts --enable-web-ui
```

Access the Web UI at http://localhost:3001 to view your session history.

For detailed guides, see [Documentation](docs/README.md).
```

**Step 4: Verify README.md renders correctly**

Run: `head -50 README.md`
Expected: Quick Start section appears after Project Overview

**Step 5: Delete QUICK-START.md**

Run: `rm QUICK-START.md`
Expected: File removed

**Step 6: Commit the merge**

```bash
git add README.md QUICK-START.md
git commit -m "docs: merge QUICK-START.md into README.md

Consolidate quick start content into main README for single entry point.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 2: Consolidate Architecture Documentation

**Files:**
- Read: `docs/architecture/DAEMON-IMPLEMENTATION.md`, `docs/architecture/AGENTS.md`, `docs/architecture/claude-daemon-integration-architecture.md`
- Modify: `docs/architecture/OVERVIEW.md`
- Delete: 4 architecture files (keep OVERVIEW.md only)

**Step 1: Read existing OVERVIEW.md**

Run: `cat docs/architecture/OVERVIEW.md`
Expected: Current architecture overview content

**Step 2: Read files to consolidate**

Run:
```bash
cat docs/architecture/DAEMON-IMPLEMENTATION.md
cat docs/architecture/AGENTS.md
cat docs/architecture/claude-daemon-integration-architecture.md
```

Expected: Technical details about daemon, agents, and integration patterns

**Step 3: Extract key concepts from each file**

From DAEMON-IMPLEMENTATION.md:
- Event queue processing model
- Storage layer design
- Scheduled tasks architecture

From AGENTS.md:
- Agent communication patterns
- Agent registry design
- Message passing protocol

From claude-daemon-integration-architecture.md:
- Hook → Daemon → Storage flow
- IPC mechanism (Unix socket/TCP)
- Fallback behavior

**Step 4: Rewrite OVERVIEW.md with consolidated content**

Target: Under 1000 words, covering:
- System architecture (Hook → Socket → Daemon → Storage)
- Core components (HookServer, EventQueue, SessionAnalyzer, StorageService)
- Data flow and processing model
- Agent system fundamentals (if applicable)
- Integration patterns
- Platform differences (Unix socket vs TCP)

**Step 5: Verify OVERVIEW.md is comprehensive**

Run: `wc -w docs/architecture/OVERVIEW.md`
Expected: Word count under 1000

**Step 6: Delete redundant architecture files**

Run:
```bash
rm docs/architecture/DAEMON-IMPLEMENTATION.md
rm docs/architecture/AGENTS.md
rm docs/architecture/claude-daemon-integration-architecture.md
rm "docs/architecture/基于 claude-daemon 的多 Agent 协作架构.md"
```

Expected: 4 files removed, only OVERVIEW.md remains

**Step 7: Commit architecture consolidation**

```bash
git add docs/architecture/
git commit -m "docs: consolidate architecture documentation into OVERVIEW.md

Merge DAEMON-IMPLEMENTATION, AGENTS, and integration docs into single comprehensive overview under 1000 words.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 3: Delete Testing Reports

**Files:**
- Delete: All 14 files in `docs/testing-reports/`

**Step 1: List testing report files**

Run: `ls -1 docs/testing-reports/`
Expected: List of 14+ markdown files

**Step 2: Delete testing reports directory**

Run: `rm -rf docs/testing-reports/`
Expected: Directory removed

**Step 3: Commit deletion**

```bash
git add docs/testing-reports/
git commit -m "docs: remove testing reports

Remove process documentation - testing reports are historical records not needed for current users.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 4: Delete Release Documentation

**Files:**
- Delete: All 4 files in `docs/release/`

**Step 1: List release documentation files**

Run: `ls -1 docs/release/`
Expected: NPM-PUBLISH.md, RELEASE-SUCCESS.md, PUBLISH-VERSION.md, PLUGIN-INSTALL-PLAN.md

**Step 2: Delete release directory**

Run: `rm -rf docs/release/`
Expected: Directory removed

**Step 3: Commit deletion**

```bash
git add docs/release/
git commit -m "docs: remove release process documentation

Remove internal process documentation not needed by users.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 5: Delete Legacy Documentation

**Files:**
- Delete: All 4 files in `docs/legacy/`

**Step 1: List legacy documentation files**

Run: `ls -1 docs/legacy/`
Expected: WHAT-IS-BUN.md, WINDOWS-INSTALL.md, WINDOWS.md, WINDOWS-ISSUES.md, WINDOWS-QUICKSTART.md

**Step 2: Delete legacy directory**

Run: `rm -rf docs/legacy/`
Expected: Directory removed

**Step 3: Commit deletion**

```bash
git add docs/legacy/
git commit -m "docs: remove legacy documentation

Remove outdated Windows-specific documentation superseded by current install scripts.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 6: Delete Feature Documentation

**Files:**
- Delete: All 3 files in `docs/features/`

**Step 1: List feature documentation files**

Run: `ls -1 docs/features/`
Expected: IMPROVEMENTS.md, WEB-UI-SUMMARY.md, HOSTNAME-FEATURE.md

**Step 2: Delete features directory**

Run: `rm -rf docs/features/`
Expected: Directory removed

**Step 3: Commit deletion**

```bash
git add docs/features/
git commit -m "docs: remove feature documentation

Remove process documentation - feature descriptions not needed in final docs.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 7: Delete Redundant Guides

**Files:**
- Delete: `docs/guides/QUICKSTART.md`, `docs/guides/SYNC-GUIDE.md`, `docs/guides/PUSH-GUIDE.md`
- Keep: `docs/guides/DAEMON-GUIDE.md`, `docs/guides/WEB-UI-GUIDE.md`

**Step 1: List guide files**

Run: `ls -1 docs/guides/`
Expected: 5 markdown files

**Step 2: Delete redundant guides**

Run:
```bash
rm docs/guides/QUICKSTART.md
rm docs/guides/SYNC-GUIDE.md
rm docs/guides/PUSH-GUIDE.md
```

Expected: 3 files removed, 2 remain

**Step 3: Verify remaining guides**

Run: `ls -1 docs/guides/`
Expected: Only DAEMON-GUIDE.md and WEB-UI-GUIDE.md

**Step 4: Commit deletion**

```bash
git add docs/guides/
git commit -m "docs: remove redundant guides

Keep only DAEMON-GUIDE and WEB-UI-GUIDE, remove duplicative content.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 8: Delete Miscellaneous Documentation

**Files:**
- Delete: `docs/AGENT-MESSAGING.md`, `docs/E2E-TEST-PLAN.md`, `docs/AGENT-REGISTRY.md`, `docs/demos/`

**Step 1: List docs directory**

Run: `ls -1 docs/`
Expected: Various files and directories

**Step 2: Delete miscellaneous files**

Run:
```bash
rm -f docs/AGENT-MESSAGING.md
rm -f docs/E2E-TEST-PLAN.md
rm -f docs/AGENT-REGISTRY.md
rm -rf docs/demos/
```

Expected: Files and directory removed

**Step 3: Commit deletion**

```bash
git add docs/
git commit -m "docs: remove miscellaneous process documentation

Remove agent messaging, test plans, and demo docs not needed by users.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 9: Rewrite Documentation Index

**Files:**
- Modify: `docs/README.md`

**Step 1: Read current docs/README.md**

Run: `cat docs/README.md`
Expected: Current documentation index content

**Step 2: Rewrite as simple index**

Replace entire content with:

```markdown
# Documentation

This directory contains technical documentation for Claude Daemon.

## Architecture

- [System Overview](architecture/OVERVIEW.md) - Architecture, components, data flow, and design decisions

## Guides

- [Daemon Guide](guides/DAEMON-GUIDE.md) - How to run and manage the daemon service
- [Web UI Guide](guides/WEB-UI-GUIDE.md) - How to use the web interface

## Additional Resources

- [Main README](../README.md) - Project overview and quick start
- [CLAUDE.md](../CLAUDE.md) - Instructions for AI assistants working with this codebase
- [Contributing Guidelines](../CONTRIBUTING.md) - How to contribute to the project
```

**Step 3: Verify docs/README.md**

Run: `cat docs/README.md`
Expected: Simple index with 3 links to remaining docs

**Step 4: Commit index update**

```bash
git add docs/README.md
git commit -m "docs: rewrite documentation index

Simplify docs/README.md as navigation index for remaining documentation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 10: Verify No Broken Links

**Files:**
- Check: All remaining markdown files for broken links

**Step 1: List all remaining markdown files**

Run: `find . -name "*.md" -type f | grep -v node_modules | grep -v .worktrees`
Expected: 9 markdown files

**Step 2: Search for links to deleted files**

Run:
```bash
grep -r "testing-reports" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "release/" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "legacy/" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "features/" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "QUICKSTART.md" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "SYNC-GUIDE" *.md docs/**/*.md 2>/dev/null || echo "No matches"
grep -r "PUSH-GUIDE" *.md docs/**/*.md 2>/dev/null || echo "No matches"
```

Expected: "No matches" for all searches, or specific files with broken links

**Step 3: Fix any broken links found**

If broken links found:
- Update links to point to remaining docs
- Remove links to deleted content
- Add explanatory text if needed

**Step 4: Verify CLAUDE.md doesn't reference deleted files**

Run: `grep -E "(testing-reports|release/|legacy/|features/)" CLAUDE.md`
Expected: No matches (CLAUDE.md doesn't reference deleted docs)

**Step 5: Commit link fixes (if any)**

```bash
git add .
git commit -m "docs: fix broken links after documentation cleanup

Update cross-references to point to remaining documentation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created if changes made

---

## Task 11: Remove Empty Directories

**Files:**
- Check and remove any empty directories in docs/

**Step 1: Find empty directories**

Run: `find docs -type d -empty`
Expected: List of empty directories (if any)

**Step 2: Remove empty directories**

Run: `find docs -type d -empty -delete`
Expected: Empty directories removed

**Step 3: Verify directory structure**

Run: `tree docs/ -L 2` or `find docs -type d`
Expected: Only docs/, docs/architecture/, docs/guides/, docs/plans/

**Step 4: Commit cleanup (if changes made)**

```bash
git add docs/
git commit -m "docs: remove empty directories

Clean up directory structure after documentation streamlining.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created if directories removed

---

## Task 12: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Read current CHANGELOG.md**

Run: `head -30 CHANGELOG.md`
Expected: Recent version entries

**Step 2: Add entry for documentation streamlining**

Add at the top of the changelog (after the header):

```markdown
## [Unreleased]

### Changed
- Streamlined documentation from 55+ files to 9 essential files
- Merged QUICK-START.md into README.md for single entry point
- Consolidated architecture documentation into single OVERVIEW.md
- Removed process documentation (testing reports, release docs, legacy docs)
- Simplified docs/README.md as navigation index
```

**Step 3: Verify CHANGELOG.md**

Run: `head -40 CHANGELOG.md`
Expected: New entry appears at top

**Step 4: Commit CHANGELOG update**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for documentation streamlining

Document the reduction from 55+ files to 9 essential documentation files.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Task 13: Final Verification

**Files:**
- Verify: All remaining documentation files

**Step 1: Count remaining markdown files**

Run: `find . -name "*.md" -type f | grep -v node_modules | grep -v .worktrees | wc -l`
Expected: 9 files

**Step 2: List final documentation structure**

Run:
```bash
echo "Root level:"
ls -1 *.md
echo -e "\nDocs structure:"
find docs -name "*.md" -type f | sort
```

Expected:
```
Root level:
CHANGELOG.md
CLAUDE.md
CODE_OF_CONDUCT.md
CONTRIBUTING.md
README.md

Docs structure:
docs/README.md
docs/architecture/OVERVIEW.md
docs/guides/DAEMON-GUIDE.md
docs/guides/WEB-UI-GUIDE.md
docs/plans/2026-02-01-documentation-streamlining-design.md
docs/plans/2026-02-01-streamline-documentation.md
```

**Step 3: Verify git status is clean**

Run: `git status`
Expected: "nothing to commit, working tree clean"

**Step 4: Review commit history**

Run: `git log --oneline -15`
Expected: 10-12 commits for documentation streamlining

**Step 5: Create summary report**

Create file: `docs/plans/2026-02-01-streamlining-complete.md`

```markdown
# Documentation Streamlining Complete

**Date:** 2026-02-01

## Summary

Successfully reduced project documentation from 55+ files to 9 essential files.

## Files Kept (9 total)

**Root level (5):**
- README.md (enhanced with quick-start)
- CLAUDE.md
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- CHANGELOG.md

**Technical docs (4):**
- docs/README.md (navigation index)
- docs/architecture/OVERVIEW.md (consolidated)
- docs/guides/DAEMON-GUIDE.md
- docs/guides/WEB-UI-GUIDE.md

## Files Removed (~45 files)

- docs/testing-reports/ (14 files)
- docs/release/ (4 files)
- docs/legacy/ (4 files)
- docs/features/ (3 files)
- Redundant architecture docs (4 files)
- Redundant guides (3 files)
- Miscellaneous process docs (5+ files)
- QUICK-START.md (merged into README.md)

## Commits

Total commits: [count from git log]

All deleted content preserved in git history.

## Verification

- ✓ No broken links in remaining documentation
- ✓ CLAUDE.md doesn't reference deleted files
- ✓ Empty directories removed
- ✓ CHANGELOG.md updated
- ✓ Final file count: 9 markdown files
```

**Step 6: Commit completion report**

```bash
git add docs/plans/2026-02-01-streamlining-complete.md
git commit -m "docs: add documentation streamlining completion report

Summary of changes: 55+ files reduced to 9 essential files.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Validation Checklist

After completing all tasks, verify:

- [ ] README.md includes quick-start section
- [ ] docs/architecture/OVERVIEW.md is under 1000 words
- [ ] No broken links in remaining documentation
- [ ] CLAUDE.md doesn't reference deleted files
- [ ] Empty directories removed
- [ ] CHANGELOG.md updated
- [ ] Final count: 9 markdown files (excluding plans/)
- [ ] All changes committed to git
- [ ] Git history preserves deleted content

## Next Steps

After plan execution:
1. Review all commits in the worktree
2. Test that documentation renders correctly
3. Use @superpowers:finishing-a-development-branch to merge or create PR
