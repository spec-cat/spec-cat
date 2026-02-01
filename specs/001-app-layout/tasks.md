# Tasks: App Layout System (4-Column Restructure)

**Input**: Design documents from `/specs/001-app-layout/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md

**Tests**: Manual testing only (per plan.md) — no automated test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (Nuxt 3 web application):

```text
layouts/                          # Nuxt layouts
components/layout/                # Layout shell components
components/features/              # Features panel (NEW)
components/conversations/         # Conversations panel (NEW)
components/chat/                  # Chat panel (MODIFY)
components/git/                   # Git graph (EXISTING)
components/settings/              # Settings modal (EXISTING)
stores/                           # Pinia stores
types/                            # TypeScript definitions
pages/                            # Route pages
composables/                      # Composable logic
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update type definitions and store to support the new 4-column layout

- [x] T001 [P] Update `types/layout.ts` — add `PanelDefinition` interface and `PANEL_DEFINITIONS` constant array with 4 panels (git-tree flex:3, features flex:2, conversations flex:2, chat flex:3); keep existing `ViewportSize` and `VIEWPORT_BREAKPOINTS`
- [x] T002 [P] Verify `stores/layout.ts` — confirm it only has viewport detection logic (`currentViewport`, `updateViewport`, `isMobile`, `isTablet`, `isDesktop`); no changes needed since sidebar state was already removed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Restructure `layouts/default.vue` to the 4-column flex container that ALL panels render within

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Restructure `layouts/default.vue` — replace existing layout with a 4-column flex container (`flex h-screen`); define 4 column `<div>` wrappers with `style="flex: 3"`, `style="flex: 2"`, `style="flex: 2"`, `style="flex: 3"` respectively; each column has `flex flex-col` and `border-l border-retro-border` (except first); add `overflow-x-auto` for small viewport support (FR-001e); keep viewport resize listener from `useLayoutStore`
- [x] T004 Simplify `pages/index.vue` — since all content is now rendered in layout columns, reduce `pages/index.vue` to a minimal/empty component (the layout drives all panel rendering via `layouts/default.vue`)

**Checkpoint**: Empty 4-column layout shell renders with correct proportions (30% | 20% | 20% | 30%)

---

## Phase 3: User Story 1 — 4-Column Layout with Panel Headers (Priority: P1) 🎯 MVP

**Goal**: Display 4-column layout with labeled panel headers ("Git Tree", "Features", "Conversations", "Chat"), application title "SPEC CAT v0.1.0", and settings gear icon

**Independent Test**: Load application; verify 4 columns visible with correct proportions, each column has a header label, "SPEC CAT v0.1.0" title visible, gear icon visible

**FR Coverage**: FR-001 (a–e), FR-007, NFR-001, NFR-002, NFR-003, NFR-004

### Implementation for User Story 1

- [x] T005 [US1] Add panel header row to each of the 4 columns in `layouts/default.vue` — each header is an `h-14 flex items-center px-4 border-b border-retro-border` div with `text-retro-text font-bold` label text ("Git Tree", "Features", "Conversations", panel title for Chat)
- [x] T006 [US1] Add "SPEC CAT v0.1.0" title and settings gear icon (`Cog6ToothIcon` from `@heroicons/vue/24/outline`) to the Git Tree panel header in `layouts/default.vue` — title on the left, gear icon button on the far right
- [x] T007 [US1] Add independent scroll regions to each column — content area below header gets `flex-1 overflow-y-auto` and the parent column gets `overflow-hidden` to prevent layout blowout (NFR-004)
- [x] T008 [US1] Wire settings gear icon to `showSettings` ref — clicking gear opens `SettingsModal`, import and render `<SettingsModal v-if="showSettings" @close="showSettings = false" />` in `layouts/default.vue`
- [x] T009 [US1] Apply retro-terminal theme classes to the layout container and panel borders (`bg-retro-black`, `text-retro-text`, `border-retro-border`) in `layouts/default.vue`

**Checkpoint**: User Story 1 complete — 4-column layout visible with labeled headers, correct proportions, independent scrolling, settings gear opens modal

---

## Phase 4: User Story 2 — Git Tree Panel (Priority: P1)

**Goal**: Git Tree (leftmost column, 30%) displays the git graph visualization

**Independent Test**: Load application; verify git graph renders in leftmost column with commit history and branch visualization

**FR Coverage**: FR-002 (a–c)

### Implementation for User Story 2

- [x] T010 [US2] Import `GitGraph` component and render it in the Git Tree column's scroll region in `layouts/default.vue` — pass `working-directory` prop from `/api/cwd` fetch (reuse existing pattern from current `layouts/default.vue` which already fetches CWD and renders GitGraph)
- [x] T011 [US2] Ensure GitGraph has explicit height constraints (`h-full` or `min-h-0`) within its flex column to prevent expansion beyond viewport in `layouts/default.vue`

**Checkpoint**: User Story 2 complete — git graph renders correctly in the leftmost panel with proper scrolling

---

## Phase 5: User Story 3 — Features Panel (Priority: P1)

**Goal**: Features (second column, 20%) displays spec/feature list with kanban-style status

**Independent Test**: Load application; verify features list appears in second column showing specs from `specs/` directory with status badges

**FR Coverage**: FR-003 (a–d)

### Implementation for User Story 3

- [x] T012 [P] [US3] Create `components/features/FeaturesPanel.vue` — panel component with header ("Features" label, `h-14`) and scrollable content area (`flex-1 overflow-y-auto`); import `useKanbanStore` to fetch feature list; display each feature with name, task count, status badge (todo/in-progress/done counts); add click handler to select feature (emit or store action); use retro-terminal theme classes
- [x] T013 [US3] Import and render `<FeaturesPanel />` in the Features column of `layouts/default.vue` — replace the placeholder header+content area with the component

**Checkpoint**: User Story 3 complete — features panel lists specs with status badges, clickable

---

## Phase 6: User Story 4 — Conversations Panel (Priority: P1)

**Goal**: Conversations (third column, 20%) displays conversation list with search, rename, and delete

**Independent Test**: Load application; verify conversation list in third column with search input, rename/delete actions on each conversation

**FR Coverage**: FR-004 (a–d)

### Implementation for User Story 4

- [x] T014 [P] [US4] Create `components/conversations/ConversationsPanel.vue` — panel component with header ("Conversations" label, `h-14`, "+" new conversation button) and scrollable content area; import `useChatStore` for conversation list; add search input with filter; render conversation items with title, timestamp, active state highlight; add rename (inline edit) and delete (with confirmation) actions; clicking a conversation sets `activeConversationId` in chat store to load it in Chat panel; use retro-terminal theme classes
- [x] T015 [US4] Import and render `<ConversationsPanel />` in the Conversations column of `layouts/default.vue` — replace the placeholder header+content area with the component

**Checkpoint**: User Story 4 complete — conversations panel lists conversations with search/filter, rename, delete, and click-to-load

---

## Phase 7: User Story 5 — Chat Panel Always Visible (Priority: P1)

**Goal**: Chat (rightmost column, 30%) is always visible with messages, input, streaming, and permission mode indicator — no toggle behavior

**Independent Test**: Load application; verify chat panel in rightmost column with message display, input area, streaming works, no toggle button

**FR Coverage**: FR-005 (a–e)

### Implementation for User Story 5

- [x] T016 [US5] Modify `components/chat/ChatPanel.vue` — remove resize handle (drag-to-resize left edge), remove close button (`XMarkIcon` close handler), remove slide-in transition, remove fixed pixel width; the component should render as a full flex child (width controlled by parent flex); keep all existing functionality: messages, input, streaming, permission mode, preview/rebase/finalize buttons
- [x] T017 [US5] Update Chat panel header in `components/chat/ChatPanel.vue` — show active conversation title or "New Chat" as header text (FR-005a); ensure permission mode indicator is visible (FR-005d)
- [x] T018 [US5] Import and render `<ChatPanel />` in the Chat column of `layouts/default.vue` — the component fills the entire column; no toggle mechanism, always rendered (FR-005e)
- [x] T019 [US5] Remove or deprecate `components/chat/ChatPanelToggle.vue` — this component is no longer needed since chat is always visible; remove its import from `layouts/default.vue`
- [x] T020 [US5] Update `composables/useChatPanel.ts` — remove toggle/open/close/resize logic that is no longer applicable; keep only shared state that ChatPanel still needs (or remove the composable entirely if ChatPanel no longer uses it)

**Checkpoint**: User Story 5 complete — chat panel renders in rightmost column, always visible, no toggle, streaming works

---

## Phase 8: User Story 6 — Settings Modal (Priority: P2)

**Goal**: Settings accessible via gear icon in header, opens as modal overlay with Claude Model selection

**Independent Test**: Click gear icon; verify modal opens with model selection; press ESC or click backdrop to close

**FR Coverage**: FR-006 (a–c)

### Implementation for User Story 6

- [x] T021 [US6] Verify `components/settings/SettingsModal.vue` works correctly in the new layout — confirm it overlays the 4-column layout properly, ESC key closes modal (FR-006b), backdrop click closes modal (FR-006b), Claude Model selection is functional (FR-006c)
- [x] T022 [US6] Verify gear icon button in Git Tree panel header (from T006) correctly toggles `showSettings` state and renders `SettingsModal` in `layouts/default.vue`

**Checkpoint**: User Story 6 complete — settings modal opens/closes correctly, model selection works

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup old components, verify edge cases, final validation

- [x] T023 [P] Remove unused sidebar components: delete `components/layout/AppSidebar.vue` (if exists), `components/layout/SidebarResizer.vue` (if exists), `components/layout/MobileNavToggle.vue` (if exists), `components/layout/SidebarPipelines.vue`
- [x] T024 [P] Remove or simplify `components/layout/AppMain.vue` — this component is no longer needed in the 4-column layout since each panel manages its own content area; remove if unused
- [x] T025 [P] Remove `composables/useLayoutPreferences.ts` (if exists) — sidebar-specific preferences are no longer applicable
- [x] T026 Handle small viewport behavior in `layouts/default.vue` — ensure `min-w-[320px]` and `overflow-x-auto` allow horizontal scrolling on viewports narrower than 4-column minimum (FR-001e, NFR-003)
- [x] T027 Add smooth CSS transitions for panel interactions in `layouts/default.vue` (NFR-002)
- [x] T028 Verify `ToastContainer` is still rendered in `layouts/default.vue` — ensure toast notifications work in the new layout
- [x] T029 Run quickstart.md verification checklist — validate all 9 verification steps from quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──────────────────► No dependencies
         │
         ▼
Phase 2: Foundational ───────────► BLOCKS all user stories
         │
         ├────────────────────────────────────────────────┐
         ▼                                                ▼
Phase 3: US1 (Layout Shell + Headers) ◄── BLOCKS US2-US6
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
Phase 4: US2       Phase 5: US3   Phase 6: US4   Phase 7: US5
(Git Tree)         (Features)    (Conversations) (Chat)
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                                 │
                                 ▼
                        Phase 8: US6 (Settings)
                                 │
                                 ▼
                        Phase 9: Polish
```

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|-------|------------|---------------------|
| US1 (Layout Shell) | Foundational only | None (first story) |
| US2 (Git Tree) | US1 | US3, US4, US5 |
| US3 (Features) | US1 | US2, US4, US5 |
| US4 (Conversations) | US1 | US2, US3, US5 |
| US5 (Chat) | US1 | US2, US3, US4 |
| US6 (Settings) | US1 | US2, US3, US4, US5 |

### Within Each User Story

- Panel components (FeaturesPanel, ConversationsPanel) can be created in parallel [P] since they are different files
- Integration into `layouts/default.vue` must happen sequentially per panel (same file)

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T001 (types/layout.ts) ─┬─ Parallel
T002 (stores/layout.ts) ┘
```

**Phases 4-7 (Panels)** — after US1 is complete:
```
T010-T011 (Git Tree)       ─┬─ Parallel (different components)
T012-T013 (Features)       ─┤
T014-T015 (Conversations)  ─┤
T016-T020 (Chat)           ─┘
```

**Phase 9 (Polish)**:
```
T023 (remove sidebar)       ─┬─ Parallel
T024 (remove AppMain)       ─┤
T025 (remove preferences)   ─┘
```

---

## Parallel Example: Panel Components

```bash
# Launch all panel component creation together (different files):
Task: "Create FeaturesPanel in components/features/FeaturesPanel.vue"
Task: "Create ConversationsPanel in components/conversations/ConversationsPanel.vue"
Task: "Modify ChatPanel in components/chat/ChatPanel.vue"

# Then sequentially integrate each into layouts/default.vue
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 — Layout shell with headers (T005-T009)
4. Complete Phase 4: User Story 2 — Git Tree panel (T010-T011)
5. **STOP and VALIDATE**: 4-column layout visible with git graph in leftmost column

### Incremental Delivery

1. **MVP**: Setup → Foundational → US1 → US2 = 4-column shell with git tree
2. **+Features**: Add US3 = Features panel populated
3. **+Conversations**: Add US4 = Conversations panel populated
4. **+Chat**: Add US5 = Chat always visible, no toggle
5. **+Settings**: Add US6 = Settings modal integrated
6. **Polish**: Final phase = Production ready

### Single Developer Sequential Order

```
T001 → T002
(Setup complete)

T003 → T004
(Foundational complete — 4-column shell)

T005 → T006 → T007 → T008 → T009
(US1 complete — headers, scrolling, settings gear)

T010 → T011
(US2 complete — git tree in leftmost panel)

T012 → T013
(US3 complete — features panel)

T014 → T015
(US4 complete — conversations panel)

T016 → T017 → T018 → T019 → T020
(US5 complete — chat always visible)

T021 → T022
(US6 complete — settings modal verified)

T023 → T024 → T025 → T026 → T027 → T028 → T029
(Polish complete — cleanup and verification)
```

---

## Task Summary

| Phase | Description | Task Count | Task IDs |
|-------|-------------|------------|----------|
| 1 | Setup | 2 | T001-T002 |
| 2 | Foundational | 2 | T003-T004 |
| 3 | US1: Layout Shell + Headers | 5 | T005-T009 |
| 4 | US2: Git Tree Panel | 2 | T010-T011 |
| 5 | US3: Features Panel | 2 | T012-T013 |
| 6 | US4: Conversations Panel | 2 | T014-T015 |
| 7 | US5: Chat Panel Always Visible | 5 | T016-T020 |
| 8 | US6: Settings Modal | 2 | T021-T022 |
| 9 | Polish | 7 | T023-T029 |
| **Total** | | **29** | |

---

## FR Traceability Matrix

| FR | Task(s) | Phase |
|----|---------|-------|
| FR-001 (4-Column Layout) | T003, T005, T007, T009 | 2, 3 |
| FR-001a (Git Tree 30%) | T003 | 2 |
| FR-001b (Features 20%) | T003 | 2 |
| FR-001c (Conversations 20%) | T003 | 2 |
| FR-001d (Chat 30%) | T003 | 2 |
| FR-001e (320px min viewport) | T003, T026 | 2, 9 |
| FR-002 (Git Tree Panel) | T010, T011 | 4 |
| FR-002a (Git Tree header) | T005 | 3 |
| FR-002b (GitGraph embed) | T010 | 4 |
| FR-002c (CWD from /api/cwd) | T010 | 4 |
| FR-003 (Features Panel) | T012, T013 | 5 |
| FR-003a (Features header) | T012 | 5 |
| FR-003b (List specs) | T012 | 5 |
| FR-003c (Kanban status) | T012 | 5 |
| FR-003d (Click to view) | T012 | 5 |
| FR-004 (Conversations Panel) | T014, T015 | 6 |
| FR-004a (Conversations header) | T014 | 6 |
| FR-004b (List with search) | T014 | 6 |
| FR-004c (Rename/delete) | T014 | 6 |
| FR-004d (Click to load) | T014 | 6 |
| FR-005 (Chat Panel) | T016, T017, T018 | 7 |
| FR-005a (Title header) | T017 | 7 |
| FR-005b (Streaming) | T016 | 7 |
| FR-005c (Input area) | T016 | 7 |
| FR-005d (Permission mode) | T017 | 7 |
| FR-005e (Always visible) | T018, T019 | 7 |
| FR-006 (Settings Modal) | T021, T022 | 8 |
| FR-006a (Gear icon) | T006, T022 | 3, 8 |
| FR-006b (ESC/backdrop close) | T021 | 8 |
| FR-006c (Model selection) | T021 | 8 |
| FR-007 (Header Display) | T005, T006 | 3 |
| NFR-001 (Viewport Detection) | T002 | 1 |
| NFR-002 (Smooth Transitions) | T027 | 9 |
| NFR-003 (320px Minimum) | T003, T026 | 2, 9 |
| NFR-004 (Independent Scroll) | T007 | 3 |

---

## Notes

- No automated tests — manual testing per plan.md
- All components use TypeScript strict mode
- Tailwind CSS with retro-terminal theme (cyan accents, `bg-retro-black`, `text-retro-text`)
- This is a restructure from the existing sidebar-based layout to a 4-column layout
- Existing components (`GitGraph`, `SettingsModal`, `ChatPanel`) are reused, not rewritten
- Two new panel components created: `FeaturesPanel.vue`, `ConversationsPanel.vue`
- Old sidebar components (`AppSidebar`, `SidebarResizer`, `MobileNavToggle`, `ChatPanelToggle`) are removed in Polish phase
