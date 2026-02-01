# Implementation Plan: AI Provider Abstraction

**Branch**: `017-ai-provider-abstraction` | **Date**: 2026-02-10 | **Spec**: [spec.md](spec.md)
**Input**: Requirements from `/specs/017-ai-provider-abstraction/spec.md`

## Summary

The chat stack currently assumes a single provider CLI everywhere. This plan introduces an `AIProvider` abstraction plus a registry so the client can select any registered provider/model pair (Claude, Copilot, etc.), and the chat/session code just calls the provider interface instead of referencing provider-specific utilities. We will keep Claude as the initial provider implementation while moving its CLI/session logic behind the new interface, add the `/api/ai/providers` endpoint, persist the provider/model choice, and document the contract so future adapters (like Copilot) can plug in without touching the UI.

## Technical Context

**Language/Version**: TypeScript 5.6+ on Nuxt 3 (v3.16+) with Vue 3 (v3.5+) and Pinia (v2.2+)
**Runtime**: Nuxt server (Node.js 20) + client (modern browsers). Providers run via the existing CLI (Claude) or future SDKs.
**Dependencies**: Existing dependencies suffice (no new npm packages). We will add new utility/types files.
**Storage**: Settings persisted to `~/.spec-cat/projects/{hash}/settings.json`; chat store continues to track conversations in memory and persistent storage via existing utilities.
**Testing**: Manual per CLAUDE.md instructions (no automated tests since this is infra-focused).
**Constraints**: Provider registry must support hot reload if possible, settings migration from `claudeModel` must happen on first run, and chat features must behave identically after the refactor.

## Constitution Check

*GATE: Phase 1 design follows existing patterns (Nuxt APIs under `server/api`, utilities in `server/utils`, Pinia stores, `<script setup>`). No new dependencies, pnpm only, no server execution during AI session.*

All decisions follow the constitution: provider registry and settings migration live in server utils/API, UI touches remain frontend-only, and we leverage existing logging/perms.

## Project Structure

### Documentation (this feature)

```text
specs/017-ai-provider-abstraction/
├── plan.md               # This file
├── spec.md               # Feature specification
├── plan.md               # (dup?? but this file)  
```

### Source Code (repository root)

```text
server/
├── api/
│   └── ai/
│       └── providers.get.ts        # NEW: provider registry endpoint [FR-006]
│
├── utils/
│   ├── aiProvider.ts               # NEW: Provider interface, helper types [FR-003]
│   └── aiProviderRegistry.ts       # NEW: Registry loader/metadata caching [FR-001, FR-009]
│
types/
└── aiProvider.ts                    # NEW: Shared interfaces for providers/models [FR-003]

stores/
├── settings.ts                     # MODIFIED: persist {providerId, modelKey}, migrate old claudeModel [FR-002, FR-010]
├── chat.ts                         # MODIFIED: rename providerSessionId and route through provider interface [FR-004]

components/
├── settings/SettingsModal.vue      # MODIFIED: list providers/models from registry data [FR-007]
└── settings.vue                    # Modified accordingly

composables/
└── useChatStream.ts                # MODIFIED: call provider interface for streaming API [FR-005]
```

### Implementation Notes

- The registry loads provider modules (Claude provider, stubbed Copilot plan) and exposes metadata (capabilities, models, descriptions, supported features) so the UI can render badges and disable incompatible options.
- The chat store and `useChatStream` will request the active provider from a helper (`getActiveProvider()`) which consults the registry + settings entry. All session/resume logic lives inside the provider implementation, so we store `providerSessionId` (or similar) while keeping persistence.
- Settings migration will read the legacy `claudeModel` value and convert it to `{providerId: 'claude', modelKey: <model>}` on first load, writing it back to `settings.json`.

## FR Coverage Matrix

| FR | Plan Section | Implementation Target |
|----|--------------|-----------------------|
| FR-001 | Provider registry auto-discovery | `server/utils/aiProviderRegistry.ts` loads registered providers and caches metadata (capabilities, models). |
| FR-002 | Persist provider/model selection | `stores/settings.ts` now stores `providerId` + `modelKey`, migrates old `claudeModel`, and notifies `useToast`/UI on change. |
| FR-003 | `AIProvider` interface | `types/aiProvider.ts` + `server/utils/aiProvider.ts` define `AIProvider` methods (startSession, sendMessage, resumeSession, cancel, permissions, streaming) along with capability flags. |
| FR-004 | Provider-driven chat sessions | `stores/chat.ts`/`composables/useChatStream.ts` call the active provider for session lifecycle, store `providerSessionId`, and handle permissions/resume via provider callbacks. |
| FR-005 | Claude provider conformance | `server/utils/claudeProvider.ts` implements `AIProvider` using existing Claude CLI/session behavior (streaming, resume, permissions) without regression. |
| FR-006 | Provider API endpoint | `server/api/ai/providers.get.ts` returns registry metadata for the UI. |
| FR-007 | Settings UI shows providers/models | `components/settings/SettingsModal.vue` pulls provider list from `/api/ai/providers`, groups options by provider, and highlights capability badges + disabled states. |
| FR-008 | Capability declarations and feature guards | Providers declare support for permissions/streaming/auto-commit; UI and backend guard incompatible flows based on declared capabilities. |
| FR-009 | Registration doc & migration | `server/utils/aiProviderRegistry.ts` documents how providers register (module exports, capability flags) and supports hot reload. |
| FR-010 | Settings migration fallback | `stores/settings.ts` migration path ensures unknown selections fall back to Claude Sonnet and logs warnings. |
| FR-011 | Transitional Claude-only streaming gate | Streaming chat API path enforces a Claude-only constraint until non-Claude adapters ship, returning a clear unsupported-provider error for other providers. |

## Complexity Tracking

The abstraction touches foundational layers but keeps scope manageable: one new registry/API, new types, and provider refactors. Claude remains the implementation, minimizing risk while enabling future providers. Complexity is localized to `server/utils/aiProvider*` plus the stores/composables that already orchestrate chat flows, so the change fits within a single sprint.
