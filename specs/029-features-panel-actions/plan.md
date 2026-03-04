# Implementation Plan: Features Panel Actions

**Branch**: `029-features-panel-actions` | **Date**: 2026-02-16 | **Spec**: `specs/029-features-panel-actions/spec.md`

## Summary

Constrain all feature card action behavior to one spec lane.

## Scope Guardrails

### Owned Files

- `components/features/FeatureCard.vue` (cascade/chat action sections)
- `components/features/FeaturesPanel.vue` (action handlers only)
- `composables/useChatStream.ts` (cascade integration surface only)
- `stores/chat.ts` (feature conversation lookup/create hook usage only)

### Do Not Edit

- `server/api/specs/*`
- `components/features/SpecFileViewer.vue`
- Active highlight sections owned by 030

## FR Coverage Matrix

| FR | Requirement | Planned Coverage |
|----|-------------|------------------|
| FR-001 | Action buttons MUST enforce prerequisite visibility rules | Button gating logic in FeatureCard |
| FR-002 | Action handlers MUST reuse or create feature-linked conversations deterministically | Conversation reuse/create logic in FeaturesPanel |
| FR-003 | Shift+click MUST force new conversation creation | Force-new behavior in FeaturesPanel handlers |
| FR-004 | Chat icon action MUST open feature-linked conversation directly | Chat shortcut behavior in FeatureCard and FeaturesPanel |
