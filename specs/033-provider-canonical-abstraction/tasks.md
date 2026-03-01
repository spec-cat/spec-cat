# Tasks: Canonical Multi-Provider Abstraction for Chat Streaming

**Input**: Design documents from `/specs/033-provider-canonical-abstraction/`  
**Prerequisites**: spec.md, plan.md  
**Feature Branch**: `033-provider-canonical-abstraction`

## Phase 1: Contract & Adapter Foundation

- [x] T001 Extend `AIProvider` contract with canonical event adapter API in `server/utils/aiProvider.ts`. [FR-001, FR-009]
- [x] T002 Add provider-level canonical adapter implementation for Claude in `server/utils/claudeProvider.ts`. [FR-001, FR-003, FR-008]
- [x] T003 Add provider-level canonical adapter implementation for Codex in `server/utils/codexProvider.ts`. [FR-001, FR-003, FR-008]

## Phase 2: Unified Permission Policy

- [x] T004 Create `server/utils/providerApprovalPolicy.ts` for centralized canonical permission interception and stderr inference helpers. [FR-004, FR-005, FR-006]
- [x] T005 Migrate WS permission interception flow to `providerApprovalPolicy` in `server/routes/_ws.ts`. [FR-002, FR-004, FR-005, FR-006]

## Phase 3: WS Canonical Pipeline Refactor

- [x] T006 Remove provider-ID transform branching from WS runtime and consume provider-owned canonical adapter output. [FR-002, FR-003, FR-009]
- [x] T007 Preserve retry/session reset semantics in WS flow during refactor. [FR-010]
- [x] T012 Harden Codex session ID discovery/propagation for envelope variants to preserve multi-turn context resume in `server/utils/codexProvider.ts` and `server/utils/codexStreamParser.ts`. [FR-008, FR-010]

## Phase 4: Client Canonical Rendering Cleanup

- [x] T008 Remove Codex-specific synthetic `session_init` injection in `composables/useChatStream.ts`. [FR-007, FR-008]
- [x] T009 Ensure client still handles canonical `session_init` and permission events without provider conditionals. [FR-007, FR-008]

## Phase 5: Validation

- [x] T010 Run `pnpm typecheck` and targeted provider-related tests; resolve regressions. [FR-008, FR-010]
- [ ] T011 Manual validation for Claude/Codex in ask/plan/auto modes (permission interception + rendering checks). [FR-002, FR-004, FR-006, FR-008]

## FR-to-Task Coverage

| FR | Task(s) |
|---|---|
| FR-001 | T001, T002, T003 |
| FR-002 | T005, T006, T011 |
| FR-003 | T002, T003, T006 |
| FR-004 | T004, T005, T011 |
| FR-005 | T004, T005 |
| FR-006 | T004, T005, T011 |
| FR-007 | T008, T009 |
| FR-008 | T002, T003, T008, T009, T010, T011, T012 |
| FR-009 | T001, T006 |
| FR-010 | T007, T010, T012 |
