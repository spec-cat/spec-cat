# Implementation Plan: Canonical Multi-Provider Abstraction for Chat Streaming

**Branch**: `033-provider-canonical-abstraction` | **Date**: 2026-03-01 | **Spec**: [specs/033-provider-canonical-abstraction/spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-provider-canonical-abstraction/spec.md`
**Status**: Draft

## Summary

Refactor provider integration so each provider emits canonical `UIStreamEvent` objects through a unified provider contract, centralize permission interception into a provider-agnostic policy layer, and remove provider-specific client synthetic session initialization.

## Technical Context

**Language/Version**: TypeScript 5.6+, Nuxt 3.16+, Vue 3.5+  
**Primary Dependencies**: Nitro WebSocket route, existing provider CLI adapters, chat store/composable flow  
**Storage**: No new persistence, existing conversation/session data only  
**Testing**: Targeted unit tests + `pnpm typecheck` + manual stream validation  
**Target Platform**: Browser + Nitro server runtime  
**Project Type**: Nuxt full-stack app

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Permission prompts remain explicit in ask/plan mode |
| Simplicity Over Complexity | PASS | Remove provider branches from WS and client paths |
| Type Safety | PASS | Extend provider interfaces and policy types explicitly |
| Nuxt 3 + Pinia | PASS | Changes align with existing server/composable architecture |

## Project Structure

### Documentation (this feature)

```text
specs/033-provider-canonical-abstraction/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (targeted)

```text
server/utils/aiProvider.ts                 # Provider contract extensions (canonical adapter)
server/utils/claudeProvider.ts             # Provider-owned canonical mapping
server/utils/codexProvider.ts              # Provider-owned canonical mapping
server/utils/codexStreamParser.ts          # Codex envelope/session normalization
server/utils/providerApprovalPolicy.ts     # Centralized permission interception policy
server/routes/_ws.ts                       # Provider-agnostic canonical stream pipeline
composables/useChatStream.ts               # Remove codex-only synthetic session block injection
server/utils/uiAdapter.ts                  # Shared canonical mapping helpers reused by providers/policy
```

## Implementation Approach

1. Extend provider contract with canonical transformation entrypoint and wire stream runtime to use it.
2. Implement provider-owned canonical adapters for Claude and Codex, preserving current event behavior.
3. Introduce a centralized approval policy module and migrate WS interception logic into it.
4. Remove client-side Codex synthetic `session_init` injection path and rely on canonical session events.
5. Harden Codex session-ID extraction/propagation so context resume remains stable across envelope variants.
6. Validate compatibility with existing retry/session reset and permission flows.

## FR Coverage Matrix

| Requirement | Planned Files |
|-------------|---------------|
| FR-001 | `server/utils/aiProvider.ts`, `server/utils/claudeProvider.ts`, `server/utils/codexProvider.ts` |
| FR-002 | `server/routes/_ws.ts`, `server/utils/aiProvider.ts` |
| FR-003 | `server/utils/claudeProvider.ts`, `server/utils/codexProvider.ts`, `server/utils/uiAdapter.ts` |
| FR-004 | `server/utils/providerApprovalPolicy.ts`, `server/routes/_ws.ts` |
| FR-005 | `server/utils/providerApprovalPolicy.ts`, `server/routes/_ws.ts`, `server/utils/uiAdapter.ts` |
| FR-006 | `server/routes/_ws.ts`, `server/utils/providerApprovalPolicy.ts` |
| FR-007 | `composables/useChatStream.ts` |
| FR-008 | `server/routes/_ws.ts`, `composables/useChatStream.ts`, provider files |
| FR-009 | `server/utils/aiProviderRegistry.ts`, `server/utils/aiProvider.ts`, `server/routes/_ws.ts` |
| FR-010 | `server/routes/_ws.ts`, `server/api/chat.post.ts` (no behavior change expected) |

## Risks & Mitigations

- Risk: subtle event-shape regressions during adapter ownership move.
  - Mitigation: reuse existing `uiAdapter` transforms and keep canonical type guards.
- Risk: permission prompt behavior drift.
  - Mitigation: isolate policy module and keep existing heuristics, then regression-test ask/plan flow.
- Risk: Codex UX regression after removing synthetic `session_init`.
  - Mitigation: ensure canonical `session_init` is emitted server-side for Codex turns.

## Validation Plan

1. Run `pnpm typecheck`.
2. Run focused server tests touching provider parser/pipeline.
3. Manual WS validation for Claude and Codex: ask, plan, auto modes; permission allow/deny; resume retry path.
