# Implementation Plan: Git Graph Search & Filter UX

**Branch**: `024-git-graph-search-filter-ux` | **Date**: 2026-02-16 | **Spec**: `specs/024-git-graph-search-filter-ux/spec.md`

## Summary

Constrain search/filter UX changes to UI + store sections to enable parallel execution with operations/diff lanes. This feature enhances the git graph component with robust search and filter capabilities while maintaining strict scope boundaries.

## Scope Guardrails

### Owned Files

- `components/git/GitFindWidget.vue`
- `components/git/GitGraph.vue` (search/filter controls)
- `stores/gitGraph.ts` (search/filter logic)

### Do Not Edit

- `components/git/GitFileDiffViewer.vue`
- `components/git/Git*Menu.vue`
- `server/api/git/*.post.ts`

## Technical Implementation Approach

### GitFindWidget.vue
- Implement keyboard event handlers for F3/Shift+F3 navigation
- Maintain current match index in component state
- Emit search events to parent for graph filtering

### gitGraph.ts Store Updates
- Add search state: `searchQuery`, `searchFields`, `currentMatchIndex`
- Add filter state: `branchFilters`, `filterMode` (grouped/pattern)
- Implement search algorithm with configurable field matching
- Cache search results for performance

### GitGraph.vue Integration
- Add find widget slot in graph header
- Connect widget events to store actions
- Update graph rendering to highlight search matches
- Implement branch filter UI with checkbox groups

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Keyboard navigation in GitFindWidget.vue with F3/Enter support |
| FR-002 | Configurable field search in gitGraph.ts store |
| FR-003 | Branch filter UI in GitGraph.vue with grouped/pattern modes |
