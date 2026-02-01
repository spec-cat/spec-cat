# Implementation Plan: Features Panel Actions

**Branch**: `029-features-panel-actions` | **Date**: 2026-02-16 | **Spec**: `specs/029-features-panel-actions/spec.md`

## Summary

Constrain all feature card action behavior to one spec lane.

## Scope Guardrails

### Owned Files

- `components/features/FeatureCard.vue` (action sections)
- `components/features/FeaturesPanel.vue` (action handlers)
- `composables/useChatStream.ts` (action integration)

### Do Not Edit

- `server/api/specs/*`
- `components/features/SpecFileViewer.vue`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Button gating |
| FR-002 | Conversation reuse/create |
| FR-003 | Force-new behavior |
| FR-004 | Chat shortcut behavior |
