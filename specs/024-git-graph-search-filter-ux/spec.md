# Feature Specification: Git Graph Search & Filter UX

**Feature Branch**: `024-git-graph-search-filter-ux`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `002-git-graph` 

## In Scope

- Find widget
- Search result navigation
- Branch filter UX and grouping

## Out of Scope

- Mutating git operations
- Diff overlay
- SVG row rendering internals

## Owned Files

- `components/git/GitFindWidget.vue`
- `components/git/GitGraph.vue` (search/filter controls only)
- `stores/gitGraph.ts` (search/filter section)

## Do Not Edit

- `components/git/GitFileDiffViewer.vue`
- `components/git/Git*Menu.vue`
- `server/api/git/*.post.ts`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Find widget MUST support keyboard navigation across matches.
- **FR-002**: Search MUST cover configured commit/ref fields.
- **FR-003**: Branch filters MUST support grouped and pattern-based selection.

## Success Criteria *(mandatory)*

- **SC-001**: Search navigation remains stable after graph refresh.
- **SC-002**: Filter interactions do not mutate operation/diff behavior.
