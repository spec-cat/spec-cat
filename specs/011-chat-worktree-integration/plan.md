# Implementation Plan: Chat Worktree Integration

**Branch**: `011-chat-worktree-integration` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-chat-worktree-integration/spec.md`
**Dependencies**: 007-ai-provider-chat, 009-conversation-management

## Summary

Chat Worktree Integration provides per-conversation git worktree isolation, enabling Claude's code changes to be made in isolated branches that can be previewed, synced, and finalized independently. The feature adds a complete worktree lifecycle (create → auto-commit → preview → sync → finalize/delete) managed through server APIs and integrated into the chat UI via store actions and composable hooks. A global preview state ensures only one conversation's worktree is checked out in the main workspace at a time.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue, git CLI (child_process), chokidar
**Storage**: localStorage (`spec-cat-conversations` key for conversation persistence including worktree fields), git branches/worktrees on filesystem (`/tmp/sc-*`)
**Testing**: Manual testing (per constitution)
**Target Platform**: Linux (local development server)
**Project Type**: Web application (Nuxt 3 full-stack — SSR frontend + Nitro server)
**Performance Goals**: Git operations < 2s for typical repos; auto-commit and preview-sync must complete before next turn starts
**Constraints**: `/tmp` directory must be writable; git must be available on PATH; worktree paths restricted to `/tmp/sc-*` for safety
**Scale/Scope**: Single-developer tool, up to 100 concurrent conversations (MAX_CONVERSATIONS), each with its own worktree

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User Control First | PASS | Preview/Finalize require explicit user action (button clicks). Auto-commit is implicit but non-destructive (isolated worktree). Dirty main worktree blocks preview (FR-013). |
| II. Streaming-Native Architecture | PASS | Auto-commit and preview-sync integrate into existing WebSocket streaming pipeline via `useChatStream.ts` events. |
| III. CLI Parity | PASS | Worktree operations use git CLI directly via `child_process` — same operations available in terminal. |
| IV. Multi-Project & History Support | PASS | Worktree fields persisted per-conversation in localStorage. Recovery from `/tmp` wipe uses existing git branches. |
| V. Keyboard-Driven Experience | PASS | Buttons in ChatPanel header for preview/finalize/close. No new keyboard shortcuts required. |
| VI. Simplicity Over Complexity | PASS | Direct git CLI calls — no git library abstraction. Preview uses temporary branch + `git update-ref` for atomic sync. Finalize is squash + rebase (standard git workflow). |
| VII. Type Safety | PASS | All API contracts typed (FinalizeRequest, FinalizeResponse). Conversation interface extended with worktree fields. Discriminated union for finalize results (success vs conflict). |

**Gate Result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/011-chat-worktree-integration/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
└── contracts/           # Phase 1 API contracts
    └── worktree-api.md  # REST API contract definitions
```

### Source Code (repository root)

```text
# Nuxt 3 full-stack application

# Server APIs (Nitro)
server/api/chat/
├── worktree.post.ts         # POST /api/chat/worktree — create conversation worktree
├── worktree.delete.ts       # DELETE /api/chat/worktree — remove worktree and branch
├── worktree-commit.post.ts  # POST /api/chat/worktree-commit — auto-commit changes
├── preview.post.ts          # POST /api/chat/preview — create preview branch
├── preview.delete.ts        # DELETE /api/chat/preview — end preview
├── preview-sync.post.ts     # POST /api/chat/preview-sync — sync preview to HEAD
├── finalize.post.ts         # POST /api/chat/finalize — squash, rebase, merge, cleanup
├── generate-commit-message.post.ts  # POST /api/chat/generate-commit-message — AI-generate squash commit message
└── rebase.post.ts           # POST /api/chat/rebase — rebase without squash

server/api/rebase/
├── conflicts.get.ts         # GET /api/rebase/conflicts — get conflicted files
├── resolve.put.ts           # PUT /api/rebase/resolve — write resolved content
├── continue.post.ts         # POST /api/rebase/continue — continue rebase (finalize)
├── continue-sync.post.ts    # POST /api/rebase/continue-sync — continue rebase (sync)
└── abort.post.ts            # POST /api/rebase/abort — abort rebase

# Server Utilities
server/utils/
├── ensureChatWorktree.ts    # Worktree recovery after /tmp wipe
├── worktreeResolver.ts      # Find/create worktrees for features
├── claudeService.ts         # Auto-commit with AI-generated messages
├── validateWorktree.ts      # Path validation (security)
└── git.ts                   # Core git operations (execGit, execGitArgs, etc.)

# Client Components
components/chat/
├── ChatPanel.vue            # Preview/finalize/close buttons in header
├── FinalizeConfirm.vue      # Finalize dialog with commit message + AI generate button
├── ConversationItem.vue     # Eye icon for preview indicator
└── ConflictResolutionModal.vue  # Conflict resolution UI

# Client Composables
composables/
└── useChatStream.ts         # Auto-commit on turn completion, preview-sync

# Client Store
stores/
└── chat.ts                  # previewingConversationId, preview/finalize actions

# Types
types/
└── chat.ts                  # Conversation worktree fields, FinalizeResponse
```

**Structure Decision**: Follows existing Nuxt 3 convention — server APIs in `server/api/`, utilities in `server/utils/`, components in `components/`, composables in `composables/`, stores in `stores/`, types in `types/`. No new structural patterns introduced.

## FR Coverage Matrix

| FR | Description | Design Artifact | Implementation Location |
|----|-------------|-----------------|------------------------|
| FR-001 | Auto-create worktree per conversation | data-model.md §Conversation, contracts/worktree-api.md §POST /api/chat/worktree | server/api/chat/worktree.post.ts |
| FR-001a | Feature-originated branch naming | contracts/worktree-api.md §POST /api/chat/worktree | server/api/chat/worktree.post.ts |
| FR-001b | Feature branch uniqueness validation | contracts/worktree-api.md §POST /api/chat/worktree | server/api/chat/worktree.post.ts, stores/chat.ts |
| FR-002 | Branch naming `sc/{conversationId}` | data-model.md §Branch Naming | server/api/chat/worktree.post.ts |
| FR-003 | Auto-commit after streaming turn | contracts/worktree-api.md §POST /api/chat/worktree-commit | composables/useChatStream.ts, server/api/chat/worktree-commit.post.ts |
| FR-004 | Preview mode (Eye icon) | contracts/worktree-api.md §POST /api/chat/preview | components/chat/ChatPanel.vue, stores/chat.ts |
| FR-005 | Auto-sync preview to latest HEAD | contracts/worktree-api.md §POST /api/chat/preview-sync | composables/useChatStream.ts, server/api/chat/preview-sync.post.ts |
| FR-006 | Finalize (squash, rebase, merge, cleanup) | contracts/worktree-api.md §POST /api/chat/finalize | server/api/chat/finalize.post.ts, stores/chat.ts |
| FR-006a | Finalize confirmation dialog | data-model.md §FinalizeRequest | components/chat/FinalizeConfirm.vue |
| FR-006b | Finalize conflict detection | data-model.md §FinalizeResponse | server/api/chat/finalize.post.ts |
| FR-006c | Retry finalize after conflicts | contracts/worktree-api.md §POST /api/chat/finalize | server/api/chat/finalize.post.ts, components/chat/ChatPanel.vue |
| FR-006d | AI-generate finalize commit message | contracts/worktree-api.md §POST /api/chat/generate-commit-message | server/api/chat/generate-commit-message.post.ts, components/chat/FinalizeConfirm.vue |
| FR-007 | Delete conversation cleanup | contracts/worktree-api.md §DELETE /api/chat/worktree | stores/chat.ts, server/api/chat/worktree.delete.ts |
| FR-008 | Worktree recovery after /tmp wipe | data-model.md §Recovery | server/utils/ensureChatWorktree.ts |
| FR-009 | Session corruption auto-retry | data-model.md §Session Recovery | composables/useChatStream.ts (session_reset event) |
| FR-010 | Global preview state tracking | data-model.md §PreviewState | stores/chat.ts (previewingConversationId) |
| FR-011 | Preview switching between conversations | data-model.md §PreviewState transitions | stores/chat.ts (togglePreview) |
| FR-012 | Visual preview indicator | data-model.md §PreviewState | components/chat/ConversationItem.vue |
| FR-013 | Block preview if dirty main worktree | contracts/worktree-api.md §POST /api/chat/preview | server/api/chat/preview.post.ts |
| FR-014 | Finalized conversation read-only | data-model.md §Conversation.finalized | stores/chat.ts |
| FR-015 | Concurrent streaming sessions | data-model.md §ConversationStreamState | composables/useChatStream.ts, stores/chat.ts |

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## FR Coverage Addendum (2026-02-14)

| FR | Description | Design Artifact | Implementation Location |
|----|-------------|-----------------|------------------------|
| FR-006e | Finalize commit message generation UX | contracts/worktree-api.md | components/chat/FinalizeConfirm.vue, server/api/chat/generate-commit-message.post.ts |
| FR-006f | Finalize confirmation validations | data-model.md | components/chat/FinalizeConfirm.vue |
| FR-016 | Conflict editor syntax-highlighted presentation | tasks phase 6 | components/chat/ConflictFileEditor.vue |
| FR-017 | Conflict editor line-level affordances | tasks phase 6 | components/chat/ConflictFileEditor.vue |
| FR-018 | AI resolve single conflict | tasks phase 6 | server/api/rebase/ai-resolve.post.ts, stores/chat.ts |
| FR-019 | AI resolve all conflicts | tasks phase 6 | components/chat/ConflictResolutionModal.vue, stores/chat.ts |
| FR-020 | AI resolve request/response contract | tasks phase 6 | types/chat.ts, server/api/rebase/ai-resolve.post.ts |
| FR-021 | Conflict resolution flow robustness | phase dependencies | stores/chat.ts, conflict APIs |
| FR-022 | Conflict resolution lifecycle completeness | phase dependencies | stores/chat.ts, rebase APIs |
| FR-022a | Conflict list retrieval | contracts/worktree-api.md | server/api/rebase/conflicts.get.ts |
| FR-022b | Conflict file content editing | data-model.md | components/chat/ConflictFileEditor.vue |
| FR-022c | Conflict resolution write-back | contracts/worktree-api.md | server/api/rebase/resolve.put.ts |
| FR-022d | Continue rebase after resolve | contracts/worktree-api.md | server/api/rebase/continue.post.ts |
| FR-022e | Continue sync after resolve | contracts/worktree-api.md | server/api/rebase/continue-sync.post.ts |
| FR-022f | Abort rebase recovery | contracts/worktree-api.md | server/api/rebase/abort.post.ts |
| FR-023 | Per-conflict-block accept actions in editor | tasks phase 6 | components/chat/ConflictFileEditor.vue |
| FR-024 | New-conversation base branch selector | contracts/worktree-api.md | components/conversations/NewConversationModal.vue, components/conversations/ConversationsPanel.vue, stores/chat.ts, server/api/chat/worktree.post.ts |
