# Research: Git Graph Visualization (Redesign)

**Feature**: 002-git-graph
**Date**: 2026-02-08
**Status**: Phase 0 Complete (Updated for Redesign)
**Reference**: [vscode-git-graph](https://github.com/mhutchie/vscode-git-graph) — UI/UX design reference

## Overview

This document captures research decisions for the Git Graph Visualization feature redesign. The original implementation covered core viewing (P0) and basic operations. The redesign expands to full vscode-git-graph parity with 13 user stories and 86 functional requirements.

## Research Topics

### 1. Graph Rendering Approach

**Decision**: SVG-based rendering in a dedicated table column, with Bezier curves (rounded style) and straight lines (angular style) as configurable options.

**Rationale**:
- The spec explicitly requires "SVG graph column" and "SVG branch lines"
- SVG paths integrate naturally with the HTML table layout (graph column contains inline SVG)
- SVG `<path>` elements support both Bezier curves (C/Q commands) and straight lines (L commands)
- SVG scales cleanly on High DPI / Retina without manual `devicePixelRatio` handling (FR-012)
- SVG elements can have DOM event handlers for tooltips (FR-005 hover requirement)
- Each row's SVG is lightweight (~3-5 path elements per row)

**Migration from Canvas**:
- Current implementation uses Canvas 2D — needs migration to SVG
- Canvas approach was simpler for initial prototype but lacks per-element interactivity
- SVG path data can be pre-computed by the layout algorithm and rendered per-row
- Virtual scrolling still applies — only visible rows render their SVG segments

**Alternatives Considered**:
- Canvas 2D (current): Lacks per-element interactivity for tooltips, harder to integrate with table rows
- Third-party libraries (d3, cytoscape): Additional dependencies, violates simplicity principle

### 2. Lane-Based Layout Algorithm

**Decision**: Mainline-first lane algorithm with lane recycling. HEAD's first-parent chain always occupies lane 0.

**Rationale** (unchanged from original):
- Mainline (first-parent chain) is most important and should be leftmost
- Side branches assigned to available lanes starting from lane 1
- Lane reuse when branches end keeps the graph compact
- Deterministic 12-color palette via string hashing ensures consistent colors (FR-003)
- Max lanes configurable, with overflow lanes stacking

**New Requirements**:
- Stash entries get their own visual indicator (nested circle, FR-005/FR-045)
- Uncommitted changes row uses open circle indicator (FR-010)
- Merge commits use curved merge lines (FR-002)
- Must support muting non-ancestral commits (FR-011)

### 3. Table-Based Layout (NEW)

**Decision**: HTML `<table>` or CSS Grid with columns: Graph | Description | Date | Author | Commit Hash. Column headers with drag-resize handles.

**Rationale**:
- vscode-git-graph uses an HTML table — matching the reference design
- CSS Grid provides flexible column sizing with `grid-template-columns`
- Resize handles use `mousedown` → `mousemove` → `mouseup` pattern on column borders (FR-072)
- Column visibility toggling hides columns via `display: none` or grid-template adjustment (FR-071)
- Reference label alignment options (Normal, Aligned to Graph, On Right) controlled by CSS positioning (FR-073)

**Implementation**:
- Use CSS Grid (not `<table>`) for precise control over column widths and virtual scrolling
- Column definitions stored in Pinia state, persisted to localStorage
- Resize state: `{ graphWidth, descWidth, dateWidth, authorWidth, commitWidth }`

### 4. Git Data Retrieval Strategy

**Decision**: Server-side git CLI execution with `child_process.execFileSync` (injection-safe) for all operations. Three variants: `execGit`, `execGitArgs`, `execGitCommand` (async).

**Rationale** (unchanged):
- Leverages system git installation
- `execFileSync` prevents shell injection for user-provided arguments
- 10MB buffer handles large repositories
- Server-side execution keeps git credentials secure

**New Operations Required**:
- Branch: rename (`git branch -m`), merge (`git merge`), rebase (`git rebase`), push (`git push`), pull (`git pull`), fetch (`git fetch`)
- Commit: cherry-pick (`git cherry-pick`), revert (`git revert`), reset (`git reset`)
- Tag: create (`git tag`), delete (`git tag -d`), push (`git push origin`)
- Stash: list (`git stash list`), apply (`git stash apply`), pop (`git stash pop`), drop (`git stash drop`), create (`git stash push`), branch (`git stash branch`)
- Remote: list (`git remote -v`), add (`git remote add`), edit (`git remote set-url`), remove (`git remote remove`), fetch (`git fetch --all`)

### 5. Auto-Refresh Strategy

**Decision**: 10-second polling via lightweight `/api/git/state` endpoint. Full refresh only on state change. Deferred during active interaction.

**Rationale** (unchanged):
- Simple polling avoids WebSocket complexity
- State comparison (headCommit, branchListHash, uncommittedFileCount) detects all changes
- Interaction deferral (scrolling, context menu open, dialog open) prevents jarring updates (FR-065)

**New Requirements**:
- "Last updated" indicator with relative time (FR-069)
- Skip UI redraw when no changes detected (FR-066) — already implemented

### 6. Commit Detail Loading

**Decision**: Lazy-load file changes when commit selected. Two-step: show cached metadata immediately, fetch file changes async.

**Rationale** (unchanged):
- File change data requires expensive `git diff-tree`
- Immediate display of cached metadata provides responsive feel

**New Requirements**:
- File Tree view with compact folders AND File List view toggle (FR-014)
- File rename display: oldPath → newPath (FR-016)
- Commit statistics: files changed, insertions, deletions (FR-017)
- Parent/child navigation with keyboard (FR-018, FR-019)
- Inline vs docked-to-bottom positioning (FR-020)

### 7. Search and Filter Architecture

**Decision**: Client-side filtering on loaded commits with LRU cache (max 10 entries). Server-side `--grep` available for full-repo search.

**Rationale** (unchanged):
- Loaded commits already in memory
- 300ms debounce prevents excessive filtering (FR-061)
- Cache keyed on query+commitCount

**New Requirements**:
- Search across: commit message, date, author, hash, branch name, tag name (FR-058)
- Highlight matching commits and navigate between results (FR-059)
- Branch filter: multi-select dropdown with glob patterns, per-remote grouping, select-all/deselect-all (FR-060)
- Cache max 10 entries (FR-062)

### 8. Staging and Commit Workflow

**Decision**: Full staging workflow via API with individual file operations.

**Rationale** (unchanged):
- Stage → Commit matches standard git workflow
- Individual file staging for fine-grained control

**New Requirements**:
- Staged and unstaged files in separate sections (FR-052)
- Stage-all and unstage-all (FR-054)
- Ctrl/Cmd+Enter shortcut (FR-055)
- File rename detection (FR-056)
- Context menu on uncommitted row: Stash, Reset, Clean (FR-057)

### 9. Context Menu Architecture (NEW)

**Decision**: Reusable context menu component with action dispatching. Each entity type (branch, commit, tag, stash, uncommitted) has its own menu definition.

**Rationale**:
- vscode-git-graph uses context menus extensively — 7+ menu types
- Shared context menu component reduces duplication
- Action handlers dispatch to store/composable methods
- Confirmation dialogs for destructive operations (delete, reset, force push)

**Menu Types**:
1. Local branch menu: Checkout, Rename, Delete, Merge, Rebase, Push, Copy Name (FR-023–FR-032)
2. Remote branch menu: Checkout (track), Delete Remote, Fetch, Pull, Copy Name (FR-023–FR-032)
3. Commit menu: Tag, Branch, Checkout, Cherry Pick, Revert, Merge, Reset, Copy Hash, Copy Subject (FR-033–FR-039)
4. Tag menu: View Details, Delete, Push, Copy Name (FR-040–FR-044)
5. Stash menu: Apply, Pop, Drop, Create Branch, Copy Name, Copy Hash (FR-045–FR-051)
6. Uncommitted changes menu: Stash, Reset, Clean (FR-057)

### 10. Dialog System (NEW)

**Decision**: Modal dialog component for operations requiring user input or confirmation. Each operation has its own dialog variant.

**Rationale**:
- Many git operations need options (merge: no-commit, no-ff, squash; reset: soft/mixed/hard)
- Confirmation required for destructive operations (delete, force push, hard reset)
- Shared dialog component with configurable fields, checkboxes, and action buttons

**Dialogs Needed**:
1. Merge dialog: no-commit, no-fast-forward, squash checkboxes (FR-026)
2. Delete branch dialog: force-delete checkbox (FR-025)
3. Push dialog: target remote selector, force-push / force-with-lease options (FR-028)
4. Cherry-pick dialog: record origin (-x), no-commit checkboxes (FR-034)
5. Reset dialog: Soft/Mixed/Hard radio buttons (FR-037)
6. Tag creation dialog: name, message (annotated), push-to-remote checkbox (FR-040)
7. Tag delete dialog: also-delete-from-remote checkbox (FR-041)
8. Stash dialog: include-untracked checkbox (FR-050)
9. Commit dialog: message textarea (FR-055)

### 11. Keyboard Shortcut System (NEW)

**Decision**: Global keyboard event listener with action mapping. Modifiers (Ctrl/Cmd) detected cross-platform.

**Implementation**:
- `useKeyboardShortcuts` composable with `onMounted`/`onUnmounted` lifecycle
- Platform detection for Ctrl vs Cmd
- Action map: `{ 'ctrl+h': scrollToHead, 'ctrl+s': scrollToStash, ... }`
- Keep browser-native `ctrl/cmd+f` and `ctrl/cmd+r` unbound in app-level shortcuts
- Escape closes dialogs → context menus → detail views (priority order) (FR-081)
- Enter submits active dialog (FR-082)

**Shortcuts** (FR-077 to FR-082):
- Toolbar Find button: Open Find Widget; do not override Ctrl/Cmd+F
- Ctrl/Cmd+H: Scroll to HEAD commit
- Toolbar Refresh button: Refresh the graph; do not override Ctrl/Cmd+R
- Ctrl/Cmd+S: Scroll to first/next stash
- Escape: Close (cascading priority)
- Enter: Submit dialog
- Up/Down arrows: Navigate commits (FR-018)
- Ctrl/Cmd+Up/Down: Navigate parent/child on same branch (FR-019)

### 12. Commit Message Rendering (NEW)

**Decision**: Client-side rendering of URLs, emoji shortcodes, and basic Markdown in commit messages.

**Rationale**:
- FR-083: HTTP/HTTPS URLs → clickable links (regex replacement)
- FR-084: Gitmoji shortcodes (`:bug:` → 🐛) — use a static emoji map (~100 entries)
- FR-085: Markdown bold/italic/code — use `marked` (already a dependency) with sanitization via `dompurify` (already a dependency)

**Implementation**:
- `renderCommitMessage(text: string): string` utility function
- Pipeline: URL linkify → emoji replace → markdown render → DOMPurify sanitize
- Applied in commit detail view and optionally in commit row tooltips

## Summary

The redesign significantly expands the feature scope from basic viewing to full vscode-git-graph parity. Key architectural additions:
1. **SVG graph rendering** (replacing Canvas) for table integration and interactivity
2. **Table-based layout** with resizable columns
3. **Context menu system** for 6 entity types
4. **Dialog system** for 9+ operation types
5. **25+ new server API endpoints** for branch/commit/tag/stash/remote operations
6. **Keyboard shortcut system** with non-overriding app shortcuts and native browser find/refresh preserved
7. **Commit message rendering** with URLs, emoji, Markdown

All decisions align with constitution constraints (Nuxt 3, Vue 3, Pinia, Tailwind, no external git libraries).
