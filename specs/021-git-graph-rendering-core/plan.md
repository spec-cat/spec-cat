# Implementation Plan: Git Graph Rendering Core

**Branch**: `021-git-graph-rendering-core` | **Date**: 2026-02-16 | **Spec**: `specs/021-git-graph-rendering-core/spec.md`

## Summary

Isolate rendering-only graph concerns from operations/search/diff to reduce cross-spec collisions.

## Scope Guardrails

### Owned Files

- `components/git/GitGraphSvg.vue`
- `components/git/GitCommitList.vue`
- `components/git/GitCommitRow.vue`
- `components/git/GitCommitDetail.vue`
- `composables/useGitGraph.ts`

### Do Not Edit

- `server/api/git/*.post.ts`
- `components/git/Git*Menu.vue`
- `components/git/dialogs/*`
- `stores/gitGraph.ts` (operations/search/diff sections)

## Technical Context

- **Framework**: Vue 3 composition API with TypeScript
- **Rendering**: SVG-based graph visualization using Vue templates
- **State Management**: Read-only data flow from git store to components
- **Constraints**: Must maintain strict row/cell alignment for 500+ commits

## Implementation Approach

### Graph Rendering Architecture
- Use Vue's reactive system to bind graph data to SVG elements
- Maintain strict 1:1 mapping between commit rows and graph cells
- Leverage CSS grid for alignment between commit list and graph SVG

### Component Responsibilities
- `GitGraphSvg.vue`: Pure SVG rendering of nodes and edges
- `GitCommitList.vue`: Container managing row/graph alignment
- `GitCommitRow.vue`: Individual commit metadata display with ref labels
- `GitCommitDetail.vue`: Read-only commit detail viewer
- `useGitGraph.ts`: Data shaping composable for graph visualization

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Row-level SVG renderer contract in GitGraphSvg.vue |
| FR-002 | Grid/row alignment constraints via CSS grid in GitCommitList.vue |
| FR-003 | Row reference labels rendered inline in GitCommitRow.vue |
| FR-004 | Merge node variants differentiated via SVG attributes |
| FR-005 | Read-only detail render contract enforced in GitCommitDetail.vue |
