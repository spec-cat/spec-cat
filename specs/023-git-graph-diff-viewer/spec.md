# Feature Specification: Git Graph Diff Viewer

**Feature Branch**: `023-git-graph-diff-viewer`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `002-git-graph` 

## In Scope

- Per-file diff API response shaping
- Diff viewer state management
- Right-pane overlay rendering behavior

## Out of Scope

- Generic graph rendering work
- Context menu operations
- Search/filter UX

## Owned Files

- `components/git/GitFileDiffViewer.vue`
- `server/api/git/file-diff.get.ts`
- `server/utils/git.ts` (`getFileDiff`)
- `stores/gitGraph.ts` (diff viewer section)
- `layouts/default.vue` (diff overlay branch)

## Do Not Edit

- `components/git/Git*Menu.vue`
- `components/git/GitFindWidget.vue`
- `components/git/GitGraphSvg.vue`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST return structured per-file diff payloads.
- **FR-002**: System MUST show diff overlay without hiding Git Graph panel.
- **FR-003**: System MUST support close/switch file interactions in viewer state.

## Success Criteria *(mandatory)*

- **SC-001**: Diff overlay opens/closes with no layout breakage.
- **SC-002**: Large diff files render with truncation signaling.
