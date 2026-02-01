# Feature Specification: Features Panel Actions

**Feature Branch**: `029-features-panel-actions`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Family**: Consolidated from `004-spec-viewer` + `015-features-panel`

## In Scope

- Cascade action button rendering/availability
- Action-to-conversation reuse/new rules
- Chat shortcut action on feature cards

## Out of Scope

- Feature discovery APIs
- Active feature highlight and scroll logic

## Owned Files

- `components/features/FeatureCard.vue` (cascade/chat action sections)
- `components/features/FeaturesPanel.vue` (action handlers only)
- `composables/useChatStream.ts` (cascade integration surface only)
- `stores/chat.ts` (feature conversation lookup/create hook usage only)

## Do Not Edit

- `server/api/specs/*`
- `components/features/SpecFileViewer.vue`
- Active highlight sections owned by 030

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Action buttons MUST enforce prerequisite visibility rules.
- **FR-002**: Action handlers MUST reuse or create feature-linked conversations deterministically.
- **FR-003**: Shift+click MUST force new conversation creation.
- **FR-004**: Chat icon action MUST open feature-linked conversation directly.

## Success Criteria *(mandatory)*

- **SC-001**: Action behaviors are testable without core viewer changes.
- **SC-002**: No API/viewer ownership collisions with 028.
