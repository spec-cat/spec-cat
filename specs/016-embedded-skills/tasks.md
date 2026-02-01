# Tasks: Embedded Skills System

**Input**: Design documents from `/specs/016-embedded-skills/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.yaml

**Tests**: Not requested — user will test manually (per CLAUDE.md).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create type definitions and the skills directory structure needed by all subsequent phases.

- [x] T001 [P] Create TypeScript interfaces for SkillDefinition, SkillMetadata, SkillsListResponse, and SkillPromptResponse in `types/skill.ts`
- [x] T002 [P] Create `skills/` directory at project root with a `.gitkeep` placeholder

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side skill registry utility that ALL user stories depend on — skill loading, validation, parsing, and prompt rendering.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Implement `loadSkills()` function in `server/utils/skillRegistry.ts` — scan `skills/` directory, parse YAML frontmatter from `.md` files using the `yaml` package, validate required fields (id, name, description, icon, prerequisites, promptTemplate), skip malformed files with `console.warn`, always include built-in skills even when project `skills/` is missing, and apply ID collision precedence rules [FR-001, FR-002, FR-013, FR-014, FR-017]
- [x] T004 Implement `loadSkill()` function in `server/utils/skillRegistry.ts` — load a single skill by ID from `skills/{id}.md`, return `SkillDefinition | null` [FR-006]
- [x] T005 Implement `renderPrompt()` function in `server/utils/skillRegistry.ts` — replace `{{featureId}}`, `{{specsDir}}`, and `{{availableDocuments}}` template variables in the skill's `promptTemplate` with feature-specific context, return `RenderedPrompt` [FR-006]

**Checkpoint**: Skill registry utility is fully functional — skills can be loaded, validated, and prompts rendered.

---

## Phase 3: User Story 1 — Run Built-in Skill from Features Panel (Priority: P1) 🎯 MVP

**Goal**: Users can click a skill action on a feature card and have the skill's agent prompt sent to Claude in a chat conversation with real-time streaming results.

**Independent Test**: Click the "Better Spec" skill button on any feature card that has spec.md. Verify a conversation opens and Claude receives the rendered prompt, streaming results back in real-time.

### Implementation for User Story 1

- [x] T006 [US1] Create `GET /api/skills` endpoint in `server/api/skills/index.get.ts` — call `loadSkills()`, map results to `SkillMetadata[]` (strip `promptTemplate`), return `SkillsListResponse` [FR-015]
- [x] T007 [US1] Create `POST /api/skills/{skillId}/prompt` endpoint in `server/api/skills/[skillId]/prompt.post.ts` — read `featureId` from request body, validate featureId exists in `specs/`, call `loadSkill()` then `renderPrompt()` with feature context (resolve `specsDir` to absolute path, scan available documents), return `SkillPromptResponse`, handle 404 (skill not found) and 400 (missing featureId / feature dir not found) [FR-006]
- [x] T008 [US1] Create the `skills/better-spec.md` skill definition file with YAML frontmatter (id: better-spec, name: Better Spec, description: Validates spec documents against What/How/Track separation, icon: DocumentCheckIcon, prerequisites: [spec.md]) and markdown body containing the agent prompt template that instructs Claude to read and validate spec/plan/tasks documents against What/How/Track separation principle, producing a structured validation report with pass/fail items per document, cross-document consistency checks, and actionable remediation suggestions [FR-008, FR-009]
- [x] T009 [US1] Add `handleSkill(event: MouseEvent, featureId: string, skillId: string)` function in `components/features/FeaturesPanel.vue` — fetch rendered prompt from `POST /api/skills/{skillId}/prompt`, then create/reuse conversation (same logic as `handleCascade`: check `event.shiftKey` for forced new conversation, use `chatStore.findConversationByFeature()` / `chatStore.createConversation()`), rename conversation to `skill: {skillId} — {featureId}`, send rendered prompt as user message via `streamMessage()`, wire up all existing streaming infrastructure (addUserMessage, addAssistantMessage, startSession, startConversationStreaming) [FR-005, FR-006, FR-007, FR-011]
- [x] T010 [US1] Add skill fetching to `components/features/FeaturesPanel.vue` — add `ref<SkillMetadata[]>` for skills list, fetch from `GET /api/skills` on component mount (alongside existing features fetch), pass skills array as prop to each FeatureCard [FR-003]

**Checkpoint**: Users can run the better-spec skill from a feature card and see streaming results in the chat panel.

---

## Phase 4: User Story 2 — Discover Available Skills for a Feature (Priority: P1)

**Goal**: Feature cards display available skill action buttons alongside existing cascade actions, with prerequisite-aware enable/disable states and running indicators.

**Independent Test**: View any feature card and verify skill buttons appear after a visual separator. Verify buttons are disabled with tooltips when prerequisites are not met. Verify running state indicator when a skill is executing.

### Implementation for User Story 2

- [x] T011 [US2] Add skill action buttons to `components/features/FeatureCard.vue` — accept `skills` prop (`SkillMetadata[]`), render a visual separator (thin border/divider) after existing cascade action buttons, then render each skill as an icon button with distinct `retro-purple` color scheme, emit `'skill'` event with `(event, featureId, skillId)` on click [FR-003, FR-016]
- [x] T012 [US2] Implement prerequisite checking in `components/features/FeatureCard.vue` — for each skill, check if `skill.prerequisites.every(p => feature.files.some(f => f.filename === p))`, disable the button when prerequisites are not met, add tooltip showing which documents are missing (e.g., "Requires: plan.md, tasks.md") [FR-004]
- [x] T013 [US2] Implement icon resolution in `components/features/FeatureCard.vue` — create a static icon map object that maps skill icon identifier strings (e.g., `"DocumentCheckIcon"`) to imported @heroicons/vue components, fall back to `PuzzlePieceIcon` for unknown icons, use the resolved icon component in skill action buttons [FR-002]
- [x] T014 [US2] Implement running state indicator in `components/features/FeatureCard.vue` — check `chatStore.isConversationStreaming()` for the feature's conversation, when streaming show a spinner/pulse animation on the skill button and make it non-clickable [FR-010]
- [x] T015 [US2] Wire up skill event handling in `components/features/FeaturesPanel.vue` — listen for `@skill` event from FeatureCard, call `handleSkill(event, featureId, skillId)` [FR-003]

**Checkpoint**: Skills are fully discoverable on feature cards with prerequisite-aware states and running indicators.

---

## Phase 5: User Story 3 — Register and Manage Embedded Skills (Priority: P2)

**Goal**: Skills are auto-discovered from the `skills/` directory without code changes — adding a new `.md` file is all that's needed.

**Independent Test**: Create a new skill definition file (e.g., `skills/test-skill.md`) with valid YAML frontmatter, reload the features panel, and verify the new skill appears on all feature cards without any code changes. Then create a malformed skill file and verify it is skipped with a console warning.

### Implementation for User Story 3

- [x] T016 [US3] Verify and refine malformed file handling in `server/utils/skillRegistry.ts` — ensure `loadSkills()` handles these edge cases: missing YAML frontmatter (skip with warning), empty file (skip with warning), missing required fields (skip with warning listing which fields are missing), duplicate skill IDs (project skill overrides built-in on collision, duplicate project files keep first with warning), non-`.md` files in skills directory (ignore silently), skills directory does not exist (built-ins still load) [FR-014, FR-017]
- [x] T017 [US3] Remove `.gitkeep` from `skills/` directory (now that `skills/better-spec.md` exists from T008), ensure the `GET /api/skills` endpoint remains available even when project `skills/` is empty or missing by returning built-ins and valid discovered project skills [FR-001, FR-014]

**Checkpoint**: The skill registration system is robust — new skills can be added as markdown files and malformed files are handled gracefully.

---

## Phase 6: User Story 4 — Skill Execution with Conversation Integration (Priority: P2)

**Goal**: Skill execution integrates seamlessly with the existing conversation system — reusing conversations, respecting permissions, and following cascade patterns.

**Independent Test**: Run a skill for a feature, close and reopen the panel, run the skill again, and verify the existing conversation is reused. Hold Shift and click the skill to verify a new conversation is created. Verify the permission system prompts appear when in "plan" or "ask" mode.

### Implementation for User Story 4

- [x] T018 [US4] Verify Shift+click behavior in `handleSkill()` within `components/features/FeaturesPanel.vue` — ensure `event.shiftKey` correctly forces a new conversation instead of reusing the existing one, consistent with existing cascade behavior [FR-011]
- [x] T019 [US4] Verify permission system integration — ensure skill execution inherits the active permission mode from the existing permission system (no additional code needed, but verify the WebSocket/PTY streaming path respects `chatStore.permissionMode`) [FR-012]
- [x] T020 [US4] Verify conversation reuse for skills — ensure `findConversationByFeature(featureId)` correctly returns existing conversations for skill re-execution, and that `isConversationStreaming()` blocks new skill execution while one is active [FR-005]

**Checkpoint**: Skill execution is fully integrated with the conversation, permission, and worktree systems.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, visual refinements, and validation against all FRs.

- [x] T021 Verify that all existing cascade actions (Chat, Clarify, Plan, Tasks, Implement, Analyze) continue to work identically after skill buttons are added — zero regression in features panel functionality [SC-004]
- [x] T022 Verify the features panel loads skills alongside features without noticeable delay — skill actions should be visible within 3 seconds of panel mount [SC-001]
- [x] T023 Run quickstart.md validation — walk through all test scenarios described in `specs/016-embedded-skills/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001 for types) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (skill registry) — core execution flow
- **US2 (Phase 4)**: Depends on Phase 3 (T010 for skills prop, T009 for handleSkill) — UI discovery
- **US3 (Phase 5)**: Depends on Phase 2 (T003 for loadSkills) — can run in parallel with US1/US2
- **US4 (Phase 6)**: Depends on Phase 3 (T009 for handleSkill) — verification of integration
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1: Setup ──────────────────────────────────────────────────┐
                                                                 │
Phase 2: Foundational (T003-T005) ──────────────────────────────┤
                                                                 │
         ┌───────────────────────────────────────────────────────┘
         │
         ├──> Phase 3: US1 (T006-T010) ──> Phase 4: US2 (T011-T015)
         │                              ↘
         │                               Phase 6: US4 (T018-T020)
         │
         └──> Phase 5: US3 (T016-T017) [parallel with US1]

All stories complete ──> Phase 7: Polish (T021-T023)
```

### Within Each User Story

- Server endpoints before client-side UI
- Core functionality before polish/edge cases
- Type definitions before implementations

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 2**: T004 and T005 can run in parallel after T003 (same file but independent functions)
- **Phase 3**: T006 and T007 can run in parallel (different endpoint files), T008 in parallel with endpoints
- **Phase 4**: T011, T012, T013 touch the same file — must be sequential; T014 and T015 depend on T011
- **Phase 5**: T016 and T017 are sequential (same file + dependency)
- **US3 can run in parallel with US1/US2** (tests skill registry edge cases independently)

---

### FR Traceability

| FR | Task(s) |
|----|---------|
| FR-001 | T003 |
| FR-002 | T001, T008, T013 |
| FR-003 | T010, T011, T015 |
| FR-004 | T012 |
| FR-005 | T009, T020 |
| FR-006 | T005, T007, T009 |
| FR-007 | T009 |
| FR-008 | T008 |
| FR-009 | T008 |
| FR-010 | T014 |
| FR-011 | T009, T018 |
| FR-012 | T019 |
| FR-013 | T003 |
| FR-014 | T003, T016, T017 |
| FR-015 | T006 |
| FR-016 | T011 |
| FR-017 | T003, T016 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No test tasks generated — user will test manually per CLAUDE.md
- The `yaml` package (v2.8.2) is already a project dependency — no new installs needed
- Skills directory follows the same filesystem-discovery pattern as `specs/`

## FR Traceability Addendum (2026-02-14)

- [ ] T024 [Traceability] Add explicit mapping for prompt-rendering sub-requirements and running-state detail [FR-006a, FR-006b, FR-006c, FR-010a]
