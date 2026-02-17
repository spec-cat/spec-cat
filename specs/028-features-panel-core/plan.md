# Implementation Plan: Features Panel Core

**Branch**: `028-features-panel-core` | **Date**: 2026-02-16 | **Spec**: `specs/028-features-panel-core/spec.md`

## Summary

Build a single, stable core panel baseline after consolidating `004` and `015`.

## Scope Guardrails

### Owned Files

- `components/features/FeaturesPanel.vue` (core sections)
- `components/features/FeatureCard.vue` (display sections)
- `components/features/SpecFileViewer.vue`
- `server/api/specs/features.get.ts`
- `server/api/specs/[featureId]/[...filename].get.ts`

### Do Not Edit

- Action-trigger sections owned by `029-features-panel-actions`
- Active-linking sections owned by `030-features-panel-active-linking`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Feature discovery/listing |
| FR-002 | File viewer + markdown rendering |
| FR-003 | Safe server path handling |
| FR-004 | Task checkbox progress extraction + card metadata display placement |
