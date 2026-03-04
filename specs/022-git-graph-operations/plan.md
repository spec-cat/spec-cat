# Implementation Plan: Git Graph Operations

**Branch**: `022-git-graph-operations` | **Date**: 2026-02-16 | **Spec**: `specs/022-git-graph-operations/spec.md`

## Summary

Extract all mutating workflows into a dedicated operation lane to maximize parallelism. This feature implements branch/tag/stash/remote context menu actions, operation dialogs, operation-oriented store actions, and mutating git API endpoints.

## In Scope

- Branch/tag/stash/remote context menu actions
- Operation dialogs
- Operation-oriented store actions
- Mutating git API endpoints

## Out of Scope

- Graph row rendering internals
- Diff overlay viewer
- Search/filter widget and result navigation

## Scope Guardrails

### Owned Files

- `components/git/Git*Menu.vue`
- `components/git/dialogs/*`
- `stores/gitGraph.ts` (operation actions only)
- `server/api/git/*.post.ts`
- `server/api/git/*.put.ts`
- `server/api/git/*.delete.ts`
- `server/utils/git.ts` (mutating helpers)

### Do Not Edit

- `components/git/GitGraphSvg.vue`
- `components/git/GitFindWidget.vue`
- `components/git/GitFileDiffViewer.vue`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Branch operation menu/actions |
| FR-002 | Commit/tag/stash workflows |
| FR-003 | Endpoint contracts |
| FR-004 | Store-level error propagation |
