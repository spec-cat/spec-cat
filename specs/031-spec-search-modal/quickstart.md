# Quickstart: Command Palette Spec Search

## Goal

Deliver a `Ctrl+K`/`Cmd+K` command palette that always opens regardless of current focus, runs 400ms debounced search across all features, and selects features directly in the feature panel.

## Prerequisites

- Active branch: `031-spec-search-modal`
- Existing endpoints: `GET /api/specs/search`, `GET /api/specs/features`
- Features panel available in the UI

## Getting Started

For detailed implementation steps, see tasks.md. The implementation follows a phased approach with Setup, Foundational, and User Story phases.

## Manual Validation Checklist

1. Press `Ctrl+K`/`Cmd+K` when focus is in regular content and verify modal opens with input focused.
2. Press `Ctrl+K`/`Cmd+K` when focus is in an input/textarea/contenteditable field and verify modal still opens.
3. Type query text and confirm request triggers only after 400ms inactivity.
4. Verify result set includes features beyond the currently selected feature.
5. Select result by click and verify feature panel updates to target feature.
6. Select result with `ArrowUp`/`ArrowDown` + `Enter` and verify correct selection.
7. Press `Escape` with no selection and verify prior feature selection is preserved.
8. Trigger unavailable-result path and verify inline error appears while modal remains open.
9. Use empty/whitespace query and verify guidance appears with no request.
10. Use no-match query and verify no-results state appears.

## Done Criteria

- FR-001 through FR-013 satisfied in observed behavior.
- Success criteria SC-001 through SC-004 remain testable and aligned with UI behavior.
- No regressions in feature panel selection and existing modal interactions.

## Key Implementation Points

- Fixed 400ms debounce for search
- Global search scope (all features)
- Inline error handling for unavailable features
- See plan.md for technical architecture details
