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

## Acceptance Scenarios

### Scenario 1: Active Conversation Highlight
- **Given**: User has multiple feature cards visible in the features panel
- **When**: User switches to a conversation linked to feature "001-auth-system"
- **Then**: The "001-auth-system" card shows active highlight styling

### Scenario 2: Auto-Scroll to Active Feature
- **Given**: Active feature card is outside the visible viewport
- **When**: User switches to a conversation with that feature
- **Then**: Panel smoothly scrolls to bring the active card into view

### Scenario 3: Git Graph Selection Sync
- **Given**: User has both features panel and git graph visible
- **When**: User clicks on a feature in the git graph
- **Then**: The corresponding feature card in the panel becomes highlighted

## Success Criteria *(mandatory)*

- **SC-001**: Highlight state updates within 100ms of conversation change with no intermediate states.
- **SC-002**: Sync logic is isolated in dedicated watchers/handlers separate from viewer and action code paths.
