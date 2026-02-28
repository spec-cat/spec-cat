# Implementation Plan: Auto Mode

**Branch**: `013-auto-mode` | **Date**: 2026-02-28 | **Spec**: [/home/khan/src/brick/specs/013-auto-mode/spec.md](/home/khan/src/brick/specs/013-auto-mode/spec.md)
**Input**: Feature specification from `/home/khan/src/brick/specs/013-auto-mode/spec.md`

## Summary

Implement a background Auto Mode orchestrator that scans eligible feature specs, skips unchanged features by SHA-256 hashes, runs incremental speckit cascade steps (`plan -> tasks -> skill:better-spec`) in per-feature conversations/worktrees, integrates successful feature outputs into `sc/automode` in-cycle, and leaves all spec updates for human preview/finalize before main-branch merge.

## Technical Context

**Language/Version**: TypeScript 5.6+, Vue 3.5+, Nuxt 3.16+, Node.js runtime in Nitro server handlers  
**Primary Dependencies**: Pinia chat/settings stores, existing chat streaming pipeline (`composables/useChatStream.ts`), Nitro APIs under `server/api/*`, git/worktree utilities in `server/utils/*`, `@anthropic-ai/claude-code` provider stack  
**Storage**: Project-scoped JSON under `~/.spec-cat/projects/{hash}/` via `/home/khan/src/brick/server/utils/specCatStore.ts` plus existing conversation/settings persistence contracts (`/api/conversations`, `/api/settings`)  
**Testing**: Manual end-to-end UI validation, `pnpm typecheck`, targeted Vitest for new state-machine utilities if extracted  
**Target Platform**: Browser UI + local filesystem-backed Nitro server on developer workstation  
**Project Type**: Nuxt full-stack web application  
**Performance Goals**: Queue discovery under 3s (SC-002), first cascade kick-off within 5s (SC-001), bounded concurrency default 3 active cascades  
**Constraints**: Never modify implementation code (FR-007); reuse existing chat rendering/rules (FR-021, FR-026); single-cycle per activation (FR-017); no dev server run in AI session  
**Scale/Scope**: All eligible `specs/NNN-*` directories plus dedicated `constitution` unit, each as first-class conversation with preview/finalize lifecycle

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Sidebar toggle is explicit; disabling blocks new tasks and preserves manual stop authority. |
| Streaming-Native Architecture | PASS | Auto Mode uses existing conversation streaming pipeline and content block rendering. |
| CLI Parity | PASS | No new provider path; reuses current chat/tool execution semantics. |
| Multi-Project & History Support | PASS | State persists through project-scoped store APIs and conversation history model. |
| Keyboard-Driven Experience | PASS | No shortcut regressions; existing controls remain operable. |
| Simplicity Over Complexity | PASS | Reuse existing conversations, worktrees, and cascade primitives; add orchestration layer only. |
| Type Safety | PASS | New Auto Mode state/contracts will be typed and validated through existing TS patterns. |
| Stack Constraints | PASS | Nuxt/Vue/Pinia/Tailwind + existing Node/Nitro utilities only. |

## Project Structure

### Documentation (this feature)

```text
/home/khan/src/brick/specs/013-auto-mode/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── automode-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
/home/khan/src/brick/components/
├── features/FeaturesPanel.vue
├── features/AutoModeToggle.vue
├── settings/SettingsModal.vue
└── chat/
   ├── ConversationList.vue
   └── ConversationItem.vue

/home/khan/src/brick/composables/
└── useChatStream.ts

/home/khan/src/brick/stores/
├── chat.ts
├── autoMode.ts
└── settings.ts

/home/khan/src/brick/types/
├── autoMode.ts
└── chat.ts

/home/khan/src/brick/server/api/
├── automode/
│  ├── state.get.ts
│  ├── start.post.ts
│  ├── stop.post.ts
│  ├── status.get.ts
│  └── integration/
│     ├── prepare.post.ts
│     └── feature.post.ts
├── specs/features.get.ts
├── settings.get.ts
├── settings.post.ts
└── chat/worktree.post.ts

/home/khan/src/brick/server/utils/
├── autoModeStore.ts
├── autoModeHash.ts
├── autoModeDiscovery.ts
├── autoModeScheduler.ts
├── autoModeStepPlanner.ts
├── autoModeConversation.ts
├── autoModeIntegration.ts
├── specCatStore.ts
├── ensureChatWorktree.ts
└── git.ts

/home/khan/src/brick/server/plugins/
└── autoModeScheduler.ts
```

**Structure Decision**: Keep current Nuxt component/store/server split; add Auto Mode orchestration with minimal new modules and focused extensions to existing chat/settings contracts.

## Phase 0: Research Plan

### Research Tasks

- Research bounded-concurrency scheduler patterns for per-feature chat cascade dispatch in Pinia-driven UI workflows.
- Research SHA-256 hash persistence and incremental step restart rules (`spec.md`, `plan.md`, `tasks.md`) for deterministic queue skipping.
- Research branch-baseline orchestration for `sc/automode` lifecycle: base selection, fast-forward/reset preparation, in-cycle integration, and conflict recovery.
- Research safe cancellation semantics when manual user messages interrupt running automated cascades.
- Research constitution and `.speckit` synchronization strategy as a dedicated conversation unit with full review parity.

### Phase 0 Output

- `/home/khan/src/brick/specs/013-auto-mode/research.md`

## Phase 1: Design & Contracts

### Data Model Deliverable

- `/home/khan/src/brick/specs/013-auto-mode/data-model.md`

### Contracts Deliverable

- `/home/khan/src/brick/specs/013-auto-mode/contracts/automode-api.yaml`

### Quickstart Deliverable

- `/home/khan/src/brick/specs/013-auto-mode/quickstart.md`

### Agent Context Update

- Run `/home/khan/src/brick/.specify/scripts/bash/update-agent-context.sh codex`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Sidebar toggle component and feature panel header integration (`FeaturesPanel.vue` + new toggle component/store action). |
| FR-002 | Persist `autoModeEnabled` in existing settings API + project-scoped store persistence and restore on hydrate. |
| FR-003 | Queue builder scanning `specs/` and sorting alphabetically before dispatch. |
| FR-003a | Eligibility filter for `NNN-*` directories requiring `spec.md`. |
| FR-003b | SHA-256 comparison over `spec.md`, `plan.md`, `tasks.md` against stored successful hashes. |
| FR-004 | Conversation creation/reuse via existing `chatStore.findConversationByFeature` and `createConversation`. |
| FR-005 | Incremental cascade step resolver selecting start step from changed files; always stop before implement. |
| FR-006 | Per-conversation worktree reuse through existing `/api/chat/worktree` and conversation worktree fields. |
| FR-007 | Auto Mode command guardrails enforcing spec-only command chain and disallowing implementation edits. |
| FR-008 | Conversation list auto badge field (`Conversation.autoMode`) and item rendering updates. |
| FR-009 | Keep changes in conversation worktree until preview/finalize by user. |
| FR-010 | On disable: queued tasks moved to failed (`Auto Mode disabled`) and scheduler stops new starts. |
| FR-010a | Running tasks are allowed to complete and report terminal state normally. |
| FR-011 | Skip queue entries where feature already has active worktree conversation. |
| FR-012 | Dedicated `featureId: constitution` queue entry with constitution/.speckit command sequence. |
| FR-013 | Bounded parallel worker scheduler honoring configurable max active cascades. |
| FR-014 | No lifecycle fork; auto conversations remain standard rename/delete/preview/finalize/search entries. |
| FR-015 | Persist queue/session state and resume unfinished tasks after refresh. |
| FR-015a | Rehydrate logic resets persisted `running` tasks to `queued` before restart. |
| FR-016 | Settings page concurrency control (default 3) with persistence and validation. |
| FR-017 | Single-cycle engine transitions to idle after queue drain; no automatic re-scan until toggle restart. |
| FR-018 | Persist new hashes only on successful full cascade completion. |
| FR-019 | Toggle access unrestricted for authenticated users (no additional role checks). |
| FR-020 | Manual user message while auto cascade active aborts cascade and marks failed (`Manual interaction`). |
| FR-021 | Auto messages continue using structured `contentBlocks` pipeline (`text/tool_use/tool_result`). |
| FR-022 | Activation flow requires base branch selection then initializes/fast-forwards `sc/automode`. |
| FR-023 | Feature worktrees/conversations created from `sc/automode` baseline for the activation cycle. |
| FR-024 | Successful feature result integrated immediately into `sc/automode` before next completion bookkeeping. |
| FR-025 | Integration conflicts route through existing AI-assisted rebase resolution path. |
| FR-026 | No alternate prompt policy; auto mode invokes existing chat execution pipeline unchanged. |
| FR-027 | `skill:better-spec` is mandatory terminal step and success gate before marking feature success. |

## Post-Design Constitution Re-Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Explicit toggle state, disable semantics, and manual-interaction cancellation are defined. |
| Streaming-Native Architecture | PASS | Design keeps all Auto Mode execution inside existing streaming conversation runtime. |
| CLI Parity | PASS | No provider bypass; same request/permission/tool channels as normal chat. |
| Multi-Project & History Support | PASS | Uses project-scoped persistent stores and existing conversation records. |
| Keyboard-Driven Experience | PASS | No keyboard regression introduced by Auto Mode additions. |
| Simplicity Over Complexity | PASS | Extends current chat/worktree abstractions without alternate orchestration stack. |
| Type Safety | PASS | Data model defines strict typed states, transitions, and validation boundaries. |
| Stack Constraints | PASS | No non-approved frameworks or external services added. |

## Complexity Tracking

No constitution violations identified.
