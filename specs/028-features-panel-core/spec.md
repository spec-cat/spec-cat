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

- **SC-001** [FR-001]: Feature list displays all features from `specs/` directory with correct metadata (id, title, status) within 500ms of panel load.
- **SC-002** [FR-002]: File viewer loads and renders markdown content with proper error states (loading spinner appears within 100ms, error retry button available on failure).
- **SC-003** [FR-003]: Server rejects any file path containing `../` or paths outside `specs/` directory, returning 400 error for invalid paths.
- **SC-004** [FR-004]: Task progress shows accurate `completed/total` counts parsed from markdown checkboxes (`- [x]` = completed, `- [ ]` = pending).
- **SC-005**: Core panel implementation remains decoupled from action buttons (029) and active-linking (030) features.
