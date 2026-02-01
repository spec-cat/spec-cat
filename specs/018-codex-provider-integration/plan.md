# Implementation Plan: Codex Provider Integration

**Branch**: `018-codex-provider-integration` | **Date**: 2026-02-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/018-codex-provider-integration/spec.md`

## Summary

Codex is already listed as planned metadata but is non-runnable. This plan completes provider-safe selection, capability-based backend guards, and a Codex streaming adapter that emits the same app-level stream events as Claude paths. Claude remains default and backward-compatible while Codex becomes selectable only when runtime capability requirements are met.

## Technical Context

**Language/Version**: TypeScript 5.6+, Nuxt 3.16+, Vue 3.5+, Pinia 2.2+
**Primary Dependencies**: Existing repo dependencies only (`@anthropic-ai/claude-code` for Claude path, Node child process/fs APIs, Nitro server runtime)
**Storage**: Filesystem-backed settings at `~/.spec-cat/projects/{hash}/settings.json`; conversation session state in existing chat store persistence
**Testing**: Manual testing only (project standard) + `pnpm` typecheck/lint as guardrails
**Target Platform**: Nuxt fullstack app (Node.js server + browser client)
**Project Type**: Web application (single Nuxt repo with server APIs/routes)
**Performance Goals**: Preserve current streaming responsiveness; no additional round trips in chat stream path beyond provider adapter translation
**Constraints**: No dev server run in agent session; `pnpm` only; preserve current event contract (`provider_json`, `done`, `error`, etc.); keep Claude default behavior unchanged; tool definitions are attached per model API request (request-scoped) instead of startup-time global registration
**Scale/Scope**: Two provider implementations (Claude + Codex), one provider registry, chat API + websocket paths, and at least three capability-guarded backend AI endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Principle I (User Control First): PASS. Permission mode behavior remains unchanged and provider capability checks fail early with actionable errors.
- Principle II (Streaming-Native): PASS. Codex adapter must emit the same incremental stream event contract consumed by existing composables/stores.
- Principle III (CLI Parity): PASS. Codex integration is planned through provider abstraction with CLI-style streaming/session semantics to match existing runtime model.
- Principle VI (Simplicity): PASS. Reuse existing provider registry, selection resolver, and stream handlers instead of introducing parallel orchestration.
- Principle VII (Type Safety): PASS. Provider capabilities, selection resolution, and adapter outputs remain fully typed.
- Technology constraints: PASS. No new SDK dependency required in plan; integration is via existing server/runtime patterns.

**Post-Phase 1 Re-check**: PASS. Data model and contracts keep one canonical provider event contract and capability matrix, avoid hardcoded provider branches in business endpoints, and preserve existing architecture boundaries.

## FR Coverage Matrix

| FR | Requirement | Plan Coverage | Primary Files |
|----|-------------|---------------|---------------|
| FR-001 | Registry includes Codex metadata | Codex provider metadata finalized with models + capabilities and deterministic registry init behavior | `server/utils/codexProvider.ts`, `server/utils/aiProviderRegistry.ts` |
| FR-002 | Settings/UI show availability and block incompatible selections | Provider selector uses capability checks with explicit disable reasons; persistence writes normalized provider/model pair | `components/settings/ProviderSelector.vue`, `components/settings/SettingsModal.vue`, `stores/settings.ts` |
| FR-003 | Normalize invalid provider/model combinations | Selection resolver guarantees fallback for unknown provider and invalid model key | `server/utils/aiProviderSelection.ts` |
| FR-004 | Chat streaming routes by provider abstraction and supports Codex adapter | Chat API + websocket route runtime dispatch through provider adapter instead of `providerId !== 'claude'` hard gate | `server/api/chat.post.ts`, `server/routes/_ws.ts`, `server/utils/aiProvider.ts` |
| FR-005 | Map provider-native events to shared contract | Codex stream translator emits canonical app events (`provider_json`, `done`, `error`) and canonical tool/permission payloads for shared renderer compatibility | `server/utils/codexProvider.ts`, `server/utils/aiProvider.ts`, `server/utils/codexStreamParser.ts` |
| FR-006 | Provider-agnostic session resume handling | Session state stores provider-specific session token while keeping generic conversation schema | `types/chat.ts`, `stores/chat.ts`, `composables/useChatStream.ts`, `server/routes/_ws.ts` |
| FR-007 | Backend guards use capabilities, not provider IDs | Replace provider ID hardcoded checks with provider capability checks in AI endpoints | `server/api/rebase/ai-resolve.post.ts`, `server/api/chat/generate-commit-message.post.ts`, `server/api/chat/worktree-commit.post.ts` |
| FR-008 | Unsupported capability errors are actionable | Standardized capability error payloads include missing capability and next action text | `server/utils/aiProviderSelection.ts`, affected server API handlers |
| FR-009 | Claude default behavior remains compatible | Claude remains default provider/model fallback and stream behavior unchanged | `types/aiProvider.ts`, `stores/settings.ts`, `server/utils/claudeProvider.ts` |
| FR-010 | Integration docs for Codex config/tool-registration lifecycle/failure modes | Quickstart + runtime notes document required runtime env/binary, request-scoped tool registration flow, and expected failure messages | `specs/018-codex-provider-integration/quickstart.md` |

## Project Structure

### Documentation (this feature)

```text
specs/018-codex-provider-integration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── api/
│   ├── ai/providers.get.ts
│   ├── chat.post.ts
│   ├── chat/generate-commit-message.post.ts
│   ├── chat/worktree-commit.post.ts
│   └── rebase/ai-resolve.post.ts
├── routes/_ws.ts
└── utils/
    ├── aiProvider.ts
    ├── aiProviderRegistry.ts
    ├── aiProviderSelection.ts
    ├── claudeProvider.ts
    └── codexProvider.ts

components/settings/
├── ProviderSelector.vue
└── SettingsModal.vue

stores/
└── settings.ts

composables/
└── useChatStream.ts

types/
├── aiProvider.ts
└── chat.ts
```

**Structure Decision**: Existing Nuxt fullstack layout is retained; this feature extends provider utilities, stream routing, and capability guards with no new architectural layers.

## Complexity Tracking

No constitution violations require exception handling.
