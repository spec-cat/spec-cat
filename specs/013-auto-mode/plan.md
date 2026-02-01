# Implementation Plan: Auto Mode

**Branch**: `013-auto-mode` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-auto-mode/spec.md`

## Summary

Auto Mode is a background scheduler that automatically runs the speckit workflow (plan → tasks → skill:better-spec → analyze) for all spec units. It reuses the existing conversation system, worktree isolation, and cascade pipeline. The implementation extends the existing `AutoModeScheduler` with concurrent processing (configurable, default 3), adds session persistence for page-refresh resilience, adds an `autoMode` badge to conversations, and provides a concurrency setting in the settings page. All spec changes remain in worktree branches for human review via the standard preview/finalize flow.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @anthropic-ai/claude-code (v1.0.108), @heroicons/vue, Tailwind CSS
**Storage**: localStorage (`spec-cat-conversations`, `spec-cat-settings`, `spec-cat:auto-mode-enabled`), filesystem (`~/.spec-cat/projects/{hash}/auto-mode-session.json` for server-side session persistence)
**Testing**: Manual testing per CLAUDE.md
**Target Platform**: Web (Nuxt 3 SSR + client)
**Project Type**: web
**Performance Goals**: First cascade begins within 5 seconds of enabling (SC-001), spec discovery within 3 seconds (SC-002)
**Constraints**: Up to N concurrent Claude CLI processes (default 3), localStorage limit ~5MB
**Scale/Scope**: 10-50 spec directories typical, up to 100 conversations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User Control First | PASS | Auto Mode requires explicit toggle activation. Human review via preview/finalize before merging to main. Abort via toggle-off. |
| II. Streaming-Native Architecture | PASS | Auto Mode uses Claude Code SDK `query()` directly (bypass mode). Status updates stream via WebSocket to client. |
| III. CLI Parity | PASS | Auto Mode runs actual speckit commands via Claude CLI — same as manual cascade. |
| IV. Multi-Project & History Support | PASS | Conversations are persisted in localStorage. Each conversation is associated with a feature via `featureId`. |
| V. Keyboard-Driven Experience | N/A | Auto Mode toggle is a single button click. No keyboard shortcut needed. |
| VI. Simplicity Over Complexity | PASS | Extends existing patterns (conversation, cascade, worktree). No new abstractions — only 1 new field on Conversation, concurrency setting in existing settings store. |
| VII. Type Safety | PASS | All new fields and interfaces are typed. Existing types extended with optional fields for backwards compatibility. |

**Technology Constraints**:
- Nuxt 3 + Vue 3 + TypeScript ✓
- Pinia for state ✓
- Tailwind CSS ✓
- `@anthropic-ai/claude-code` SDK ✓
- No new external dependencies ✓

**GATE RESULT**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-auto-mode/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: architecture overview
├── contracts/
│   └── api.md           # Phase 1: API contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
types/
├── chat.ts              # Extended: Conversation.autoMode field
└── autoMode.ts          # Extended: AutoModePersistedSession, AutoModeConfig.concurrency

stores/
├── chat.ts              # No change — conversation CRUD already supports featureId
├── autoMode.ts          # Extended: pass concurrency to toggle, persist state
└── settings.ts          # Extended: autoModeConcurrency field

server/
├── utils/
│   └── autoModeScheduler.ts  # Extended: concurrent processing, session persistence, constitution
├── api/
│   └── auto-mode/
│       └── toggle.post.ts    # Extended: accept concurrency parameter
└── routes/
    └── auto-mode-ws.ts       # No change — broadcast already supports all message types

components/
├── chat/
│   └── ConversationItem.vue  # Extended: "auto" badge display
├── autoMode/
│   ├── AutoModeToggle.vue    # No change — already implemented
│   └── AutoModeStatus.vue    # No change — already implemented
└── settings/
    └── SettingsModal.vue     # Extended: concurrency slider

pages/
└── settings.vue              # Extended: concurrency setting
```

**Structure Decision**: Nuxt 3 web application. All changes modify existing files — no new files needed. The project follows the established Nuxt 3 convention of pages/, components/, composables/, stores/, server/, and types/ directories.

## FR Coverage Matrix

| FR | Description | Plan Section | Design Artifact |
|----|-------------|--------------|-----------------|
| FR-001 | On/off toggle in sidebar | Already implemented (AutoModeToggle.vue) | — |
| FR-002 | Persist enabled state | Already implemented (localStorage) | — |
| FR-003 | Scan spec dirs, build queue | autoModeScheduler.ts `discoverFeatures()` — already implemented | — |
| FR-004 | Create conversation per feature | autoModeScheduler.ts `processFeature()` — needs conversation creation | data-model.md |
| FR-005 | Run plan → tasks → skill:better-spec → analyze cascade | autoModeScheduler.ts `runSpeckitStep()` + skill prerequisite flow | — |
| FR-006 | Isolated worktree per conversation | worktreeResolver.ts `resolveWorktree()` — already implemented | — |
| FR-007 | Update specs via cascade (no impl changes) | Auto Mode sequence updates only specs and stops before implement | — |
| FR-008 | "auto" badge on conversations | ConversationItem.vue — needs `autoMode` field check | data-model.md |
| FR-009 | Results stay in worktree until human review | Already enforced — no auto-finalize in scheduler | — |
| FR-010 | Graceful stop on disable | autoModeScheduler.ts `stopProcessing()` — already implemented | — |
| FR-011 | Skip features with active streaming | autoModeScheduler.ts `findWorktreeByFeature()` check — already implemented | — |
| FR-012 | Constitution conversation | autoModeScheduler.ts — needs constitution special case | research.md R-005 |
| FR-013 | Concurrent processing (configurable N) | autoModeScheduler.ts — needs concurrent pool pattern | research.md R-003 |
| FR-014 | Full conversation lifecycle | Conversation entity inherits all CRUD ops — no change | — |
| FR-015 | Queue state persistence | autoModeScheduler.ts — needs file-based session persistence | research.md R-004 |
| FR-016 | Concurrency setting in settings page | settings.ts + SettingsModal.vue — needs new field | data-model.md |
| FR-017 | Single cycle per activation | Already implemented — `runCycle()` processes once | — |

## Complexity Tracking

> No constitution violations to justify.

*All changes follow existing patterns. No new abstractions, no new dependencies, no new architectural layers.*

## FR Coverage Addendum (2026-02-14)

| FR | Description | Plan Section | Design Artifact |
|----|-------------|--------------|-----------------|
| FR-003a | Queue eligibility: `NNN-*` + `spec.md` required | Queue discovery rules | data-model.md |
| FR-003b | SHA-256 unchanged feature skip | Queue discovery rules | research.md |
| FR-010a | Running tasks complete naturally on disable | Disable semantics | data-model.md |
| FR-015a | Resume resets persisted `running` to `queued` | Resume semantics | data-model.md |
