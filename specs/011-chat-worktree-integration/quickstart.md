# Quickstart: Chat Worktree Integration

**Feature**: 011-chat-worktree-integration
**Date**: 2026-02-08

## Overview

This feature integrates git worktrees into the chat system so that each conversation operates in an isolated branch. Changes made by Claude are auto-committed, can be previewed in the main workspace, and finalized (squash + rebase) when ready.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Worktree** | Isolated git working directory at `/tmp/br-{id}/` with its own branch |
| **Auto-commit** | Changes are committed automatically after each streaming turn |
| **Preview** | Checkout the worktree's HEAD in the main workspace for testing |
| **Finalize** | Squash all commits, rebase onto base branch, and clean up |
| **Recovery** | Recreate worktree from git branch if `/tmp` is wiped |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Client (Browser)                                     │
│                                                      │
│  ChatPanel.vue ─── stores/chat.ts ─── useChatStream │
│  (preview/finalize    (global preview     (auto-commit│
│   buttons)             state)              on turn)  │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
                       ▼
┌─────────────────────────────────────────────────────┐
│ Server (Nitro)                                       │
│                                                      │
│  /api/chat/worktree      ─── ensureChatWorktree.ts  │
│  /api/chat/preview       ─── claudeService.ts       │
│  /api/chat/preview-sync  ─── validateWorktree.ts    │
│  /api/chat/finalize      ─── git.ts                 │
└──────────────────────┬──────────────────────────────┘
                       │ child_process
                       ▼
┌─────────────────────────────────────────────────────┐
│ Git                                                  │
│                                                      │
│  Main worktree: /home/user/project/                  │
│  Conv worktree: /tmp/br-conv-xxx/                    │
│                                                      │
│  Branches:                                           │
│    main (base)                                       │
│    br/conv-xxx (working branch)                      │
│    br/p-conv-xxx (preview branch, temporary)         │
└─────────────────────────────────────────────────────┘
```

## Workflows

### 1. Start a Conversation

```
User clicks "New Chat"
  → createConversation() in store
  → POST /api/chat/worktree { conversationId }
  → git worktree add -b "br/{id}" "/tmp/br-{id}" "main"
  → Conversation.worktreePath = "/tmp/br-{id}"
  → Conversation.worktreeBranch = "br/{id}"
  → Conversation.baseBranch = "main"
```

### 2. Streaming Turn (Auto-Commit)

```
User sends message → Claude streams response → Turn completes
  → POST /api/chat/worktree-commit { worktreePath }
  → git -C /tmp/br-{id} add -A
  → git -C /tmp/br-{id} commit -m "feat: AI-generated message"
  → If previewing: POST /api/chat/preview-sync
    → git update-ref refs/heads/br/p-{id} {newHead}
    → git reset --hard {newHead}  (in main worktree)
```

### 3. Preview Changes

```
User clicks Eye icon on conversation
  → togglePreview(conversationId) in store
  → POST /api/chat/preview { conversationId, worktreePath, baseBranch }
  → Validates main worktree is clean
  → git branch br/p-{id} {worktreeHead}
  → git checkout br/p-{id}
  → previewingConversationId = conversationId
  → Eye icon highlighted in conversation list
```

### 4. Finalize Changes

```
User clicks CheckCircle → FinalizeConfirm dialog → User enters message
  → finalizeConversation(id, message) in store
  → POST /api/chat/finalize { conversationId, commitMessage, ... }
  → git -C /tmp/br-{id} reset --soft {mergeBase}
  → git -C /tmp/br-{id} commit -m "{message}"
  → git -C /tmp/br-{id} rebase main
  → git update-ref refs/heads/main {newHead}
  → Cleanup: remove worktree, delete branches
  → Conversation.finalized = true (read-only)
```

### 5. Handle Conflicts

```
Finalize detects rebase conflict
  → Return { success: false, conflictFiles: [...], rebaseInProgress: true }
  → ConflictResolutionModal shown
  → User resolves each file → PUT /api/rebase/resolve
  → POST /api/rebase/continue → completes finalize
  OR
  → POST /api/rebase/abort → keeps worktree, user can retry later
```

### 6. Recovery After /tmp Wipe

```
System restarts, /tmp cleared
  → WebSocket reconnects for conversation
  → ensureChatWorktree(projectDir, worktreePath, branch)
  → Detects /tmp/br-{id} missing
  → git worktree prune
  → git rev-parse --verify br/{id}  (branch still exists)
  → git worktree add /tmp/br-{id} br/{id}
  → Sends worktree_recovered event to client
```

## File Locations

| Category | Path | Purpose |
|----------|------|---------|
| Server APIs | `server/api/chat/worktree.post.ts` | Create worktree |
| | `server/api/chat/worktree.delete.ts` | Delete worktree |
| | `server/api/chat/worktree-commit.post.ts` | Auto-commit |
| | `server/api/chat/preview.post.ts` | Create preview |
| | `server/api/chat/preview.delete.ts` | End preview |
| | `server/api/chat/preview-sync.post.ts` | Sync preview |
| | `server/api/chat/finalize.post.ts` | Finalize |
| | `server/api/chat/rebase.post.ts` | Rebase sync |
| Server Utils | `server/utils/ensureChatWorktree.ts` | Recovery |
| | `server/utils/claudeService.ts` | AI commit messages |
| | `server/utils/validateWorktree.ts` | Path validation |
| | `server/utils/git.ts` | Git operations |
| Components | `components/chat/ChatPanel.vue` | Header buttons |
| | `components/chat/FinalizeConfirm.vue` | Finalize dialog |
| | `components/chat/ConversationItem.vue` | Preview indicator |
| | `components/chat/ConflictResolutionModal.vue` | Conflict UI |
| Composables | `composables/useChatStream.ts` | Stream lifecycle |
| Store | `stores/chat.ts` | Global state |
| Types | `types/chat.ts` | Type definitions |

## Dependencies

- **007-claude-code-chat**: Base chat infrastructure (WebSocket, streaming, messages)
- **009-conversation-management**: Conversation CRUD, list, search, localStorage persistence
- **003-worktree-management**: General worktree management (list, create, delete, switch)
