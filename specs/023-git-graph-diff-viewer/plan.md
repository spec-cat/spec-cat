# Implementation Plan: Git Graph Diff Viewer

**Branch**: `023-git-graph-diff-viewer` | **Date**: 2026-02-16 | **Spec**: `specs/023-git-graph-diff-viewer/spec.md`

## Summary

Isolate file-diff and overlay behavior to avoid collisions with rendering and operations streams.

## Scope Guardrails

### Owned Files

- `components/git/GitFileDiffViewer.vue`
- `server/api/git/file-diff.get.ts`
- `server/utils/git.ts` (`getFileDiff`)
- `stores/gitGraph.ts` (diff section)
- `layouts/default.vue` (overlay section)

### Do Not Edit

- `components/git/Git*Menu.vue`
- `components/git/GitFindWidget.vue`
- `components/git/GitGraphSvg.vue`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | API + parser contracts |
| FR-002 | Overlay layout branch |
| FR-003 | Store interaction model |
