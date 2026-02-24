# Implementation Plan: Chat Permission System

**Branch**: `010-chat-permission-system` | **Date**: 2026-02-14 | **Spec**: [specs/010-chat-permission-system/spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-chat-permission-system/spec.md`
**Status**: Implemented (retroactive plan documentation)
**Split from**: 007-ai-provider-chat

## Summary

Provide four permission modes (`plan`, `ask`, `auto`, `bypass`) for chat tool execution and plan approval flows. The UI exposes a mode selector in chat input, displays pending permission requests and plan approvals, and persists selected mode through settings. Server websocket session startup forwards the current mode to backend execution so runtime behavior matches user preference.

## Technical Context

**Language/Version**: TypeScript 5.6+, Nuxt 3.16+, Vue 3.5+  
**Primary Dependencies**: Pinia store, websocket route (`server/routes/_ws.ts`)  
**Storage**: Persisted settings (via settings store/API); default fallback `ask`  
**Testing**: Manual flow verification + typecheck  
**Target Platform**: Browser UI + Nitro server websocket  
**Project Type**: Web app feature spanning UI, store, stream layer, and server route

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Explicit allow/deny + approve/reject interactions |
| Simplicity Over Complexity | PASS | Single mode selector and direct store-backed state |
| Type Safety | PASS | `PermissionMode` union and typed permission payloads |
| Nuxt 3 + Pinia | PASS | Implemented through existing store/composable patterns |

## Project Structure

```text
types/chat.ts                         # PermissionMode + labels/descriptions
stores/chat.ts                        # permissionMode state, pending requests/approvals
stores/settings.ts                    # persisted permissionMode setting
components/chat/ChatInput.vue         # selector UI + permission / plan approval blocks
composables/useChatStream.ts          # stream handlers for pending permission/plan approval
server/routes/_ws.ts                  # websocket permission mode forwarding
```

## FR Coverage Matrix

| FR | Description | Implemented Files |
|----|-------------|-------------------|
| FR-001 | 4 permission modes | `types/chat.ts`, `stores/chat.ts`, `components/chat/ChatInput.vue`, `server/routes/_ws.ts` |
| FR-002 | Selector dropdown with visual affordance | `components/chat/ChatInput.vue` |
| FR-003 | Ask-mode permission request UI (Allow/Deny) | `components/chat/ChatInput.vue`, `stores/chat.ts`, `composables/useChatStream.ts` |
| FR-004 | Plan-mode approval UI (Approve/Reject) | `components/chat/ChatInput.vue`, `stores/chat.ts`, `composables/useChatStream.ts` |
| FR-005 | Persist selected mode | `stores/settings.ts`, `stores/chat.ts`, `server/api/settings.*` integration path |

## Complexity Tracking

No constitution violations identified.
