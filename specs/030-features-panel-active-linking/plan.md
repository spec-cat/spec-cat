# Implementation Plan: Features Panel Active Linking

**Branch**: `030-features-panel-active-linking` | **Date**: 2026-02-16 | **Spec**: `specs/030-features-panel-active-linking/spec.md`

## Summary

Isolate active-link context behavior into a dedicated lane to avoid `FeaturesPanel.vue` contention.

## Scope Guardrails

### Owned Files

- `components/features/FeaturesPanel.vue` (active-linking section)
- `components/features/FeatureCard.vue` (active style section)
- `stores/gitGraph.ts` (selection sync section)

### Do Not Edit

- `server/api/specs/*`
- `components/features/SpecFileViewer.vue`
- Action sections owned by `029-features-panel-actions`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Active highlight mapping |
| FR-002 | Auto-scroll behavior |
| FR-003 | Git Graph sync behavior |
