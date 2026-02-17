# Feature Specification: Features Panel Core

**Feature Branch**: `028-features-panel-core`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Family**: Consolidated from `004-spec-viewer` + `015-features-panel`

## In Scope

- Feature discovery/listing
- Feature file listing and markdown viewing
- Spec modal open/close, loading/error/retry states

## Out of Scope

- Cascade/chat action buttons
- Active conversation feature linking behavior

## Owned Files

- `components/features/FeaturesPanel.vue` (core list/view state)
- `components/features/FeatureCard.vue` (display-only sections)
- `components/features/SpecFileViewer.vue`
- `server/api/specs/features.get.ts`
- `server/api/specs/[featureId]/[...filename].get.ts`
- `composables/useMarkdown.ts`
- `types/spec-viewer.ts`

## Do Not Edit

- `components/features/FeatureCard.vue` (action button sections owned by 029)
- `components/features/FeaturesPanel.vue` (active-linking section owned by 030)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list features and status metadata from `specs/`.
- **FR-002**: System MUST support file-level markdown viewing with load/error states.
- **FR-003**: System MUST enforce path-safe `.md` file access.
- **FR-004**: When `tasks.md` exists, each feature card MUST display `completed/total` task counts parsed from markdown checkbox items, positioned to the left of the top-right status dots.

## Success Criteria *(mandatory)*

- **SC-001**: Feature list and file viewer can be validated independently.
- **SC-002**: Core panel changes avoid action/linking logic collisions.
