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

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render Graph Rows Reliably (Priority: P1)

As a developer, I want to open the Git Graph and reliably read branch topology and commit metadata without layout regressions, so that I can understand the project's commit history at a glance.

**Acceptance Criteria**:
- Given a repository with 500+ commits and complex branching
- When I scroll through the commit list
- Then graph nodes and edges remain aligned with their corresponding rows
- And branch/tag labels are clearly visible on the relevant commits
- And merge commits are visually distinct from regular commits

**Independent Test**: Open graph with merge-heavy history and verify row alignment and node/edge rendering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render one SVG graph cell per visible commit row with a 1:1 correspondence between commits and graph nodes.
- **FR-002**: System MUST keep graph cell and row metadata vertically aligned within 2px tolerance across all viewport sizes.
- **FR-003**: System MUST support branch/tag reference label rendering in row description with distinct visual styling for local branches, remote branches, and tags.
- **FR-004**: System MUST support merge commit node differentiation using distinct visual indicators (shape, size, or color).
- **FR-005**: System MUST keep commit detail rendering read-only and data-driven without any inline editing capabilities.

## Success Criteria *(mandatory)*

- **SC-001**: No row/graph misalignment (>2px vertical offset) across 500+ visible rows during scrolling.
- **SC-002**: Merge nodes visually distinct from regular commits in 100% of cases.
- **SC-003**: Branch/tag reference labels remain readable and correctly positioned for all commits.
- **SC-004**: Graph rendering performance maintains 60fps scrolling with 1000+ commits visible.
- **SC-005**: Zero editing controls visible in commit detail view.
