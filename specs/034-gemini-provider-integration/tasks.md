---
description: "Task list template for feature implementation"
---

# Tasks: Gemini Provider Integration

**Input**: Design documents from `/specs/034-gemini-provider-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Phase 1: Setup & Models (Priority: P1)

**Goal**: Define the data structures for Gemini models.

- [x] T001 [US2] Create `types/gemini.ts` with `GeminiModel` types and `GEMINI_MODELS` definitions (Flash, Pro, Experimental).

## Phase 2: Implementation (Priority: P1)

**Goal**: Implement the core provider logic and CLI utilities.

- [x] T002 [US1] Create `server/utils/gemini.ts` with `getGeminiCliPath` function to reliably locate the CLI executable.
- [x] T003 [US1] Create `server/utils/geminiProvider.ts` implementing the `AIProvider` interface, configuring spawn arguments (`chat`, `--output-format stream-json`, `--model`), and stream parsing.
- [x] T004 [US1] Update `server/utils/aiProviderRegistry.ts` to import and register `geminiProvider`.
