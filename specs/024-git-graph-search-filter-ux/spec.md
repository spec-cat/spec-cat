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

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Find widget MUST support keyboard navigation across matches using standard keybindings (F3/Shift+F3 or Enter/Shift+Enter).
- **FR-002**: Search MUST cover all user-configured commit/ref fields (message, author, hash) with case-insensitive matching.
- **FR-003**: Branch filters MUST support both checkbox-based grouped selection and pattern-based filtering with glob syntax.

## Success Criteria *(mandatory)*

- **SC-001**: Search navigation maintains current match index and highlighting after graph data refresh (tested with 100+ commits).
- **SC-002**: Filter state changes trigger no server mutations and preserve existing diff/operation selections without side effects.
- **SC-003**: All keyboard navigation works without mouse interaction (Tab, Enter, Escape, F3 keys functional).
- **SC-004**: Search performance remains under 100ms for repositories with up to 10,000 commits.
