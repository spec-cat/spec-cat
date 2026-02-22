# Quickstart: Git Graph Visualization (Redesign)

**Feature**: 002-git-graph
**Date**: 2026-02-08
**Reference**: vscode-git-graph

## Prerequisites

- Node.js 18+ with pnpm package manager
- Git repository (any size)
- Existing Nuxt 3 project with Tailwind CSS and Pinia configured

## Current State

The project already has a working foundation with these existing files:
- `types/git.ts` — Type definitions (needs expansion for tags, stashes, remotes, operations)
- `server/utils/git.ts` — Git CLI wrappers (needs new operation functions)
- `server/api/git/` — 12 existing API routes (need 20+ new routes)
- `stores/gitGraph.ts` — Pinia store (needs stash, remote, comparison, dialog state)
- `composables/useGitGraph.ts` — Layout algorithm (needs SVG migration)
- `composables/useAutoRefresh.ts` — Polling (functional, minor enhancements)
- `components/git/` — 8 Vue components (need expansion + new components)

## Implementation Checklist

### Phase 1: Type & API Foundation

1. **Expand types/git.ts** with:
   - `GitTag` interface (name, hash, isAnnotated, tagger, message)
   - `GitStash` interface (hash, index, message, date, branchName)
   - `GitRemote` interface (name, fetchUrl, pushUrl)
   - Operation request/response types (see data-model.md)
   - `GraphRowData`, `GraphSegment` for SVG rendering
   - `ColumnConfig`, `RefLabelAlignment` for table layout
   - Expand `BRANCH_COLORS` to 12 colors

2. **Create new server API routes**:

   Branch operations:
   ```bash
   server/api/git/branch-rename.post.ts   # FR-024
   server/api/git/merge.post.ts           # FR-026
   server/api/git/rebase.post.ts          # FR-027
   server/api/git/push.post.ts            # FR-028
   server/api/git/pull.post.ts            # FR-029
   server/api/git/fetch.post.ts           # FR-030, FR-075
   ```

   Commit operations:
   ```bash
   server/api/git/cherry-pick.post.ts     # FR-034
   server/api/git/revert.post.ts          # FR-035
   server/api/git/reset.post.ts           # FR-037
   server/api/git/diff.get.ts             # FR-021, FR-022
   ```

   Tag operations:
   ```bash
   server/api/git/tag.post.ts             # FR-040
   server/api/git/tag.delete.ts           # FR-041
   server/api/git/tag-push.post.ts        # FR-042
   server/api/git/tag/[name].get.ts       # FR-043
   ```

   Stash operations:
   ```bash
   server/api/git/stash.get.ts            # FR-045
   server/api/git/stash.post.ts           # FR-050
   server/api/git/stash-apply.post.ts     # FR-046
   server/api/git/stash-pop.post.ts       # FR-047
   server/api/git/stash-drop.post.ts      # FR-048
   server/api/git/stash-branch.post.ts    # FR-049
   ```

   Remote operations:
   ```bash
   server/api/git/remotes.get.ts          # FR-074
   server/api/git/remote.post.ts          # FR-076
   server/api/git/remote.put.ts           # FR-076
   server/api/git/remote.delete.ts        # FR-076
   ```

### Phase 2: Core UI Redesign

3. **Migrate graph rendering from Canvas to SVG**:
   - Replace `GitGraphCanvas.vue` with SVG-per-row approach
   - Each commit row renders its own `<svg>` in the Graph column
   - Pre-compute SVG path data in `useGitGraph.ts`
   - Support both Bezier (rounded) and straight (angular) styles

4. **Implement table-based layout**:
   - CSS Grid with columns: Graph | Description | Date | Author | Commit Hash
   - Column header row with resize handles (drag-to-resize)
   - Column visibility toggles
   - Reference label alignment options

5. **Progressive loading update**:
   - Change initial load from 50 to 300 (FR-067)
   - Incremental load 100 on scroll

### Phase 3: Context Menus & Dialogs

6. **Create shared components**:
   ```bash
   components/git/GitContextMenu.vue      # Reusable context menu
   components/git/GitDialog.vue           # Reusable dialog
   ```

7. **Expand existing context menus**:
   - `GitBranchMenu.vue` — Add: Rename, Merge, Rebase, Push, Pull, Fetch, Copy Name
   - `GitCommitMenu.vue` — Add: Tag, Branch, Checkout, Cherry Pick, Revert, Merge, Reset, Copy Subject

8. **Create new context menus**:
   ```bash
   components/git/GitTagMenu.vue          # View Details, Delete, Push, Copy Name
   components/git/GitStashMenu.vue        # Apply, Pop, Drop, Branch, Copy
   components/git/GitUncommittedMenu.vue  # Stash, Reset, Clean
   ```

9. **Create operation dialogs**:
   ```bash
   components/git/dialogs/MergeDialog.vue
   components/git/dialogs/DeleteBranchDialog.vue
   components/git/dialogs/PushDialog.vue
   components/git/dialogs/CherryPickDialog.vue
   components/git/dialogs/ResetDialog.vue
   components/git/dialogs/TagCreateDialog.vue
   components/git/dialogs/TagDeleteDialog.vue
   components/git/dialogs/StashDialog.vue
   ```

### Phase 4: Enhanced Features

10. **Commit Details View enhancements**:
    - File Tree view with compact folders (FR-014)
    - Inline vs docked positioning toggle (FR-020)
    - Committer info display (FR-013)
    - Parent hash links (FR-013)

11. **Commit Comparison** (FR-021, FR-022):
    - Ctrl/Cmd+click second commit for comparison mode
    - Compare uncommitted changes vs any commit

12. **Stash visualization** (FR-045):
    - Display stash entries with nested circle indicator
    - Stash entries in commit list at appropriate positions

13. **Search enhancements** (FR-058-FR-062):
    - Search result navigation (prev/next arrows)
    - Search across branch names and tag names
    - Branch filter: glob patterns, per-remote grouping, select-all/deselect-all

14. **Keyboard shortcuts** (FR-077-FR-082):
    - `useKeyboardShortcuts` composable
    - Ctrl+H, Ctrl+S, Escape, Enter, arrows
    - Browser-native Ctrl+F / Ctrl+R remain unmodified

15. **Commit message rendering** (FR-083-FR-085):
    - URL linkification
    - Gitmoji shortcode → emoji
    - Basic Markdown (bold, italic, code)

### Phase 5: Polish

16. **Remote management UI** (FR-074-FR-076):
    - Settings panel showing remotes
    - Add/edit/delete remote dialogs

17. **Graph style options** (FR-002, FR-011):
    - Rounded vs angular toggle
    - Mute non-ancestral commits toggle

18. **GPG signature display** (FR-086)

## Verification Steps

1. **Graph renders**: Navigate to git view, see table with SVG graph column
2. **Table columns**: All 5 columns visible, resizable via drag handles
3. **300 initial commits**: Large repo loads 300 initially, scrolls to load 100 more
4. **Commit details**: Click commit → see full info with file tree/list toggle
5. **Branch context menu**: Right-click branch → all 7+ operations available
6. **Commit context menu**: Right-click commit → all 9 operations available
7. **Tag operations**: Right-click tag → view details, delete, push
8. **Stash operations**: See stash entries, right-click → apply/pop/drop/branch
9. **Staging**: Stage/unstage files, commit with Ctrl+Enter
10. **Search**: Find button opens find widget, searches across all fields
11. **Branch filter**: Dropdown with glob patterns and per-remote grouping
12. **Comparison**: Ctrl+click two commits → see diff
13. **Auto-refresh**: External commit detected within 10s
14. **Keyboard shortcuts**: All non-overriding shortcuts functional; browser Ctrl+F/Ctrl+R still work natively
15. **Remote management**: View/add/edit/delete remotes in settings

## Key Files Summary

| File | Purpose | FR Coverage |
|------|---------|-------------|
| types/git.ts | All types + constants | Foundation |
| server/utils/git.ts | Git CLI wrappers | All server ops |
| server/api/git/*.ts | 30+ API routes | FR-001 to FR-076 |
| stores/gitGraph.ts | Central state | All client state |
| composables/useGitGraph.ts | SVG layout algorithm | FR-001–FR-012 |
| composables/useAutoRefresh.ts | Polling + deferral | FR-063–FR-069 |
| composables/useKeyboardShortcuts.ts | Keyboard handling | FR-077–FR-082 |
| components/git/GitGraph.vue | Main container | Orchestration |
| components/git/GitCommitList.vue | Virtual scrolling table | FR-001, FR-067–FR-068 |
| components/git/GitCommitRow.vue | Row with SVG + data | FR-001–FR-012 |
| components/git/GitCommitDetail.vue | Detail panel | FR-013–FR-020 |
| components/git/GitBranchMenu.vue | Branch context menu | FR-023–FR-032 |
| components/git/GitCommitMenu.vue | Commit context menu | FR-033–FR-039 |
| components/git/GitTagMenu.vue | Tag context menu | FR-040–FR-044 |
| components/git/GitStashMenu.vue | Stash context menu | FR-045–FR-051 |
| components/git/dialogs/*.vue | Operation dialogs | FR-025–FR-050 |
| utils/commitMessage.ts | Message rendering | FR-083–FR-086 |
