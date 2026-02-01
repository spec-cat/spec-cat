# Tasks: Chat Permission System

**Input**: Design documents from `/specs/010-chat-permission-system/`
**Prerequisites**: spec.md, plan.md
**Feature Branch**: `010-chat-permission-system`
**Status**: Implemented (retroactive task log)

## Phase 1: Setup

- [x] T001 [P] Define `PermissionMode` union and mode labels/descriptions in `types/chat.ts` [FR-001, FR-002]
- [x] T002 [P] Add typed permission request and plan approval state shapes in chat types/store contracts [FR-003, FR-004]

## Phase 2: Foundational State

- [x] T003 Add `permissionMode` state and `setPermissionMode` action in `stores/chat.ts` [FR-001, FR-005]
- [x] T004 Add pending permission and pending plan approval state wiring in `stores/chat.ts` [FR-003, FR-004]
- [x] T005 Persist permission mode via settings store integration in `stores/settings.ts` and `stores/chat.ts` [FR-005]

## Phase 3: User Story 1 - Permission Control (P2)

**Goal**: User can choose mode and approve/deny runtime actions.

**Independent Test**: Select each mode in chat input, trigger tool call and plan proposal, confirm correct UI appears and response is sent.

- [x] T006 [US1] Implement permission mode dropdown in `components/chat/ChatInput.vue` for `plan|ask|auto|bypass` [FR-001, FR-002]
- [x] T007 [US1] Implement ask-mode permission request block (tool info + Allow/Deny actions) in `components/chat/ChatInput.vue` [FR-003]
- [x] T008 [US1] Implement plan approval block (Approve/Reject actions) in `components/chat/ChatInput.vue` [FR-004]
- [x] T009 [US1] Hook permission response actions to stream/store handlers in `composables/useChatStream.ts` and `stores/chat.ts` [FR-003, FR-004]

## Phase 4: Transport Integration

- [x] T010 Forward selected permission mode through websocket session init/flags in `server/routes/_ws.ts` [FR-001]
- [x] T011 Ensure stream lifecycle clears pending permission/plan states on resolution in `stores/chat.ts` and `composables/useChatStream.ts` [FR-003, FR-004]

## Phase 5: Polish

- [x] T012 Validate fallback default mode (`ask`) when persisted mode is missing/invalid in settings load path [FR-005]
- [x] T013 Manual verification of edge cases (disconnect during request, refresh persistence) using chat UI flows [FR-003, FR-005]

## Parallel Execution Notes

- `T001` and `T002` were parallelizable.
- UI tasks (`T006`, `T007`, `T008`) could be split in parallel after foundational state tasks.
- Transport task (`T010`) could run parallel to UI work once mode typing was finalized.
