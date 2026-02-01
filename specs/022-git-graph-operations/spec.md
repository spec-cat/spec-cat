# Feature Specification: Git Graph Operations

**Feature Branch**: `022-git-graph-operations`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `002-git-graph` 

## In Scope

- Branch/tag/stash/remote context menu actions
- Operation dialogs
- Operation-oriented store actions
- Mutating git API endpoints

## Out of Scope

- Graph row rendering internals
- Diff overlay viewer
- Search/filter widget and result navigation

## Owned Files

- `components/git/Git*Menu.vue`
- `components/git/dialogs/*`
- `stores/gitGraph.ts` (operation actions only)
- `server/api/git/*.post.ts`
- `server/api/git/*.put.ts`
- `server/api/git/*.delete.ts`
- `server/utils/git.ts` (mutating helpers)

## Do Not Edit

- `components/git/GitGraphSvg.vue`
- `components/git/GitFindWidget.vue`
- `components/git/GitFileDiffViewer.vue`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide branch operation menus wired to typed APIs.
- **FR-002**: System MUST provide commit/tag/stash operation menus and dialogs.
- **FR-003**: System MUST expose deterministic mutating git endpoints.
- **FR-004**: Store operation actions MUST propagate errors with actionable messages.

## Success Criteria *(mandatory)*

- **SC-001**: All operation menu actions complete or fail with explicit feedback.
- **SC-002**: Operation tasks can run without editing rendering/diff/search files.
