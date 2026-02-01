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

- `stores/gitGraph.ts` (non-render sections)
- `server/api/git/*` mutating endpoints

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Row-level SVG renderer contract |
| FR-002 | Grid/row alignment constraints |
| FR-003 | Row reference labels |
| FR-004 | Merge node variants |
| FR-005 | Read-only detail render contract |
