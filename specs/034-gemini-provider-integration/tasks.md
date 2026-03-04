---
description: "Task list template for feature implementation"
---

# Tasks: Gemini Provider Integration

**Input**: Design documents from `/specs/034-gemini-provider-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: Setup & Models (Priority: P1)

**Goal**: Define the data structures for Gemini models.

- [x] T001 [US2] [FR-005] Create `types/gemini.ts` with `GeminiModel` types and `GEMINI_MODELS` definitions (Flash, Pro, Experimental).

## Phase 2: Implementation (Priority: P1)

**Goal**: Implement the core provider logic and CLI utilities.

- [x] T002 [US1] [FR-002] Create `server/utils/gemini.ts` with `getGeminiCliPath` function to reliably locate the CLI executable.
- [x] T003 [US1] [FR-001] [FR-003] [FR-004] Create `server/utils/geminiProvider.ts` implementing the `AIProvider` interface, configuring spawn arguments (`chat`, `--output-format stream-json`, `--model`), and stream parsing.
- [x] T004 [US1] [FR-006] Update `server/utils/aiProviderRegistry.ts` to import and register `geminiProvider`.
- [x] T005 [US1] [FR-004] Emit canonical error payloads for Gemini terminal failures (`result.status != success` and explicit `error` events) in `server/utils/geminiProvider.ts` with nested error-message extraction.
- [x] T006 [US1] [FR-004] Add Gemini provider regression coverage for canonical error event emission in `tests/server/geminiProvider.test.ts`.

## Requirements Coverage Summary

All functional requirements from spec.md are covered:

| Requirement | Task(s) | Status |
|-------------|---------|---------|
| FR-001 (AIProvider interface) | T003 | ✅ Complete |
| FR-002 (CLI location) | T002 | ✅ Complete |
| FR-003 (spawn with stream-json) | T003 | ✅ Complete |
| FR-004 (JSON parsing) | T003, T005, T006 | ✅ Complete |
| FR-005 (three models) | T001 | ✅ Complete |
| FR-006 (registry) | T004 | ✅ Complete |
