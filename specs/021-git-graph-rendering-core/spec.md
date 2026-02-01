# Feature Specification: Git Graph Rendering Core

**Feature Branch**: `021-git-graph-rendering-core`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `002-git-graph` 

## In Scope

- SVG graph row rendering
- Commit list/row rendering structure
- Commit detail read-only presentation
- Read-only graph data shaping in composables

## Out of Scope

- Branch/tag/stash/remote mutating operations
- File diff overlay workflow
- Search/filter widget UX

## Owned Files

- `components/git/GitGraphSvg.vue`
- `components/git/GitCommitList.vue`
- `components/git/GitCommitRow.vue`
- `components/git/GitCommitDetail.vue`
- `composables/useGitGraph.ts`

## Do Not Edit

- `server/api/git/*.post.ts`
- `components/git/Git*Menu.vue`
- `components/git/dialogs/*`
- `stores/gitGraph.ts` (operations/search/diff sections)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render Graph Rows Reliably (Priority: P1)

Developers can open the Git Graph and reliably read branch topology and commit metadata without layout regressions.

**Independent Test**: Open graph with merge-heavy history and verify row alignment and node/edge rendering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render one SVG graph cell per visible commit row.
- **FR-002**: System MUST keep graph cell and row metadata vertically aligned.
- **FR-003**: System MUST support branch/tag reference label rendering in row description.
- **FR-004**: System MUST support merge commit node differentiation.
- **FR-005**: System MUST keep commit detail rendering read-only and data-driven.

## Success Criteria *(mandatory)*

- **SC-001**: No row/graph misalignment across 500+ visible rows.
- **SC-002**: Merge node and reference labels render consistently.
