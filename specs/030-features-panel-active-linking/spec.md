# Feature Specification: Features Panel Active Linking

**Feature Branch**: `030-features-panel-active-linking`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Family**: Consolidated from `004-spec-viewer` + `015-features-panel`

## In Scope

- Active conversation -> feature highlight mapping
- Auto-scroll to active feature
- Git Graph feature selection synchronization

## Out of Scope

- Feature discovery/viewer APIs
- Cascade/chat action behavior

## Owned Files

- `components/features/FeaturesPanel.vue` (active-linking section)
- `components/features/FeatureCard.vue` (active styling section)
- `stores/chat.ts` (active feature selector consumption only)
- `stores/gitGraph.ts` (feature selection sync surface)

## Do Not Edit

- `server/api/specs/*`
- `components/features/SpecFileViewer.vue`
- Cascade handler sections owned by 029

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Active conversation with `featureId` MUST highlight matching feature card.
- **FR-002**: Panel MUST auto-scroll highlighted card into view.
- **FR-003**: Feature selection MUST sync with Git Graph selection state.

## Success Criteria *(mandatory)*

- **SC-001**: Highlight state updates deterministically on conversation changes.
- **SC-002**: Sync logic is isolated from core viewer and actions.
