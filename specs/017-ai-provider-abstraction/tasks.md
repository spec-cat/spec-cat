# Task List: AI Provider Abstraction

**Branch**: `017-ai-provider-abstraction` | **Date**: 2026-02-10 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Tasks

- [ ] T001 [FR-001][FR-009][US3] Implement provider registry loader (`server/utils/aiProviderRegistry.ts`) that discovers provider modules, caches metadata (name, description, capabilities, model list), and exposes hot-reload friendly hooks; include documentation for registering new providers.
- [ ] T002 [FR-003][FR-005][US2] Define `AIProvider` interface/types (`types/aiProvider.ts` + `server/utils/aiProvider.ts`) covering session lifecycle, streaming, permission handling, capability flags, and model metadata.
- [ ] T003 [FR-005][FR-008][US2] Create `server/utils/claudeProvider.ts` (or similar) implementing `AIProvider` using the existing Claude CLI/session logic so current behavior keeps working through the abstraction, including session IDs and pause/resume.
- [ ] T004 [FR-006][US3] Add `/api/ai/providers` endpoint (`server/api/ai/providers.get.ts`) that reads from the registry and returns provider metadata for the client.
- [ ] T005 [FR-002][FR-010][US1] Refactor `stores/settings.ts` to persist `{providerId, modelKey}` selection, migrate legacy `claudeModel`, and expose helper to get the active provider/model.
- [ ] T006 [FR-004][US1] Update `stores/chat.ts` plus `composables/useChatStream.ts` to replace Claude-specific session handling with provider-agnostic session IDs and to fetch the active provider from the registry for new messages.
- [ ] T007 [FR-007] Modify the Settings UI (`components/settings/SettingsModal.vue` and `pages/settings.vue`) to fetch provider metadata from `/api/ai/providers`, render grouped provider/model options with capability badges, and allow the user to pick a provider/model.
- [ ] T008 [FR-003][US1] Ensure permission-mode toggles and streaming code paths can disable provider options that lack required capabilities (e.g., warning when provider doesn't support permission prompts).
- [ ] T009 [FR-004][FR-005][US4] Audit other code that references `providerSessionId` or provider-specific utilities and reroute them through the new provider interface (auto-commit helpers, conflict resolution, auto mode scheduler, etc.).
- [ ] T010 [FR-002][US4] Write migration logic so old `claudeModel` values are translated into `{providerId: 'claude', modelKey: <value>}` when settings are loaded the first time.
- [ ] T011 [FR-011][US2] Add a transitional streaming guard in the chat API flow that rejects non-Claude providers with a clear unsupported-provider error until provider-specific streaming adapters are implemented.
