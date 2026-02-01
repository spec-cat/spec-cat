# Implementation Plan: Conversation Archive & Reopen

**Branch**: `019-conversation-archive` | **Date**: 2026-02-14 | **Spec**: [spec.md](/home/khan/src/brick2/specs/019-conversation-archive/spec.md)
**Input**: Feature specification from `/home/khan/src/brick2/specs/019-conversation-archive/spec.md`

## Summary

Replace destructive conversation deletion with archival, add an archive browsing surface, and implement restore-as-new behavior that copies archived context into a newly created active conversation while consuming the source archive entry. Implementation extends the existing Pinia conversation model and server JSON store with separate active/archive collections, archive/restore/delete store actions, and archive-focused UI list/search interactions.

## Technical Context

**Language/Version**: TypeScript 5.6+, Vue 3.5+, Nuxt 3.16+  
**Primary Dependencies**: Pinia 2.2+, `@heroicons/vue`, Tailwind CSS, Nitro server routes  
**Storage**: Server-side JSON file via `~/.spec-cat/projects/{hash}/conversations.json` (through `server/utils/specCatStore.ts`)  
**Testing**: Vitest available, feature verification via manual UI flow checks (project standard)  
**Target Platform**: Nuxt SSR web app (Node.js server + browser client)  
**Project Type**: Web application (single Nuxt full-stack repo)  
**Performance Goals**: Restore from archive to active conversation in <1s for typical payload (<500 messages), archive/search interaction remains responsive with 100 active + archived entries  
**Constraints**: Keep `MAX_CONVERSATIONS=100` active-cap behavior unchanged, block archive when conversation is streaming, maintain backward compatibility for legacy stored conversation shape  
**Scale/Scope**: Conversation panel + store + persistence updates; archive view and restore flow; no cloud sync or retention policy

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-Phase 0 gate evaluation against `/home/khan/src/brick2/.specify/memory/constitution.md`:

- **I. User Control First**: PASS. Archive/restore are explicit user actions. Streaming conversations are blocked from archiving with explicit feedback.
- **II. Streaming-Native Architecture**: PASS. No change to streaming transport; feature modifies conversation lifecycle state only.
- **III. CLI Parity**: PASS. No divergence in permission/session behavior; archive state remains UI/state layer.
- **IV. Multi-Project & History Support**: PASS. Continue per-project scoped store file; archived history remains project-local.
- **V. Keyboard-Driven Experience**: PASS. No shortcut regressions introduced.
- **VI. Simplicity Over Complexity**: PASS. Extend existing conversation store and persistence file instead of introducing new backend service.
- **VII. Type Safety**: PASS with requirement. Add strict types/type guards for archived payloads and migrated schema.

No constitutional violations detected; gate passes.

## Project Structure

### Documentation (this feature)

```text
/home/khan/src/brick2/specs/019-conversation-archive/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── archive-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
/home/khan/src/brick2/components/
├── conversations/ConversationsPanel.vue            # modify: archive entry point + archive view/search
└── chat/ConversationItem.vue                       # modify: replace delete action with archive action

/home/khan/src/brick2/stores/
└── chat.ts                                         # modify: archive state/actions/restore logic

/home/khan/src/brick2/types/
└── chat.ts                                         # modify: ArchivedConversation + Stored schema v2 + guards

/home/khan/src/brick2/utils/
└── conversationStorage.ts                          # modify: load/save migrated active + archived payload

/home/khan/src/brick2/server/api/
├── conversations.get.ts                            # modify: serve migrated schema
├── conversations.post.ts                           # modify: validate/store migrated schema
└── conversations/
    └── archive/
        └── [archiveId]/restore.post.ts            # new: restore archived snapshot into active conversation

/home/khan/src/brick2/server/utils/
└── specCatStore.ts                                 # unchanged integration point for persisted JSON
```

**Structure Decision**: Use existing Nuxt full-stack structure; keep archive and active data in the same store file for migration simplicity and backward compatibility.

## Phase 0: Research Output

Research documented in `/home/khan/src/brick2/specs/019-conversation-archive/research.md` with resolved decisions for:

- Storage schema evolution and migration strategy
- Archive action safety behavior for streaming conversations
- Restore copy semantics and immutability guarantees
- Archive list search/sort patterns and corrupted record handling
- Active-limit enforcement during restore
- API shape for archive and restore operations

All clarifications resolved; no remaining `NEEDS CLARIFICATION` items.

## Phase 1: Design Output

Design artifacts created:

- `/home/khan/src/brick2/specs/019-conversation-archive/data-model.md`
- `/home/khan/src/brick2/specs/019-conversation-archive/contracts/archive-api.yaml`
- `/home/khan/src/brick2/specs/019-conversation-archive/quickstart.md`

## Post-Phase 1 Constitution Re-Check

- **User Control First**: PASS. Archive/restore are user-initiated endpoints/actions; failure modes return explicit messages.
- **Streaming-Native**: PASS. No changes to WebSocket protocol or stream message handling.
- **CLI Parity**: PASS. Feature is orthogonal to CLI command semantics.
- **Multi-Project & History**: PASS. Data remains project-hashed in existing storage location.
- **Keyboard Experience**: PASS. No shortcut contracts changed.
- **Simplicity**: PASS. Single-store schema update and additive API routes only.
- **Type Safety**: PASS. Contract and data model require explicit archived/active types and migration guards.

Gate remains passing after design.

## Complexity Tracking

No constitution violations requiring justification.
