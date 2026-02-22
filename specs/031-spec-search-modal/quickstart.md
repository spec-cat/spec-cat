# Quickstart: Command Palette Spec Search

## Goal

Deliver a `Ctrl+K`/`Cmd+K` command palette that always opens regardless of current focus, runs 400ms debounced search across all features, and selects features directly in the feature panel.

## Prerequisites

- Active branch: `031-spec-search-modal`
- Existing endpoints: `GET /api/specs/search`, `GET /api/specs/features`
- Features panel available in the UI

## Implementation Steps

1. Build `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` for query input, result rendering, and keyboard navigation.
2. Add shortcut open/close orchestration in `/home/khan/src/brick2/components/features/FeaturesPanel.vue`.
3. Ensure `Ctrl+K`/`Cmd+K` opens modal regardless of current focus target.
4. Implement 400ms debounced search requests to `/api/specs/search` with `mode=keyword`, `limit=20`, and no default `featureId` filter.
5. Render each result with feature-identifying context (feature ID + source/snippet).
6. Implement pointer selection and keyboard selection (`ArrowUp`/`ArrowDown` + `Enter`).
7. Wire result selection to existing feature panel selection flow.
8. Handle stale/unavailable result selection with inline error while keeping modal open.
9. Implement explicit empty-query, no-results, and request-failure states.
10. Validate with `pnpm typecheck` and targeted tests/manual checks.

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

## Implementation Notes

- Command palette UI lives in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue`.
- Global shortcut wiring is implemented in `/home/khan/src/brick2/components/features/FeaturesPanel.vue`.
- Debounce is fixed at 400ms and search defaults to all features (no default `featureId` filter).
- Unavailable selections are handled inline while keeping modal open.
