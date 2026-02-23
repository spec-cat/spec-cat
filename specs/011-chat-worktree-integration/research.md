# Research: Chat Worktree Integration

**Feature**: 011-chat-worktree-integration
**Date**: 2026-02-08

## Research Topics

### 1. Git Worktree Isolation for Per-Conversation Branches

**Decision**: Use `git worktree add -b <branch> <path> <start-point>` to create isolated worktrees in `/tmp/sc-*`.

**Rationale**:
- Git worktrees provide true filesystem isolation — each conversation has its own working directory with independent staging area and HEAD.
- Creating worktrees from the same repository shares the object store, so disk usage is minimal (only new/modified files).
- The `-b` flag creates and checks out a new branch atomically, preventing race conditions.
- `/tmp/` is the standard location for transient data; system reboots naturally clean stale worktrees.

**Alternatives considered**:
- **Git stash per conversation**: Rejected — stashes are sequential (not random-access), don't support concurrent modifications, and have no branch isolation.
- **Separate git clones**: Rejected — duplicates entire object store per conversation, wastes disk, and doesn't share refs.
- **In-memory filesystem (tmpfs)**: Rejected — unnecessary complexity; `/tmp` on most Linux systems is already tmpfs.

---

### 2. Branch Naming Convention

**Decision**: `sc/{conversationId}` for regular conversations; `{featureId}` (e.g., `001-auth`) for feature-originated conversations.

**Rationale**:
- The `sc/` prefix namespaces conversation branches, avoiding collision with feature branches or user branches.
- Feature-originated conversations use the featureId directly because the branch represents the feature itself and may be pushed upstream.
- Preview uses a single shared branch: `sc/preview`.

**Alternatives considered**:
- **Flat naming (no prefix)**: Rejected — risk of collision with existing branches.
- **`conv/` prefix**: Rejected — `sc/` is shorter and already established in the codebase.

---

### 3. Auto-Commit Strategy

**Decision**: Call `git add -A && git commit` after each streaming turn completes, with AI-generated conventional commit messages via Claude Haiku.

**Rationale**:
- `git add -A` captures all changes including new/deleted files, respecting `.gitignore`.
- AI-generated commit messages provide meaningful history without user effort.
- Per-turn commits create a granular history that can be squashed on finalize.
- Using Haiku (fast, cheap model) for commit messages avoids latency impact on the main streaming flow.

**Alternatives considered**:
- **Manual commits only**: Rejected — defeats the purpose of automated worktree management.
- **Single commit on finalize**: Rejected — loses intermediate history; harder to debug or revert partial changes.
- **Git hooks for auto-commit**: Rejected — overly complex; direct API call after turn completion is simpler.

---

### 4. Preview Mechanism (Temporary Branch + update-ref)

**Decision**: Create a temporary preview branch `sc/preview` in the main worktree, then use `git update-ref` to sync it to the worktree's HEAD after each turn.

**Rationale**:
- Checking out a branch in the main worktree (vs. the isolated worktree) lets the user test changes with their local dev tools, IDE, and browser.
- `git update-ref` is an atomic operation that updates the branch pointer without touching the working tree, making sync fast and safe.
- After `update-ref`, a `git reset --hard` in the main worktree reflects the changes — this is safe because the preview branch is a controlled temporary branch.
- The main worktree's dirty state is checked before preview starts (FR-013), preventing accidental loss of user work.

**Alternatives considered**:
- **Symlink to worktree**: Rejected — breaks IDE file watchers, doesn't integrate with git status.
- **Direct checkout of worktree branch**: Rejected — worktree branch is locked to the worktree; git doesn't allow checking it out elsewhere.
- **Patch-based preview**: Rejected — complex to maintain, fragile with binary files, doesn't support full testing.

---

### 5. Finalize Strategy (Squash + Rebase)

**Decision**: Squash all worktree commits into one via `git reset --soft <merge-base> && git commit`, then rebase onto the latest base branch.

**Rationale**:
- Squashing produces a clean single commit representing the entire conversation's work.
- Rebasing ensures the commit applies cleanly on top of the latest base branch.
- Using `git update-ref` to fast-forward the base branch (instead of merge) avoids merge commits in linear history.
- On conflict, the rebase is paused (not aborted), preserving the squashed commit and allowing the user to retry after upstream changes.

**Alternatives considered**:
- **Merge commit**: Rejected — creates non-linear history; squash+rebase produces cleaner logs.
- **Cherry-pick**: Rejected — only works for individual commits; squash+rebase handles the full range.
- **Interactive rebase**: Rejected — requires interactive input; not automatable in a server context.

---

### 6. Worktree Recovery After /tmp Wipe

**Decision**: On WebSocket connection, check if the worktree path exists. If not, prune stale refs and recreate from the existing git branch.

**Rationale**:
- System reboots clear `/tmp`, but git branches persist in `.git/refs/`.
- `git worktree prune` removes stale worktree entries, then `git worktree add <path> <branch>` (without `-b`) recreates the directory from the existing branch.
- Recovery is transparent to the user — the WebSocket handler sends a `worktree_recovered` event to notify the client.

**Alternatives considered**:
- **Persistent worktree directory (outside /tmp)**: Rejected — accumulates disk usage; `/tmp` auto-cleanup is a feature, not a bug.
- **Re-create from localStorage**: Rejected — localStorage has messages but not file changes; git branch is the authoritative source.

---

### 7. Global Preview State Management

**Decision**: Store `previewingConversationId` as a runtime-only ref in the Pinia chat store. Not persisted to localStorage.

**Rationale**:
- Only one conversation can be previewed at a time (the main worktree can only be on one branch).
- Runtime-only because preview is inherently transient — on server restart, the main worktree returns to its base branch naturally.
- `togglePreview(id)` implements atomic switch: if another conversation is previewing, unpreview it first, then preview the new one.
- The store getter `isConversationPreviewing(id)` drives the visual indicator (eye icon highlight) in ConversationItem.

**Alternatives considered**:
- **Persist preview state to localStorage**: Rejected — preview is a server-side state (which branch is checked out); persisting client-side would create mismatch on page reload.
- **Server-managed preview state**: Rejected — adds unnecessary server state; the client knows which conversation it previewed, and the server just executes git commands.

---

### 8. Conflict Resolution Strategy

**Decision**: On rebase conflict, return the list of conflicted files to the client. The worktree is preserved with the rebase in progress. User can resolve via ConflictResolutionModal or retry finalize after upstream changes.

**Rationale**:
- Conflict detection is inherent in `git rebase` — when it fails, `git diff --name-only --diff-filter=U` lists conflicted files.
- Preserving the worktree (not aborting the rebase) lets the user choose: resolve inline or retry later.
- The ConflictResolutionModal provides a file-by-file editor with the full conflict content.
- `git rebase --continue` resumes after all conflicts are resolved; `git rebase --abort` restores the pre-rebase state.

**Alternatives considered**:
- **Auto-abort on conflict**: Rejected — loses the squashed commit; user would have to re-finalize from scratch.
- **3-way merge UI**: Rejected — out of scope per spec ("Conflict resolution UI — only detection and reporting").
- **AI-assisted conflict resolution**: Rejected — beyond scope; could introduce incorrect merges.

---

### 9. Path Security (validateWorktree.ts)

**Decision**: All worktree paths must start with `/tmp/sc-`. File paths within worktrees are validated against path traversal attacks.

**Rationale**:
- Restricting to `/tmp/sc-*` prevents accidental deletion or modification of non-worktree directories.
- Path traversal validation (rejecting `..`, absolute paths outside worktree) prevents reading/writing files outside the worktree.
- These checks run server-side before any git or filesystem operation.

**Alternatives considered**:
- **Chroot/namespace isolation**: Rejected — overkill for a single-developer local tool.
- **No validation (trust client)**: Rejected — defense in depth; even local tools should validate inputs.

---

## Summary

All technical decisions are resolved. No NEEDS CLARIFICATION items remain. The design uses standard git operations (worktree, branch, rebase, update-ref) composed through Nitro server APIs, with the Pinia store managing client-side state and the WebSocket composable orchestrating the streaming lifecycle.
