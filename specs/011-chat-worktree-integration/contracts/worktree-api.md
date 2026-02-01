# API Contracts: Chat Worktree Integration

**Feature**: 011-chat-worktree-integration
**Date**: 2026-02-08
**Base URL**: `/api/chat/` (Nitro server routes)

---

## 1. POST /api/chat/worktree

**Description**: Create an isolated worktree for a conversation (FR-001, FR-001a, FR-001b, FR-002, FR-024).

### Request

```typescript
interface CreateWorktreeRequest {
  conversationId: string          // Conversation ID
  featureId?: string              // If feature-originated (e.g., "001-auth")
  baseBranch?: string             // Optional selected base branch for new conversation
}
```

### Response

```typescript
// 200 OK
interface CreateWorktreeResponse {
  success: true
  worktreePath: string            // e.g., /tmp/br-conv-1234567890-x7k9m2
  branch: string                  // e.g., br/conv-1234567890-x7k9m2 or 001-auth
  baseBranch: string              // Selected base branch (e.g., main)
}

// 409 Conflict (feature branch already exists)
interface CreateWorktreeConflict {
  success: false
  error: string                   // "Branch '001-auth' already exists"
}

// 500 Internal Server Error
interface CreateWorktreeError {
  success: false
  error: string
}
```

### Behavior

1. Resolve base branch:
   - If `baseBranch` provided, verify local branch exists and use it
   - Otherwise use current branch
2. If `featureId` provided:
   - Check if branch `{featureId}` already exists → return 409
   - Branch name = `{featureId}`
   - Worktree path = `/tmp/br-{featureId}-{conversationId}`
3. If no `featureId`:
   - Branch name = `br/{conversationId}`
   - Worktree path = `/tmp/br-{conversationId}`
4. Resolve base commit from selected base branch HEAD
5. Execute: `git worktree add -b "{branch}" "{worktreePath}" "{baseCommit}"`

---

## 2. DELETE /api/chat/worktree

**Description**: Remove a conversation's worktree and associated branch (FR-007).

### Request

```typescript
interface DeleteWorktreeRequest {
  worktreePath: string            // Full path to worktree
  branch: string                  // Branch to delete
  previewBranch?: string          // Preview branch to clean up
}
```

### Response

```typescript
// 200 OK
interface DeleteWorktreeResponse {
  success: true
}

// 500 Internal Server Error
interface DeleteWorktreeError {
  success: false
  error: string
}
```

### Behavior

1. Try: `git worktree remove "{worktreePath}" --force`
2. Fallback: `rm -rf "{worktreePath}"`
3. Run: `git worktree prune`
4. Delete branch: `git branch -D "{branch}"`
5. If `previewBranch` provided: `git branch -D "{previewBranch}"`

---

## 3. POST /api/chat/worktree-commit

**Description**: Auto-commit all changes in a conversation's worktree after a streaming turn (FR-003).

### Request

```typescript
interface WorktreeCommitRequest {
  worktreePath: string            // Full path to worktree
  featureId?: string              // For contextual commit messages
}
```

### Response

```typescript
// 200 OK
interface WorktreeCommitResponse {
  success: true
  committed: boolean              // false if no changes to commit
  commitHash?: string             // Hash of new commit (if committed)
  message?: string                // Generated commit message
}

// 500 Internal Server Error
interface WorktreeCommitError {
  success: false
  error: string
}
```

### Behavior

1. Check for changes: `git -C "{worktreePath}" status --porcelain`
2. If no changes → return `{ success: true, committed: false }`
3. Stage all: `git -C "{worktreePath}" add -A`
4. Get diff stat: `git -C "{worktreePath}" diff --cached --stat`
5. Generate commit message via Claude Haiku (conventional commit format)
6. Commit: `git -C "{worktreePath}" commit -m "{message}"`

---

## 4. POST /api/chat/preview

**Description**: Create a preview branch and check it out in the main worktree (FR-004, FR-013).

### Request

```typescript
interface CreatePreviewRequest {
  conversationId: string
  worktreePath: string            // Worktree to preview
  baseBranch: string              // To return to on unpreview
}
```

### Response

```typescript
// 200 OK
interface CreatePreviewResponse {
  success: true
  previewBranch: string           // e.g., br/p-conv-1234567890-x7k9m2
}

// 409 Conflict (main worktree has uncommitted changes)
interface CreatePreviewDirty {
  success: false
  error: string                   // "Commit or stash changes first"
}

// 500 Internal Server Error
interface CreatePreviewError {
  success: false
  error: string
}
```

### Behavior

1. Ensure worktree exists (auto-recover if needed)
2. Auto-commit any uncommitted changes in worktree
3. Get worktree HEAD: `git -C "{worktreePath}" rev-parse HEAD`
4. Check main worktree status: `git status --porcelain`
   - If dirty → return 409 with "Commit or stash changes first"
5. Delete old preview branch if exists: `git branch -D "br/p-{conversationId}"`
6. Create preview branch: `git branch "br/p-{conversationId}" {worktreeHead}`
7. Checkout in main worktree: `git checkout "br/p-{conversationId}"`

---

## 5. DELETE /api/chat/preview

**Description**: End preview and return main worktree to base branch (FR-004).

### Request

```typescript
interface EndPreviewRequest {
  previewBranch: string           // Preview branch to delete
  baseBranch: string              // Branch to return to
}
```

### Response

```typescript
// 200 OK
interface EndPreviewResponse {
  success: true
}

// 500 Internal Server Error
interface EndPreviewError {
  success: false
  error: string
}
```

### Behavior

1. Checkout base branch: `git checkout "{baseBranch}"`
2. Delete preview branch: `git branch -D "{previewBranch}"`

---

## 6. POST /api/chat/preview-sync

**Description**: Update the preview branch to the latest worktree HEAD (FR-005).

### Request

```typescript
interface PreviewSyncRequest {
  worktreePath: string
  previewBranch: string
}
```

### Response

```typescript
// 200 OK
interface PreviewSyncResponse {
  success: true
  newHead: string                 // Updated HEAD hash
}

// 500 Internal Server Error
interface PreviewSyncError {
  success: false
  error: string
}
```

### Behavior

1. Get latest worktree HEAD: `git -C "{worktreePath}" rev-parse HEAD`
2. Update ref: `git update-ref "refs/heads/{previewBranch}" {worktreeHead}`
3. If main worktree is on preview branch: `git reset --hard {worktreeHead}`

---

## 7. POST /api/chat/generate-commit-message

**Description**: Generate a squash commit message by summarizing the worktree's commit history and diff using AI (FR-006d).

### Request

```typescript
interface GenerateCommitMessageRequest {
  conversationId: string          // Conversation ID to locate worktree
  worktreePath?: string           // Defaults to /tmp/br-{conversationId}; feature-originated: /tmp/br-{featureId}-{conversationId}
}
```

### Response

```typescript
// 200 OK
interface GenerateCommitMessageSuccess {
  success: true
  message: string                 // Generated conventional commit message
}

// 200 OK (no commits)
interface GenerateCommitMessageEmpty {
  success: false
  error: string                   // "No commits to summarize"
}

// 404 Not Found (worktree missing)
// 500 Internal Server Error
interface GenerateCommitMessageError {
  success: false
  error: string
}
```

### Behavior

1. Locate worktree at `worktreePath` (fallback: `/tmp/br-{conversationId}`)
2. Detect base branch (main/master)
3. Get commit log: `git log --oneline {baseBranch}..HEAD`
4. If no commits → return `{ success: false, error: "No commits to summarize" }`
5. Get overall diff stat: `git diff --stat {baseBranch}..HEAD`
6. Generate commit message via Claude Haiku (conventional commit format, max 72 char first line)
7. Return generated message for user to review/edit in FinalizeConfirm textarea

---

## 8. POST /api/chat/finalize

**Description**: Squash all commits, rebase onto base branch, merge, and cleanup (FR-006, FR-006a, FR-006b, FR-006c).

### Request

```typescript
interface FinalizeRequest {
  conversationId: string
  commitMessage: string           // User-provided squash commit message
  baseBranch?: string             // Auto-detected from main/master if not provided
  worktreePath?: string           // Defaults to /tmp/br-{conversationId}; feature-originated: /tmp/br-{featureId}-{conversationId}
  worktreeBranch?: string         // Defaults to br/{conversationId}; feature-originated: {featureId}
}
```

### Response

```typescript
// 200 OK (success)
interface FinalizeSuccess {
  success: true
  newCommit: string               // Hash of squashed commit on base branch
}

// 200 OK (conflict)
interface FinalizeConflict {
  success: false
  error: string                   // "Rebase conflicts detected"
  conflictFiles: string[]         // List of conflicted file paths
  rebaseInProgress: true
}

// 500 Internal Server Error
interface FinalizeError {
  success: false
  error: string
}
```

### Behavior

1. Ensure worktree exists (auto-recover if needed)
2. Auto-commit any uncommitted changes in worktree
3. Find merge base: `git -C "{worktreePath}" merge-base {worktreeBranch} {baseBranch}`
4. Count commits: `git -C "{worktreePath}" rev-list --count {mergeBase}..HEAD`
5. **Squash**: `git -C "{worktreePath}" reset --soft {mergeBase}` then `git -C "{worktreePath}" commit -m "{commitMessage}"`
6. **Rebase**: `git -C "{worktreePath}" rebase {baseBranch}`
   - On conflict: `git -C "{worktreePath}" diff --name-only --diff-filter=U` → return conflict list
7. **On success**:
   - Checkout baseBranch in main: `git checkout "{baseBranch}"`
   - Get new HEAD: `git -C "{worktreePath}" rev-parse HEAD`
   - Update base ref: `git update-ref "refs/heads/{baseBranch}" {newHead}`
   - Sync main working dir: `git reset --hard HEAD`
   - Cleanup worktree: `git worktree remove "{worktreePath}" --force`
   - Prune: `git worktree prune`
   - Delete branches: `git branch -D "{worktreeBranch}"`, `git branch -D "{previewBranch}"`

---

## 8. POST /api/chat/rebase

**Description**: Rebase worktree onto latest base branch without squashing or finalizing (FR-006c support).

### Request

```typescript
interface RebaseSyncRequest {
  conversationId: string
  baseBranch?: string             // Auto-detected from main/master if not provided
  worktreePath?: string           // Defaults to /tmp/br-{conversationId}; feature-originated: /tmp/br-{featureId}-{conversationId}
}
```

### Response

```typescript
// 200 OK (success)
interface RebaseSuccess {
  success: true
}

// 200 OK (conflict)
interface RebaseConflict {
  success: false
  error: string
  conflictFiles: string[]
  rebaseInProgress: true
}

// 500 Internal Server Error
interface RebaseError {
  success: false
  error: string
}
```

### Behavior

1. Ensure worktree exists
2. Auto-commit any uncommitted changes
3. Rebase: `git -C "{worktreePath}" rebase {baseBranch}`
4. On conflict: return file list (worktree preserved)
5. On success: worktree now has linear history on top of base

---

## 9. Conflict Resolution APIs

### GET /api/rebase/conflicts

**Description**: Get the list of conflicted files with their content.

```typescript
// Request: query params
interface ConflictsQuery {
  worktreePath: string
}

// Response
interface ConflictsResponse {
  files: Array<{
    path: string                  // Relative path in worktree
    content: string               // File content with conflict markers
    status: 'conflicted' | 'resolved'
  }>
}
```

### PUT /api/rebase/resolve

**Description**: Write resolved content for a conflicted file.

```typescript
// Request
interface ResolveRequest {
  worktreePath: string
  filePath: string                // Relative path
  content: string                 // Resolved content
}

// Response
interface ResolveResponse {
  success: true
}
```

### POST /api/rebase/continue

**Description**: Continue rebase after all conflicts are resolved (finalize mode — completes the finalize flow).

```typescript
// Request
interface RebaseContinueRequest {
  conversationId: string
  commitMessage: string
  baseBranch?: string             // Auto-detected from main/master if not provided
  worktreePath?: string           // Defaults to /tmp/br-{conversationId}; feature-originated: /tmp/br-{featureId}-{conversationId}
  worktreeBranch?: string         // Defaults to br/{conversationId}; feature-originated: {featureId}
}

// Response: Same as FinalizeResponse (may encounter more conflicts)
```

### POST /api/rebase/continue-sync

**Description**: Continue rebase after all conflicts are resolved (sync mode — keeps worktree intact).

```typescript
// Request
interface RebaseSyncRequest {
  conversationId: string
  baseBranch?: string             // Auto-detected from main/master if not provided
  worktreePath?: string           // Defaults to /tmp/br-{conversationId}; feature-originated: /tmp/br-{featureId}-{conversationId}
}

// Response
interface ContinueSyncResponse {
  success: boolean
  error?: string
  conflictFiles?: string[]        // If more conflicts
}
```

### POST /api/rebase/abort

**Description**: Abort the rebase and discard resolution.

```typescript
// Request
interface AbortRequest {
  worktreePath: string
}

// Response
interface AbortResponse {
  success: true
}
```

**Behavior**: `git -C "{worktreePath}" rebase --abort`

---

## WebSocket Events (Chat Stream Integration)

These events flow through the existing WebSocket streaming pipeline in `useChatStream.ts`.

### Auto-Commit Trigger

After a streaming turn completes (`done` event), the composable calls:

```typescript
// POST /api/chat/worktree-commit
await $fetch('/api/chat/worktree-commit', {
  method: 'POST',
  body: { worktreePath, featureId }
})
```

### Preview Sync Trigger

After auto-commit, if the conversation is being previewed:

```typescript
// POST /api/chat/preview-sync
if (chatStore.isConversationPreviewing(conversationId)) {
  await $fetch('/api/chat/preview-sync', {
    method: 'POST',
    body: { worktreePath, previewBranch }
  })
}
```

### Worktree Recovery Event

Sent by server when worktree is auto-recovered:

```typescript
interface WorktreeRecoveredEvent {
  type: 'worktree_recovered'
  data: {
    conversationId: string
    worktreePath: string
  }
}
```

### Session Reset Event

Sent by server when session is corrupted and needs fresh start:

```typescript
interface SessionResetEvent {
  type: 'session_reset'
  data: {
    conversationId: string
    reason: string
  }
}
```
