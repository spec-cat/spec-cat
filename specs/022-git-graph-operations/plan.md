# Implementation Plan: Git Graph Operations

**Branch**: `022-git-graph-operations` | **Date**: 2026-02-16 | **Spec**: `specs/022-git-graph-operations/spec.md`

## Summary

Extract all mutating workflows into a dedicated operation lane to maximize parallelism.

## Scope Guardrails

### Owned Files

- `components/git/Git*Menu.vue`
- `components/git/dialogs/*`
- `stores/gitGraph.ts` (operation actions)
- `server/api/git/*` mutating endpoints
- `server/utils/git.ts` mutating functions

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
