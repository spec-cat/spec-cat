# Feature Specification: Git Graph Visualization

**Feature Branch**: `002-git-graph`
**Created**: 2026-02-01
**Updated**: 2026-02-08
**Status**: In Progress (Redesign)
**Input**: Full-featured git graph visualization with professional version control interface

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Commit History Graph (Priority: P0)

As a developer, I want to see my git repository's commit history as a visual graph so I can understand how branches evolved and when they were merged.

**Why this priority**: This is the foundational feature. Without the graph visualization, nothing else works.

**Independent Test**: Open the graph view and verify commits are displayed in a table with an SVG graph column showing branch lines.

**Acceptance Scenarios**:

1. **Given** a git repository, **When** I open the git graph view, **Then** I see a table with columns: Graph | Description | Date | Author | Commit, where the Graph column shows SVG branch lines and commit nodes
2. **Given** commits on different branches, **When** I view the graph, **Then** each branch has a distinct color from a deterministic 12-color palette
3. **Given** merge commits exist, **When** I view the graph, **Then** merge connections are visually distinct (curved lines merging lanes)
4. **Given** the repository has 1000+ commits, **When** I open the graph, **Then** initial load shows 300 commits, and more load automatically on scroll (100 at a time)
5. **Given** a commit node in the graph, **When** I hover over it, **Then** I see a tooltip showing which branches/tags include this commit

---

### User Story 2 - Explore Commit Details (Priority: P0)

As a developer, I want to click on commits to see detailed information and file changes so I can review what happened at each commit.

**Why this priority**: Viewing details is the primary interaction after seeing the graph.

**Independent Test**: Click any commit and verify the detail panel shows full commit info with file tree/list.

**Acceptance Scenarios**:

1. **Given** a commit in the graph, **When** I click on it, **Then** the Commit Details View opens showing: full hash, author (name + email), date, full commit message, parent commit hashes
2. **Given** a selected commit, **When** I view file changes, **Then** I can toggle between File Tree view (with compact folders) and File List view
3. **Given** file changes displayed, **When** I look at each file, **Then** I see its status indicator (A/M/D/R/C) with color coding
4. **Given** the details view is open, **When** I press Up/Down arrow keys, **Then** I navigate to the previous/next commit in the list
5. **Given** two commits, **When** I Ctrl/Cmd+click the second commit, **Then** I see a comparison between the two commits showing all file differences

---

### User Story 3 - Branch Operations (Priority: P1)

As a developer, I want to perform common branch operations directly from the graph so I don't need to switch to a terminal.

**Why this priority**: Branch operations are the most frequent git actions developers perform daily.

**Independent Test**: Right-click a branch label and verify all branch operations work correctly.

**Acceptance Scenarios**:

1. **Given** a local branch label, **When** I right-click it, **Then** I see a context menu with: Checkout, Rename, Delete, Merge into current, Rebase current onto, Push, Copy Branch Name
2. **Given** a remote branch label, **When** I right-click it, **Then** I see: Checkout (creates local tracking branch), Delete Remote Branch, Fetch into Local, Pull into current, Copy Branch Name
3. **Given** I select "Merge into current", **When** the dialog opens, **Then** I see options for: No Commit, No Fast-Forward, Squash
4. **Given** I select "Delete Branch", **When** the dialog opens, **Then** I see a force-delete checkbox option
5. **Given** I select "Push", **When** the dialog opens, **Then** I see options for: target remote, Force Push, Force Push with Lease

---

### User Story 4 - Commit Operations (Priority: P1)

As a developer, I want to perform git operations on individual commits from the graph so I can cherry-pick, revert, or reset efficiently.

**Why this priority**: Commit-level operations are essential for daily git workflow.

**Independent Test**: Right-click a commit and verify all commit operations work.

**Acceptance Scenarios**:

1. **Given** a commit, **When** I right-click it, **Then** I see: Add Tag, Create Branch, Checkout, Cherry Pick, Revert, Merge into current, Reset current branch to this Commit, Copy Commit Hash, Copy Commit Subject
2. **Given** I select "Cherry Pick", **When** the dialog opens, **Then** I see options: Record Origin (-x), No Commit (--no-commit)
3. **Given** I select "Reset current branch", **When** the dialog opens, **Then** I see mode options: Soft, Mixed, Hard
4. **Given** I select "Add Tag", **When** the dialog opens, **Then** I can choose Annotated or Lightweight, enter tag name/message, and optionally push to remote
5. **Given** I select "Copy Commit Hash", **When** I click it, **Then** the full commit hash is copied to clipboard with visual feedback

---

### User Story 5 - Tag Operations (Priority: P1)

As a developer, I want to manage tags from the graph so I can create releases and mark important commits.

**Why this priority**: Tags are critical for release management and version tracking.

**Independent Test**: Right-click a tag and verify tag operations work. Create/delete tags from the graph.

**Acceptance Scenarios**:

1. **Given** a tagged commit, **When** I see the tag label, **Then** it displays as a distinct badge (different style from branch labels)
2. **Given** a tag label, **When** I right-click it, **Then** I see: View Details (for annotated tags), Delete Tag, Push Tag, Copy Tag Name
3. **Given** I select "Delete Tag", **When** the dialog opens, **Then** I can choose to also delete from remote
4. **Given** an annotated tag, **When** I select "View Details", **Then** I see: tagger name, email, date, and tag message

---

### User Story 6 - Uncommitted Changes & Staging (Priority: P1)

As a developer, I want to see and manage uncommitted changes directly from the graph view so I can stage, unstage, and commit without switching context.

**Why this priority**: Working directory management is a core daily workflow task.

**Independent Test**: Make file changes, verify they appear in the graph, stage/unstage files, create a commit.

**Acceptance Scenarios**:

1. **Given** uncommitted changes exist, **When** I view the graph, **Then** I see an "Uncommitted Changes" row at the top with a visual indicator (open circle on graph)
2. **Given** I click the uncommitted changes row, **When** the detail panel opens, **Then** I see staged and unstaged files separated into sections
3. **Given** unstaged files, **When** I click the stage button on a file, **Then** it moves to the staged section
4. **Given** staged files, **When** I enter a commit message and press Ctrl/Cmd+Enter, **Then** a new commit is created and the graph refreshes
5. **Given** uncommitted changes, **When** I right-click the uncommitted changes row, **Then** I see: Stash Uncommitted Changes (with include-untracked option), Reset (Mixed/Hard), Clean Untracked

---

### User Story 7 - Stash Operations (Priority: P2)

As a developer, I want to manage stashes from the graph so I can save and restore work in progress.

**Why this priority**: Stash management is important but less frequent than branch/commit operations.

**Independent Test**: Create a stash, verify it appears in the graph, apply/pop/drop it.

**Acceptance Scenarios**:

1. **Given** stashes exist, **When** I view the graph, **Then** stash entries are displayed with a distinct visual indicator (nested circle)
2. **Given** a stash entry, **When** I right-click it, **Then** I see: Apply (with reinstate-index option), Create Branch from Stash, Pop (with reinstate-index option), Drop, Copy Stash Name, Copy Stash Hash
3. **Given** I select "Apply", **When** the dialog opens, **Then** I see an option to reinstate the index state
4. **Given** the graph is open, **When** I press Ctrl/Cmd+S, **Then** the view scrolls to the first/next stash

---

### User Story 8 - Search and Filter (Priority: P2)

As a developer, I want to search through commit history and filter by branches so I can quickly find specific changes.

**Why this priority**: Search and filtering enhance productivity for navigating large repositories.

**Independent Test**: Search for a commit message, verify matching commits are highlighted. Filter by branch, verify only relevant commits shown.

**Acceptance Scenarios**:

1. **Given** I press Ctrl/Cmd+F, **When** the Find Widget opens, **Then** I can search across: commit message, date, author, hash, branch name, tag name
2. **Given** search results exist, **When** I view the graph, **Then** matching commits are highlighted and I can navigate between results with arrow buttons
3. **Given** multiple branches, **When** I use the branch dropdown filter, **Then** I can select specific branches, use glob patterns (e.g., `feature/*`), or show all
4. **Given** I type a search, **When** 300ms passes without further typing, **Then** the search executes (debounced)
5. **Given** a branch dropdown, **When** I view the options, **Then** branches are grouped by: local, remote (per-remote), with select all / deselect all per group

---

### User Story 9 - Real-time Updates (Priority: P2)

As a developer, I want the graph to automatically update when the repository state changes so I always see current information.

**Why this priority**: Auto-refresh prevents stale views but isn't critical for core operations.

**Independent Test**: Make commits externally, verify graph updates within ~1 second without losing scroll position.

**Acceptance Scenarios**:

1. **Given** the graph is open, **When** the repository state changes (new commits, branch updates), **Then** the graph refreshes automatically within ~1 second
2. **Given** auto-refresh triggers, **When** the graph updates, **Then** my current selection, scroll position, and open details panel are preserved
3. **Given** I'm actively scrolling or a context menu is open, **When** auto-refresh would trigger, **Then** it defers until interaction ends
4. **Given** no changes detected, **When** the polling interval fires, **Then** no UI redraw occurs (lightweight state check only)
5. **Given** the auto-refresh mechanism loses connection, **When** the disconnection is detected, **Then** it automatically recovers and continues updating the graph

---

### User Story 10 - Commit Comparison (Priority: P2)

As a developer, I want to compare two commits side by side so I can understand what changed between any two points in history.

**Why this priority**: Comparison is essential for code review and understanding changes across commits.

**Independent Test**: Ctrl+click two commits, verify comparison shows all changed files between them.

**Acceptance Scenarios**:

1. **Given** a selected commit, **When** I Ctrl/Cmd+click another commit, **Then** I see all files changed between the two commits
2. **Given** a comparison view, **When** I view file changes, **Then** each file shows its change status and I can view the diff
3. **Given** uncommitted changes row, **When** I Ctrl/Cmd+click a commit, **Then** I see differences between working directory and that commit

---

### User Story 11 - Remote Management (Priority: P3)

As a developer, I want to manage remotes from the graph view so I can fetch, add, and configure remote repositories.

**Why this priority**: Remote management is less frequent but useful for multi-remote workflows.

**Independent Test**: Open settings, verify remote list is shown. Add/edit/delete a remote. Fetch from a remote.

**Acceptance Scenarios**:

1. **Given** the graph toolbar, **When** I click the Fetch button, **Then** it fetches from all remotes (with prune option)
2. **Given** the settings panel, **When** I view remotes, **Then** I see all configured remotes with their URLs
3. **Given** the settings panel, **When** I manage remotes, **Then** I can add new, edit URL, or delete existing remotes

---

### User Story 12 - Column Customization (Priority: P3)

As a developer, I want to customize the table columns so I can see the information most relevant to me.

**Why this priority**: Customization improves daily usability but the defaults work for most users.

**Independent Test**: Hide/show columns, resize columns, verify settings persist.

**Acceptance Scenarios**:

1. **Given** the table header, **When** I drag a column border, **Then** the column resizes
2. **Given** the toolbar, **When** I toggle column visibility, **Then** Date, Author, and Commit columns can be independently shown/hidden
3. **Given** the commit row, **When** reference labels are displayed, **Then** their alignment is configurable (Normal, Branches aligned to Graph, Branches on right)

---

### User Story 13 - Graph Style Options (Priority: P3)

As a developer, I want to customize the graph rendering style so it matches my visual preferences.

**Why this priority**: Aesthetic customization is nice-to-have.

**Independent Test**: Switch between rounded and angular graph styles, verify rendering changes.

**Acceptance Scenarios**:

1. **Given** graph settings, **When** I select "Rounded" style, **Then** branch transitions use smooth Bezier curves
2. **Given** graph settings, **When** I select "Angular" style, **Then** branch transitions use straight line segments
3. **Given** graph settings, **When** I customize branch colors, **Then** the graph updates with the new color palette

---

### User Story 14 - File Diff Viewer (Priority: P0)

As a developer, I want to click on a file in the commit detail's file list to see a full diff view so I can review exactly what changed in each file, line by line.

**Why this priority**: Viewing file diffs is a core interaction that completes the commit exploration workflow (graph → commit → file list → diff). Without this, the file list is informational but not actionable.

**Independent Test**: Click a commit, click a file in the file list, verify a unified diff view opens covering the right panels (Features, Conversations, Chat) while keeping the Git Graph panel visible.

**Acceptance Scenarios**:

1. **Given** a selected commit with file changes displayed, **When** I click on a file in the file list (flat or tree view), **Then** a diff viewer opens showing the unified diff for that file
2. **Given** the diff viewer is open, **When** I look at the layout, **Then** the diff viewer overlays the right area of the screen (covering Features, Conversations, and Chat panels) while the Git Graph panel remains fully visible and interactive on the left
3. **Given** the diff viewer is open, **When** I view the diff content, **Then** I see a unified diff with line numbers for both old and new versions, added lines highlighted in green, removed lines highlighted in red, and unchanged context lines
4. **Given** the diff viewer is open, **When** I look at the header, **Then** I see the file path, change status badge (A/M/D/R), and the commit short hash for context
5. **Given** the diff viewer is open, **When** I click the close button or press Escape, **Then** the diff viewer closes and the normal panel layout (Features, Conversations, Chat) is restored
6. **Given** the diff viewer is open, **When** I click a different file in the commit detail's file list (still visible in the Git Graph panel), **Then** the diff viewer updates to show the diff for the newly selected file
7. **Given** a binary file in the file list, **When** I click on it, **Then** the diff viewer shows a "Binary file" indicator instead of attempting to render diff content
8. **Given** a file with status "A" (added), **When** I view its diff, **Then** all lines are shown as additions (green) with no old-side content
9. **Given** a file with status "D" (deleted), **When** I view its diff, **Then** all lines are shown as deletions (red) with no new-side content
10. **Given** a file with status "R" (renamed), **When** I view its diff, **Then** the header shows oldPath → newPath and the diff shows any content changes

---

### Edge Cases

- **1000+ commits**: Virtual scrolling + progressive loading (300 initial, 100 incremental)
- **Corrupted git repo**: Error message with details, graceful degradation
- **Permission errors**: Git command error propagation with user-friendly messages
- **Merge conflicts during operations**: Display conflict state, provide resolution guidance
- **Detached HEAD state**: Display clearly in graph, allow branch creation from detached HEAD
- **Empty repository**: Show "No commits yet" with guidance
- **Large file lists in commit**: Virtual scrolling in file tree/list view
- **Very large diffs**: Truncate diff output with "Diff too large to display" message and file size indicator
- **Concurrent operations**: Queue operations, prevent conflicting git commands

## Requirements *(mandatory)*

### Functional Requirements

#### Graph Rendering & Display
- **FR-001**: System MUST display git commit history as a table with columns: Graph (SVG), Description, Date, Author, Commit Hash
- **FR-002**: System MUST render branch lines as SVG with configurable style (rounded Bezier curves or angular straight lines)
- **FR-003**: System MUST use a deterministic 12-color palette for branch visualization, cycling colors and allowing customization
- **FR-004**: System MUST display commit metadata: short hash (7 chars), truncated message (72 chars), author name, and date (configurable format: relative, ISO, date-only)
- **FR-005**: System MUST show commit nodes as circles on the graph, with distinct visual indicators for: regular commits, merge commits, HEAD commit, stash entries
- **FR-006**: System MUST display reference labels (branches, tags) inline on commit rows with color-coded badges
- **FR-007**: System MUST group local and remote branch labels (e.g., "main" with "origin" indicator) and allow toggling between combined/separate display
- **FR-008**: System MUST display tags as visually distinct badges (different shape/color from branch labels)
- **FR-009**: System MUST show the current HEAD position with distinct highlighting (cyan/bold or configurable)
- **FR-010**: System MUST display uncommitted changes as a special row at the top with open-circle indicator and change count
- **FR-011**: System MUST support muting (50% opacity) for merge commits and/or commits not ancestral to HEAD (configurable)
- **FR-012**: System MUST support High DPI / Retina rendering for the graph SVG

#### Commit Details View
- **FR-013**: System MUST show a Commit Details View when a commit is selected, displaying: full hash, author (name + email), committer, date, full message, parent hashes
- **FR-014**: System MUST display file changes in the detail view with two modes: File Tree (with compact folder support) and File List
- **FR-015**: System MUST indicate file change types with color-coded status badges: Added (A/green), Modified (M/yellow), Deleted (D/red), Renamed (R/blue), Copied (C/purple)
- **FR-016**: System MUST display file rename information showing oldPath → newPath
- **FR-017**: System MUST display commit statistics: files changed count, insertions (+), deletions (-)
- **FR-018**: System MUST support navigating between commits with keyboard arrows (Up/Down) while details view is open
- **FR-019**: System MUST support Ctrl/Cmd+Up/Down to navigate to parent/child commit on the same branch
- **FR-020**: System MUST allow the Commit Details View to be positioned inline (default) or docked to bottom

#### Commit Comparison
- **FR-021**: System MUST support comparing two commits via Ctrl/Cmd+click, showing all changed files between them
- **FR-022**: System MUST support comparing uncommitted changes with any commit

#### Branch Operations (Context Menu)
- **FR-023**: System MUST support checkout branch via right-click context menu
- **FR-024**: System MUST support rename branch via right-click context menu
- **FR-025**: System MUST support delete branch (with force-delete option) via right-click context menu
- **FR-026**: System MUST support merge branch into current with options: no-commit, no-fast-forward, squash
- **FR-027**: System MUST support rebase current branch onto selected branch
- **FR-028**: System MUST support push branch to remote(s) with force-push and force-with-lease options
- **FR-029**: System MUST support pull branch from remote with no-fast-forward and squash options
- **FR-030**: System MUST support fetch remote branch into local (with force-fetch option)
- **FR-031**: System MUST support creating new branches from any commit with optional auto-checkout
- **FR-032**: System MUST support copying branch name to clipboard

#### Commit Operations (Context Menu)
- **FR-033**: System MUST support checkout commit (detached HEAD) via context menu
- **FR-034**: System MUST support cherry-pick with options: record origin (-x), no-commit
- **FR-035**: System MUST support revert commit
- **FR-036**: System MUST support merge commit into current branch with options: no-commit, no-fast-forward, squash
- **FR-037**: System MUST support reset current branch to commit with modes: Soft, Mixed, Hard
- **FR-038**: System MUST support copying commit hash to clipboard
- **FR-039**: System MUST support copying commit subject (first line of message) to clipboard

#### Tag Operations
- **FR-040**: System MUST support creating tags (annotated with message or lightweight) from any commit
- **FR-041**: System MUST support deleting tags (local only, or local + remote)
- **FR-042**: System MUST support pushing tags to remote(s)
- **FR-043**: System MUST support viewing annotated tag details (tagger, date, message)
- **FR-044**: System MUST support copying tag name to clipboard

#### Stash Operations
- **FR-045**: System MUST display stash entries in the graph with distinct visual indicator
- **FR-046**: System MUST support apply stash (with reinstate-index option)
- **FR-047**: System MUST support pop stash (with reinstate-index option)
- **FR-048**: System MUST support drop (delete) stash
- **FR-049**: System MUST support creating branch from stash
- **FR-050**: System MUST support stashing uncommitted changes (with include-untracked option)
- **FR-051**: System MUST support copying stash name and hash to clipboard

#### Uncommitted Changes & Staging
- **FR-052**: System MUST display staged and unstaged files in separate sections
- **FR-053**: System MUST support staging/unstaging individual files
- **FR-054**: System MUST support stage-all and unstage-all operations
- **FR-055**: System MUST support creating commits with message input (Ctrl/Cmd+Enter shortcut)
- **FR-056**: System MUST support detecting and displaying file renames (oldPath → newPath)
- **FR-057**: System MUST support right-click on uncommitted changes row for: Stash, Reset (Mixed/Hard), Clean Untracked

#### Search & Filter
- **FR-058**: System MUST provide a Find Widget (Ctrl/Cmd+F) to search across: commit message, date, author, hash, branch name, tag name
- **FR-059**: System MUST highlight matching commits in search results and support navigating between results
- **FR-060**: System MUST support branch filtering via multi-select dropdown with: individual branches, glob patterns, per-remote grouping, select-all/deselect-all
- **FR-061**: System MUST debounce search input (300ms)
- **FR-062**: System MUST cache search results (max 10 entries) for performance

#### Auto-refresh & Performance
- **FR-063**: System MUST poll for repository state changes every 10 seconds using a state endpoint that returns only HEAD commit hash, branch list hash, and uncommitted file count
- **FR-064**: System MUST preserve scroll position, selection, and open panels during auto-refresh
- **FR-065**: System MUST defer refresh during active user interaction (scrolling, context menu open, dialog open)
- **FR-066**: System MUST skip UI redraw when no state changes are detected
- **FR-067**: System MUST support progressive loading: 300 commits initial, 100 on scroll, with "Load More" support
- **FR-068**: System MUST use virtual scrolling for the commit list
- **FR-069**: System MUST display a "last updated" indicator with relative time

#### Toolbar & Controls
- **FR-070**: System MUST provide a toolbar with: Branch Filter dropdown, Find button, Settings button, Fetch button, Refresh button
- **FR-071**: System MUST support column visibility toggle (Date, Author, Commit columns)
- **FR-072**: System MUST support column resizing via drag handles
- **FR-073**: System MUST support configurable reference label alignment (Normal, Aligned to Graph, On Right)

#### Remote Management
- **FR-074**: System MUST support viewing all configured remotes with URLs
- **FR-075**: System MUST support fetch from all remotes (with prune branches and prune tags options)
- **FR-076**: System MUST support adding, editing, and deleting remotes

#### File Diff Viewer
- **FR-087**: System MUST open a unified diff viewer when a file is clicked in the commit detail's file list (both flat and tree views)
- **FR-088**: System MUST render the diff viewer as an overlay that covers the right panels (Features, Conversations, Chat) while keeping the Git Graph panel fully visible and interactive on the left
- **FR-089**: System MUST display the unified diff with dual line numbers (old and new), added lines (green background), removed lines (red background), and unchanged context lines
- **FR-090**: System MUST show a diff viewer header with: file path, change status badge (A/M/D/R/C), commit short hash, and a close button
- **FR-091**: System MUST support closing the diff viewer via close button or Escape key, restoring the normal panel layout
- **FR-092**: System MUST support switching between files by clicking a different file in the commit detail's file list while the diff viewer is open (the diff viewer updates in-place)
- **FR-093**: System MUST display a "Binary file" indicator for binary files instead of diff content
- **FR-094**: System MUST fetch the diff content from the server via a dedicated API endpoint that returns the unified diff output for a specific file in a specific commit

#### Keyboard Shortcuts
- **FR-077**: System MUST open the Find Widget via the toolbar Find button and MUST NOT override the browser's native Ctrl/Cmd+F behavior
- **FR-078**: Ctrl/Cmd+H: Scroll to HEAD commit
- **FR-079**: System MUST refresh the graph via the toolbar Refresh button and MUST NOT override the browser's native Ctrl/Cmd+R behavior
- **FR-080**: Ctrl/Cmd+S: Scroll to first/next stash
- **FR-081**: Escape: Close dialogs, context menus, detail views
- **FR-082**: Enter: Submit active dialog

#### Feature Highlight
- **FR-095**: System MUST highlight commits belonging to the currently selected feature's branch with a distinct red-toned background color in the git graph, and display that feature's branch labels in red styling. The highlight clears when the user navigates back to the feature list.

#### Additional Features
- **FR-083**: System MUST render HTTP/HTTPS URLs in commit messages as clickable links
- **FR-084**: System MUST support emoji shortcode rendering in commit messages (gitmoji: `:bug:` → 🐛)
- **FR-085**: System MUST support Markdown formatting in commit messages (bold, italic, inline code)
- **FR-086**: System MUST display GPG signature status on commits (when available)

### Key Entities

- **Commit**: hash, shortHash, message, author (name, email), committer (name, email), timestamp, parents[], branches[], tags[], isHead, isMerge, signatureStatus
- **Branch**: name, tipHash, upstream (remote, name), color, isRemote, isHead, aheadBehind
- **Tag**: name, hash, isAnnotated, tagger (name, email, date), message
- **Stash**: hash, message, index, date
- **FileChange**: path, oldPath (rename), status (A/M/D/R/C/U), additions, deletions
- **Remote**: name, fetchUrl, pushUrl
- **RepositoryState**: headHash, branchListHash, uncommittedCount, timestamp (for change detection)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [ ] Graph renders with SVG branch lines matching vscode-git-graph visual style
- [ ] Table layout with resizable columns (Graph, Description, Date, Author, Commit)
- [ ] 300 commits load initially with progressive 100-commit loading on scroll
- [ ] All branch context menu operations work: checkout, rename, delete, merge, rebase, push, pull, fetch
- [ ] All commit context menu operations work: tag, branch, checkout, cherry-pick, revert, reset, copy
- [ ] All tag operations work: create (annotated/lightweight), delete, push, view details
- [ ] Stash operations work: apply, pop, drop, create branch, stash changes
- [ ] Staging/unstaging/commit workflow works from graph view
- [ ] Find Widget searches across message, author, hash, branch, tag
- [ ] Branch filter with glob patterns and per-remote grouping
- [ ] Commit comparison (Ctrl+click two commits) shows changed files
- [ ] Auto-refresh detects changes within 10 seconds without disrupting interaction
- [ ] Keyboard shortcuts work: Ctrl+H, Ctrl+S, arrows, Escape, Enter (without overriding browser Ctrl+F/Ctrl+R)
- [ ] File Tree and File List toggle in commit details
- [ ] Click file in commit detail opens unified diff viewer overlay covering right panels (Features/Conversations/Chat)
- [ ] Diff viewer shows line numbers, green additions, red deletions, context lines
- [ ] Diff viewer allows switching files without closing, closes with Escape or close button
- [ ] Remote management (view, add, edit, delete, fetch)

## Assumptions

- The graph is rendered as a panel in the Spec Cat application layout (not a standalone page)
- Git repository is the current working directory of the server
- SVG rendering is used for graph column (replacing previous Canvas approach)
- All git operations are server-side via `child_process` git CLI wrappers
- No external git libraries - direct CLI wrapping only
- The application runs on desktop browsers (Chrome, Firefox, Safari)

## Out of Scope

- Interactive rebase UI (too complex for initial implementation)
- Bisect mode
- Submodule management
- Git LFS operations
- Multi-repository support (single repository per instance)
- Avatar/Gravatar integration (may add later)
- Archive creation (tar/zip export)
- Code review tracking system (vscode-git-graph's review feature)
- Pull request creation integration
- Repository configuration export

## Priority Summary

| Priority | User Stories | Rationale |
|----------|-------------|-----------|
| **P0** | US1 (Graph Display), US2 (Commit Details), US14 (File Diff Viewer) | Core visualization - everything else builds on this |
| **P1** | US3 (Branch Ops), US4 (Commit Ops), US5 (Tags), US6 (Staging/Commit) | Essential daily git workflow operations |
| **P2** | US7 (Stash), US8 (Search/Filter), US9 (Auto-refresh), US10 (Comparison) | Important productivity features |
| **P3** | US11 (Remotes), US12 (Column Customization), US13 (Graph Style) | Nice-to-have customization and management |
