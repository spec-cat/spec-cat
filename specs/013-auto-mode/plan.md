# Implementation Plan: Auto Mode

**Branch**: `013-auto-mode` | **Date**: 2026-02-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-auto-mode/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Auto Mode provides a background scheduler that automatically runs the speckit workflow for each spec unit, finds discrepancies between implementation and specs, and updates specs to match the current codebase. It reuses the existing chat UI and conversation system, creating one conversation per spec unit with a cascade pipeline (plan → tasks → skill:better-spec). The feature includes an on/off toggle in the UI, processes specs concurrently (configurable limit), and requires human review via the standard preview/finalize flow before merging to main.

## Scope Guardrails *(mandatory)*

### Owned Files

- `stores/chat.ts` - AutoModeState type and auto mode state management methods only
- `components/chat/ChatSidebar.vue` - Auto Mode toggle button addition only
- `components/conversations/ConversationListItem.vue` - Auto Mode badge display logic only
- `composables/useAutoMode.ts` - New file, fully owned by this feature
- `server/api/automode/[...].ts` - New API endpoints, fully owned by this feature
- `pages/settings.vue` - Auto Mode concurrency setting addition only

### Do Not Edit

- `009-conversation-management` owned files (conversation core logic)
- `011-chat-worktree-integration` owned files (worktree integration logic)
- `012-cascade-automation` owned files (cascade pipeline logic)
- `server/api/claude/` - Claude integration endpoints
- `server/api/conversations/` - Conversation management endpoints
- `server/api/worktrees/` - Worktree management endpoints
- Core constitution files or .speckit configuration

### Parallelization Notes

- Auto Mode toggle UI can be developed independently of queue management logic
- Conversation badge display can be implemented separately from Auto Mode state management
- Settings page concurrency control can be added in parallel with main feature
- Constitution conversation handling can be implemented as a separate task after core queue processing works

## Technical Context

**Language/Version**: TypeScript 5.6+, Node.js runtime via Nuxt 3.16+
**Primary Dependencies**: Nuxt 3.16+, Vue 3.5+, Pinia 2.2+, @anthropic-ai/claude-code SDK
**Storage**: localStorage for settings persistence, existing chat store for runtime state, filesystem-backed conversation persistence
**Testing**: Manual testing via UI interactions, TypeScript type checking
**Target Platform**: Web browser (Chrome/Firefox/Safari), Linux server for Nitro backend
**Project Type**: web - Nuxt 3 universal application
**Performance Goals**: Sub-second UI response for toggle actions, concurrent processing of up to N specs (configurable, default 3)
**Constraints**: Must reuse existing conversation/cascade infrastructure, no new backend services, human review required before main branch merge
**Scale/Scope**: Typical project has 10-50 spec directories, each cascade takes 30s-5min depending on complexity

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

- **I. User Control First**: ✅ PASS - Auto Mode has explicit on/off toggle, all changes require human review via preview/finalize
- **II. Streaming-Native Architecture**: ✅ PASS - Reuses existing streaming conversation infrastructure
- **III. CLI Parity**: ✅ PASS - Uses same underlying conversation and cascade mechanisms as CLI
- **IV. Multi-Project & History Support**: ✅ PASS - Creates standard conversations that integrate with history system
- **V. Keyboard-Driven Experience**: ✅ PASS - No new keyboard shortcuts needed, existing shortcuts work in Auto Mode conversations
- **VI. Simplicity Over Complexity**: ✅ PASS - Reuses existing systems, minimal new code, no over-engineering
- **VII. Type Safety**: ✅ PASS - Will use TypeScript with strict mode for all new code

### Technology Constraints

- **Stack Requirements**: ✅ PASS - Uses Nuxt 3, Vue 3, TypeScript, Pinia, Tailwind CSS
- **Dependencies**: ✅ PASS - No new external dependencies, uses @anthropic-ai/claude-code SDK via existing integration

### Development Standards

- **Code Organization**: ✅ PASS - Follows established patterns (composables, components, stores, server utils)
- **Testing Approach**: ✅ PASS - Manual testing for UI, TypeScript type checking

**GATE RESULT**: ✅ ALL CHECKS PASS - No constitution violations

### Post-Design Re-check (Phase 1 Complete)

All constitution principles remain satisfied after design phase:
- Data model follows existing patterns (minimal Conversation extension)
- API contracts use standard REST patterns
- No new external dependencies introduced
- Architecture reuses existing infrastructure
- Type safety maintained throughout

**FINAL GATE RESULT**: ✅ ALL CHECKS PASS - Design compliant with constitution

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Nuxt 3 Web Application Structure
components/
├── chat/
│   └── ChatSidebar.vue         # Add Auto Mode toggle button
├── conversations/
│   └── ConversationListItem.vue # Add Auto Mode badge display
└── settings/
    └── AutoModeSettings.vue     # New component for concurrency control

composables/
└── useAutoMode.ts              # New composable for Auto Mode logic

stores/
└── chat.ts                     # Extend with AutoModeState

server/
├── api/
│   └── automode/              # New directory
│       ├── queue.get.ts       # Get current queue state
│       ├── toggle.post.ts     # Enable/disable Auto Mode
│       └── settings.post.ts   # Update concurrency settings
└── utils/
    └── automode.ts            # New utility for server-side Auto Mode logic

pages/
└── settings.vue               # Add Auto Mode settings section

types/
└── automode.ts               # New types for Auto Mode
```

**Structure Decision**: Nuxt 3 web application structure selected. All new Auto Mode functionality integrates into the existing component/composable/store architecture. Server-side logic uses Nitro API routes for state management and queue processing. No separate backend service needed - leverages existing conversation and cascade infrastructure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

## FR Coverage Matrix

All functional requirements from the spec are addressed in this plan:

| FR ID | Requirement Summary | Implementation Approach |
|-------|---------------------|------------------------|
| FR-001 | On/off toggle in sidebar | Add toggle button to ChatSidebar.vue component |
| FR-002 | Persist Auto Mode state | Store enabled state in localStorage via chat store |
| FR-003 | Scan specs and build queue | Server endpoint to list specs with SHA-256 hashes |
| FR-003a | Eligible directory pattern | Validate NNN-* pattern server-side |
| FR-003b | SHA-256 change detection | Server computes hashes, client stores for comparison |
| FR-004 | Create conversation per feature | Use existing createConversation API with featureId |
| FR-005 | Run cascade sequence | Programmatically trigger cascade with plan,tasks,skill:better-spec |
| FR-006 | Isolated worktree per conversation | Automatic via existing worktree integration |
| FR-007 | Update specs via Claude analysis | skill:better-spec execution handles this |
| FR-008 | Auto badge in conversation list | Add badge display logic to ConversationListItem.vue |
| FR-009 | Human review required | Standard preview/finalize flow unchanged |
| FR-010 | Disable stops queued tasks | Queue state management in useAutoMode composable |
| FR-010a | Running tasks complete naturally | Cascade completion tracked in conversation |
| FR-011 | Skip active worktrees | Server checks worktree existence before queueing |
| FR-012 | Constitution conversation | Special featureId "constitution" handling |
| FR-013 | Concurrent processing | Promise-based concurrency control in composable |
| FR-016 | Concurrency setting | Add setting to settings page and store |
| FR-014 | Full conversation lifecycle | No changes needed - Auto Mode uses standard conversations |
| FR-015 | Queue persistence | LocalStorage for queue state |
| FR-015a | Resume resets running to queued | State recovery logic in useAutoMode |
| FR-017 | Single cycle operation | Idle state tracking in AutoModeState |

**Coverage**: 100% - All 20 functional requirements have implementation paths defined.
