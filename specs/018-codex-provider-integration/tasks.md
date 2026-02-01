# Tasks: Codex Provider Integration

**Input**: Design documents from `/home/khan/src/brick/specs/018-codex-provider-integration/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api.yaml`, `quickstart.md`

**Tests**: No explicit TDD or automated test requirement in the feature spec; tasks focus on implementation and manual independent test criteria per story.

**Organization**: Tasks are grouped by user story to preserve independent implementation and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared capability and documentation scaffolding used by all stories.

- [X] T001 Extend provider capability type surface for non-chat AI flows in `types/aiProvider.ts` [FR-007]
- [X] T002 Add reusable capability-check helper and actionable error builder in `server/utils/aiProviderSelection.ts` [FR-008]
- [X] T003 [P] Align provider contract schema with capability guard payload fields in `specs/018-codex-provider-integration/contracts/api.yaml` [FR-008]
- [X] T004 [P] Add Codex runtime configuration/failure prerequisites in `README.md` [FR-010]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core provider normalization and registry behaviors required before user-story implementation.

**⚠️ CRITICAL**: No user story implementation should start before this phase is complete.

- [X] T005 Harden registry initialization to isolate provider load failures from metadata listing in `server/utils/aiProviderRegistry.ts` [FR-001]
- [X] T006 Implement deterministic duplicate-provider registration behavior with warning logs in `server/utils/aiProviderRegistry.ts` [FR-003]
- [X] T007 [P] Centralize unknown-provider and invalid-model fallback normalization in `server/utils/aiProviderSelection.ts` [FR-003]
- [X] T008 [P] Ensure settings persistence/migration always writes normalized provider/model values in `stores/settings.ts` [FR-002]

**Checkpoint**: Provider registry and selection normalization are stable for story-level work.

---

## Phase 3: User Story 1 - Select Codex in Settings (Priority: P1) 🎯 MVP

**Goal**: Users can discover Codex provider status and select it only when capabilities allow.

**Independent Test**: Open Settings and verify Codex appears with model/capability metadata and accurate enabled/disabled behavior.

### Implementation for User Story 1

- [X] T009 [US1] Finalize Codex provider metadata, model defaults, and capability declarations in `server/utils/codexProvider.ts` [FR-001]
- [X] T010 [P] [US1] Render capability badges and disabled-state reason messaging for Codex in `components/settings/ProviderSelector.vue` [FR-002]
- [X] T011 [US1] Wire provider settings page states (loading/error/selection) for Codex metadata in `components/settings/SettingsModal.vue` [FR-002]
- [X] T012 [US1] Persist selected `{ providerId, providerModelKey }` and fallback behavior for new conversations in `stores/settings.ts` [FR-002]

**Checkpoint**: User Story 1 is independently functional and demoable.

---

## Phase 4: User Story 2 - Provider-Safe Selection Resolution (Priority: P1)

**Goal**: Server always resolves unsafe provider/model combinations to valid runtime-safe defaults.

**Independent Test**: Inject invalid provider/model values into `settings.json` and verify server selection resolution falls back deterministically.

### Implementation for User Story 2

- [X] T013 [US2] Implement strict provider/model normalization rules and default-model resolution in `server/utils/aiProviderSelection.ts` [FR-003]
- [X] T014 [P] [US2] Apply normalization in settings read/write APIs in `server/api/settings.get.ts` and `server/api/settings.post.ts` [FR-003]
- [X] T015 [P] [US2] Ensure `/api/ai/providers` returns stable metadata under duplicate/partial provider registration in `server/api/ai/providers.get.ts` [FR-003]
- [X] T016 [US2] Ensure conversation bootstrap uses normalized provider selection in `stores/chat.ts` and `composables/useChatStream.ts` [FR-009]

**Checkpoint**: User Story 2 is independently functional and safe under corrupted settings.

---

## Phase 5: User Story 3 - Codex Streaming Adapter (Priority: P2)

**Goal**: Codex can run chat streaming/resume through the same app-level stream event contract used by existing chat flows.

**Independent Test**: Select Codex, run new chat, confirm normalized `provider_json`/`done` flow and session continuity on follow-up messages.

### Implementation for User Story 3

- [X] T017 [US3] Extend provider runtime interface for stream dispatch, event translation, and resume lifecycle in `server/utils/aiProvider.ts` [FR-004]
- [X] T018 [US3] Implement Codex runtime streaming adapter with native-to-shared event mapping in `server/utils/codexProvider.ts` [FR-004]
- [X] T019 [P] [US3] Align Claude adapter with shared runtime contract to keep backward compatibility in `server/utils/claudeProvider.ts` [FR-009]
- [X] T020 [US3] Route HTTP chat streaming through provider abstraction dispatch in `server/api/chat.post.ts` [FR-005]
- [X] T021 [US3] Route websocket streaming and resume through provider abstraction in `server/routes/_ws.ts` [FR-005]
- [X] T022 [P] [US3] Preserve provider-specific session IDs across conversation lifecycle in `stores/chat.ts` and `composables/useChatStream.ts` [FR-006]
- [X] T031 [US3] Harden Codex stream parser mapping for tool call/result/permission events with regression coverage in `server/utils/codexStreamParser.ts` and `tests/server/codexStreamParser.test.ts` [FR-005] [FR-008]

**Checkpoint**: User Story 3 is independently functional without frontend event-contract regression.

---

## Phase 6: User Story 4 - Capability-Based Backend Guards (Priority: P2)

**Goal**: AI-assisted non-chat endpoints use capability checks and actionable unsupported responses instead of provider ID branching.

**Independent Test**: Run AI-assisted endpoints under Claude and Codex selections; verify success when capability exists and clear rejection when missing.

### Implementation for User Story 4

- [X] T023 [US4] Replace provider-ID gating with capability guard in `server/api/chat/generate-commit-message.post.ts` [FR-007]
- [X] T024 [P] [US4] Replace provider-ID gating with capability guard in `server/api/chat/worktree-commit.post.ts` [FR-007]
- [X] T025 [P] [US4] Replace provider-ID gating with capability guard in `server/api/rebase/ai-resolve.post.ts` [FR-007]
- [X] T026 [US4] Apply capability guard checks to additional AI-assisted chat lifecycle endpoints in `server/api/chat/finalize.post.ts` and `server/api/chat/rebase.post.ts` [FR-007]
- [X] T027 [US4] Standardize actionable unsupported-capability error text and payload fields in `server/utils/aiProviderSelection.ts` and `server/api/chat/generate-commit-message.post.ts` [FR-008]

**Checkpoint**: User Story 4 is independently functional with capability-driven behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation and compatibility verification across stories.

- [X] T028 [P] Validate Claude-default compatibility and fallback invariants in `server/utils/claudeProvider.ts` and `types/aiProvider.ts` [FR-009]
- [X] T029 [P] Expand Codex runtime troubleshooting, environment notes, and request-scoped model API tool-registration policy in `specs/018-codex-provider-integration/quickstart.md` [FR-010]
- [ ] T030 Run full quickstart validation pass and capture final acceptance notes in `specs/018-codex-provider-integration/quickstart.md` [FR-010]

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup): no dependencies.
- Phase 2 (Foundational): depends on Phase 1 and blocks all user-story phases.
- Phase 3 (US1) and Phase 4 (US2): both start after Phase 2 and can run in parallel.
- Phase 5 (US3): depends on Phase 2 and benefits from US1 + US2 completion (selection UX and normalization in place).
- Phase 6 (US4): depends on Phase 2 and can proceed parallel with late US3 work, but final guard messaging should align with US3 adapter behavior.
- Phase 7 (Polish): depends on all targeted stories complete.

### User Story Dependency Graph

- US1 (P1): depends on Foundational only.
- US2 (P1): depends on Foundational only.
- US3 (P2): depends on Foundational; integrates best after US1+US2.
- US4 (P2): depends on Foundational; can run alongside US3 once capability helper exists.

Graph: `Foundational -> {US1, US2} -> US3 -> Polish` and `Foundational -> US4 -> Polish`

### FR-to-Task Traceability

- FR-001: T005, T009
- FR-002: T008, T010, T011, T012
- FR-003: T006, T007, T013, T014, T015
- FR-004: T017, T018
- FR-005: T020, T021
- FR-006: T022
- FR-007: T001, T023, T024, T025, T026
- FR-008: T002, T003, T027
- FR-009: T016, T019, T028
- FR-010: T004, T029, T030

---

## Parallel Execution Examples

### User Story 1

```bash
Task: "T010 [US1] Render capability badges and disabled-state reason messaging in components/settings/ProviderSelector.vue"
Task: "T011 [US1] Wire provider settings page states in components/settings/SettingsModal.vue"
```

### User Story 2

```bash
Task: "T014 [US2] Apply normalization in server/api/settings.get.ts and server/api/settings.post.ts"
Task: "T015 [US2] Ensure stable provider metadata response in server/api/ai/providers.get.ts"
```

### User Story 3

```bash
Task: "T019 [US3] Align Claude adapter with shared runtime contract in server/utils/claudeProvider.ts"
Task: "T022 [US3] Preserve provider-specific session IDs in stores/chat.ts and composables/useChatStream.ts"
```

### User Story 4

```bash
Task: "T024 [US4] Capability guard for server/api/chat/worktree-commit.post.ts"
Task: "T025 [US4] Capability guard for server/api/rebase/ai-resolve.post.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 (US1) for immediate Codex visibility and safe selection UX.
3. Validate US1 independent test before expanding runtime scope.

### Incremental Delivery

1. Foundation first (Phases 1-2).
2. Deliver P1 stories (US1 + US2).
3. Add runtime support (US3).
4. Add capability-guarded backend coverage (US4).
5. Finish with polish/documentation.

### Parallel Team Strategy

1. One engineer on registry/normalization (US2 path).
2. One engineer on settings UX (US1 path).
3. After shared abstractions land, split US3 (runtime) and US4 (endpoint guards).

---

## Notes

- `[P]` tasks target separate files with no blocking dependency on unfinished tasks.
- Every task includes at least one `[FR-XXX]` tag for traceability.
- User-story tasks are independently testable using the story-level criteria above.
