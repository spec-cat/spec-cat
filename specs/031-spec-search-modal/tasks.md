# Tasks: Command Palette Spec Search

**Input**: Design documents from `/home/khan/src/brick2/specs/031-spec-search-modal/`
**Prerequisites**: `/home/khan/src/brick2/specs/031-spec-search-modal/plan.md`, `/home/khan/src/brick2/specs/031-spec-search-modal/spec.md`, `/home/khan/src/brick2/specs/031-spec-search-modal/research.md`, `/home/khan/src/brick2/specs/031-spec-search-modal/data-model.md`, `/home/khan/src/brick2/specs/031-spec-search-modal/contracts/spec-search-modal-api.yaml`

**Tests**: Not explicitly requested in the specification; implementation tasks include manual validation and typecheck checkpoints.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Scope Guardrails *(mandatory)*

### Owned Files (from plan.md)

- `/home/khan/src/brick2/components/features/FeaturesPanel.vue`
- `/home/khan/src/brick2/components/features/FeatureSearchModal.vue`
- `/home/khan/src/brick2/types/specSearch.ts`
- `/home/khan/src/brick2/specs/031-spec-search-modal/*`

### Do Not Edit (from plan.md)

- `/home/khan/src/brick2/specs/018-codex-provider-integration/`
- `/home/khan/src/brick2/server/utils/specSearch/*`
- `/home/khan/src/brick2/components/git/*`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish files and interfaces used by all user stories.

- [ ] T001 Create command palette component scaffold in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-001]
- [ ] T002 Add command palette state container and modal mount point in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` [FR-001]
- [ ] T003 [P] Add command palette view-model interfaces for debounced query/result rendering in `/home/khan/src/brick2/types/specSearch.ts` [FR-006]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared behavior required before story-specific completion.

**⚠️ CRITICAL**: Complete this phase before starting user story phases.

- [ ] T004 Implement typed modal props/emits contract between `/home/khan/src/brick2/components/features/FeaturesPanel.vue` and `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-007]
- [ ] T005 Implement search request helper in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` that targets `GET /api/specs/search` with `mode=keyword` and default global scope [FR-004]
- [ ] T006 Implement shared close-without-selection behavior in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` to preserve existing feature selection [FR-010]

**Checkpoint**: Foundation ready; user stories can be completed incrementally.

---

## Phase 3: User Story 1 - Open and Search Features (Priority: P1) 🎯 MVP

**Goal**: Users open the modal from `Ctrl+K`/`Cmd+K`, type a query, and receive debounced global search results.

**Independent Test**: Open the modal with the shortcut from any focus state, type a query, wait 400ms, and verify relevant cross-feature results appear.

### Implementation for User Story 1

- [ ] T007 [US1] Implement global `Ctrl+K`/`Cmd+K` handler in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` to open the modal regardless of focused element [FR-001] [FR-013]
- [ ] T008 [US1] Implement auto-focus on modal open in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-002]
- [ ] T009 [US1] Implement 400ms debounced query state transition in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-003]
- [ ] T010 [US1] Execute debounced search requests without `featureId` filter in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-004]
- [ ] T011 [US1] Render searchable result list with feature ID and source context in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-005] [FR-006]

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Select Result to Focus Feature Panel (Priority: P2)

**Goal**: Users select a search result via pointer/keyboard and the feature panel syncs selection with resilient error handling.

**Independent Test**: Select a displayed result by click and by keyboard (`ArrowUp`/`ArrowDown` + `Enter`) and verify feature panel selection updates; verify unavailable feature path keeps modal open with inline error.

### Implementation for User Story 2

- [ ] T012 [US2] Implement result click selection emit in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-007] [FR-008]
- [ ] T013 [US2] Handle modal selection event by invoking existing feature-selection flow in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` [FR-007]
- [ ] T014 [US2] Implement keyboard navigation (`ArrowUp`/`ArrowDown`) and Enter confirm behavior in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-008]
- [ ] T015 [US2] Implement unavailable-feature guard and inline error while keeping modal open in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-011]
- [ ] T016 [US2] Implement Escape-to-close behavior in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` and preserve selection in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` [FR-012]

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Handle Empty and No-Match States (Priority: P3)

**Goal**: Users receive clear guidance for empty, no-results, and failed-search states without breaking modal flow.

**Independent Test**: Enter whitespace-only query and no-match query and simulate request failure; verify dedicated feedback states and stable modal behavior.

### Implementation for User Story 3

- [ ] T017 [US3] Implement empty/whitespace query guard that skips requests and shows guidance in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-009]
- [ ] T018 [US3] Implement no-results state rendering in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-009]
- [ ] T019 [US3] Implement recoverable failed-search state with retry path in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` [FR-009]
- [ ] T020 [US3] Ensure modal dismissal paths preserve current selection when no result is chosen in `/home/khan/src/brick2/components/features/FeaturesPanel.vue` [FR-010]

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final alignment, validation, and documentation updates across stories.

- [ ] T021 [P] Align search/result types with implemented modal usage in `/home/khan/src/brick2/types/specSearch.ts` [FR-006]
- [ ] T022 [P] Update implementation notes and validation checklist in `/home/khan/src/brick2/specs/031-spec-search-modal/quickstart.md` [FR-001] [FR-013]
- [ ] T023 Run `pnpm typecheck` in `/home/khan/src/brick2` and resolve issues in `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` and `/home/khan/src/brick2/components/features/FeaturesPanel.vue` [FR-001] [FR-013]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks story phases.
- **Phase 3 (US1)**: Starts after Phase 2.
- **Phase 4 (US2)**: Starts after Phase 3 because it depends on rendered result interactions.
- **Phase 5 (US3)**: Starts after Phase 3; can proceed in parallel with Phase 4 once base search flow exists.
- **Phase 6 (Polish)**: Starts after all targeted story phases are complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories; defines MVP behavior.
- **US2 (P2)**: Depends on US1 search-result rendering.
- **US3 (P3)**: Depends on US1 query lifecycle; independent from US2 selection mechanics.

### FR-to-Task Coverage Check

- **FR-001**: T001, T007, T022, T023
- **FR-002**: T008
- **FR-003**: T009
- **FR-004**: T005, T010
- **FR-005**: T011
- **FR-006**: T003, T011, T021
- **FR-007**: T004, T012, T013
- **FR-008**: T012, T014
- **FR-009**: T017, T018, T019
- **FR-010**: T006, T020
- **FR-011**: T015
- **FR-012**: T016
- **FR-013**: T007, T022, T023

---

## Parallel Opportunities

- **Setup**: `T003` can run in parallel with `T001`/`T002`.
- **After Foundation**: US2 and US3 can proceed concurrently after US1 base search flow is stable.
- **Polish**: `T021` and `T022` can run in parallel before `T023`.

### Parallel Example: User Story 1

```bash
Task: "Implement auto-focus on modal open in /home/khan/src/brick2/components/features/FeatureSearchModal.vue"
Task: "Implement 400ms debounced query state transition in /home/khan/src/brick2/components/features/FeatureSearchModal.vue"
```

### Parallel Example: User Story 2

```bash
Task: "Handle modal selection event in /home/khan/src/brick2/components/features/FeaturesPanel.vue"
Task: "Implement keyboard navigation and Enter confirm in /home/khan/src/brick2/components/features/FeatureSearchModal.vue"
```

### Parallel Example: User Story 3

```bash
Task: "Implement no-results state rendering in /home/khan/src/brick2/components/features/FeatureSearchModal.vue"
Task: "Implement recoverable failed-search state with retry path in /home/khan/src/brick2/components/features/FeatureSearchModal.vue"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate independent US1 test criteria from `spec.md`.
4. Demo/deploy MVP shortcut + debounced global search.

### Incremental Delivery

1. Deliver US1 (open + search).
2. Deliver US2 (selection + keyboard navigation + unavailable handling).
3. Deliver US3 (empty/no-results/error feedback).
4. Complete polish and typecheck gate.

### Independent Validation Gates

- **US1 Gate**: Shortcut opens modal from any focus and returns debounced results.
- **US2 Gate**: Click/keyboard selection updates feature panel; unavailable selection remains recoverable.
- **US3 Gate**: Empty/no-results/error states are explicit and non-breaking.
