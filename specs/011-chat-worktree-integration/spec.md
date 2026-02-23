# Feature Specification: Chat Worktree Integration

**Feature Branch**: `011-chat-worktree-integration`
**Created**: 2026-02-08
**Status**: Implemented
**Execution Model**: Parent spec with active child execution lanes
**Split from**: `007-claude-code-chat` (original FR-034 ~ FR-042 + User Story 10)
**Dependencies**: 007-claude-code-chat, 009-conversation-management

## Structure Notice

This spec acts as the parent requirement container.
Active implementation lanes are split into:

- `specs/025-chat-worktree-lifecycle/`
- `specs/026-chat-preview-finalize-flow/`
- `specs/027-chat-conflict-resolution/`

New implementation work should be scoped in child specs to minimize collisions in `stores/chat.ts` and related APIs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Worktree Isolation (Priority: P1)

As a developer, I want each conversation to have its own isolated worktree so that Claude's changes don't affect my main branch.

**Acceptance Scenarios**:

1. **Given** I start a new conversation, **When** Claude makes its first change, **Then** an isolated worktree is created at `/tmp/sc-{conversationId}`.
2. **Given** a conversation has a worktree, **When** I click the Preview button (Eye icon), **Then** the worktree's changes are checked out in my main workspace for testing.
3. **Given** preview is active, **When** Claude makes more changes, **Then** the preview branch auto-syncs to the latest.
4. **Given** I'm satisfied, **When** I click Finalize, **Then** a confirmation dialog shows with a branch selector (defaulting to the conversation's base branch) where I can choose a different target branch, all commits are squashed, rebased onto the selected target branch, the worktree is cleaned up, and the conversation is marked as "finalized" (read-only).
5. **Given** finalize encounters conflicts, **Then** the conflicting file list is shown, the worktree is preserved, and the user can retry finalize after the upstream conflict is resolved.
6. **Given** `/tmp` was wiped (e.g., system restart), **When** I resume a conversation, **Then** the worktree is auto-recovered from the existing branch.
7. **Given** the conversation worktree HEAD equals the base branch HEAD, **Then** the Finalize and Rebase buttons are hidden (no-op state).
8. **Given** I have an active conversation with a worktree, **When** I click the Rebase button (ArrowPathIcon), **Then** a confirmation dialog appears with a target base branch dropdown (defaulting to the conversation's current baseBranch), I can select a different branch, and after confirming, the worktree is rebased onto the selected branch.
9. **Given** I click New conversation, **When** I select a base branch in the create dialog and confirm, **Then** the worktree is created from that branch and the conversation stores it as `baseBranch`.

---

### User Story 2 - Global Preview Management (Priority: P1)

As a developer, I want to see which conversation (worktree) is currently being previewed across all active conversations, and switch preview between conversations, so that I can test different worktree changes in the main worktree without confusion.

**Why this priority**: Preview is a fundamental workflow action — the main worktree can only be on one branch at a time, so preview is inherently a global (cross-conversation) state, not a per-conversation state. Without global management, users may not know which conversation is currently previewed, or may accidentally conflict with an active preview.

**Independent Test**: Can be tested by creating two conversations with worktrees, previewing one, then switching preview to the other and verifying the main worktree follows. Also verify that the conversation list clearly indicates which conversation is currently previewed.

**Acceptance Scenarios**:

1. **Given** no conversation is being previewed, **When** I click the preview button on a conversation, **Then** that conversation's worktree HEAD is checked out in the main worktree and the conversation is visually marked as "previewing" in the conversation list.
2. **Given** conversation A is being previewed, **When** I click the preview button on conversation B, **Then** the system ends the preview of A, starts preview of B, and the main worktree switches to B's worktree HEAD. The visual indicator moves from A to B.
3. **Given** conversation A is being previewed, **When** I click the preview button on conversation A (the already-previewing one), **Then** the preview ends and the main worktree switches back to the base branch.
4. **Given** a conversation is being previewed, **When** I look at the conversation list, **Then** I can clearly see which conversation is currently being previewed (e.g., highlighted eye icon, "previewing" badge).
5. **Given** a conversation is being previewed, **When** the agent makes new commits in that conversation's worktree, **Then** the preview auto-syncs to the latest commit.
6. **Given** a conversation is being previewed, **When** the conversation is finalized, **Then** the preview is automatically cleaned up.

---

### Edge Cases

- Feature branch already exists → Conversation creation blocked, error toast shown (no ghost chat card)
- Worktree lost (tmp wiped) → Auto-recovery from existing branch
- Session corruption → Auto-retry without --resume flag
- Finalize conflicts → Conflicting file list shown, worktree preserved, user can retry finalize
- Preview switch during streaming → Preview updates after current turn completes
- Dirty main worktree → Preview blocked with error toast ("Commit or stash changes first")

## Requirements *(mandatory)*

### Functional Requirements

#### Worktree Lifecycle
- **FR-001**: System MUST auto-create isolated worktree per conversation — regular: `/tmp/sc-{conversationId}`, feature-originated: `/tmp/sc-{featureId}-{conversationId}`
- **FR-001a**: Feature-originated conversations MUST use featureId as branch name (e.g., `001-auth`)
- **FR-001b**: Feature-originated conversations MUST validate branch uniqueness BEFORE creating the conversation — if the feature branch already exists, the conversation MUST NOT be created and the user MUST see an error toast
- **FR-002**: System MUST use branch naming — regular: `sc/{conversationId}`, feature-originated: `{featureId}`
- **FR-024**: System MUST provide a base-branch selector when creating a new conversation. The selected branch MUST be passed to worktree creation and stored as the conversation's `baseBranch`.
- **FR-003**: System MUST auto-commit changes in worktree after each streaming turn (using `git add -A` to capture all changes including new files, respecting `.gitignore`)
- **FR-004**: System MUST provide Preview mode — checkout worktree HEAD in main worktree for testing. Preview toggle is available via the Eye/EyeSlash icon in the chat panel header. In the conversation list, previewing conversations are indicated by a red-tinted background (no separate eye icon button).
- **FR-005**: System MUST auto-sync preview branch to latest worktree HEAD on each turn (`git update-ref`)
- **FR-006**: System MUST provide Finalize button (CheckCircle) — squash all commits, rebase onto base branch, merge, cleanup
- **FR-006a**: Finalize confirmation dialog with commit message textarea and commit count
- **FR-006b**: Finalize MUST detect conflicts and return conflicting file list (preserving worktree)
- **FR-006c**: After a failed finalize (conflicts), the user MUST be able to retry finalize — the system re-attempts squash/rebase against the current base branch HEAD
- **FR-006d**: Finalize confirmation dialog MUST provide a generate button (SparklesIcon) on the right side of the commit message textarea — clicking it calls AI (Claude Haiku) to summarize the worktree's commit history and diff into a conventional commit message, which is filled into the textarea for user editing
- **FR-006e**: Finalize confirmation dialog MUST allow the user to change the target base branch — a dropdown (select) populated with all local branches (fetched from `/api/git/branches`), defaulting to the conversation's current `baseBranch`. The selected branch is used as the finalize target (squash+rebase destination). Worktree branches (`sc/` prefix) and the preview branch (`sc/preview`) MUST be excluded from the dropdown.
- **FR-006f**: If the conversation worktree HEAD equals the base branch HEAD (ahead=0, behind=0), the Finalize and Rebase buttons MUST be hidden.
- **FR-022**: System MUST provide a Rebase confirmation dialog when the Rebase button (ArrowPathIcon) is clicked
- **FR-022a**: Rebase confirmation dialog MUST display a target base branch dropdown populated with all local branches (fetched from `/api/git/branches`), excluding worktree branches (`sc/` prefix) and the preview branch (`sc/preview`)
- **FR-022b**: Rebase confirmation dialog MUST default the dropdown selection to the conversation's current `baseBranch`
- **FR-022c**: Rebase confirmation dialog MUST display the worktree branch name and commit count summary
- **FR-022d**: When the user changes the selected target branch, the commit count MUST update to reflect the ahead/behind status against the newly selected branch
- **FR-022e**: When the user confirms, the system MUST rebase the worktree onto the selected branch and update the conversation's `baseBranch` to the selected branch
- **FR-022f**: If the rebase encounters conflicts, the ConflictResolutionModal MUST be shown (same flow as finalize)
- **FR-007**: System MUST provide Delete conversation button — cleanup worktree and branches
- **FR-008**: System MUST recover worktree if /tmp is wiped (recreate from existing branch)
- **FR-009**: System MUST handle session corruption (auto-retry without --resume flag)
- **FR-014**: After successful finalize, the conversation MUST remain in the conversation list marked as "finalized" (read-only — no further messages allowed)
- **FR-015**: System MUST support concurrent streaming sessions across multiple conversations (each conversation operates in its own isolated worktree)

#### Global Preview Management
- **FR-010**: System MUST track global preview state (only one conversation can be previewed at a time)
- **FR-011**: System MUST support switching preview between conversations (end old preview, start new one)
- **FR-012**: System MUST display visual preview indicator in conversation list — previewing conversations have a red-tinted background (`bg-retro-red/10 border-retro-red/40`) and a "previewing" badge. No separate eye icon button in conversation items.
- **FR-013**: System MUST block preview if the main worktree has uncommitted changes, showing an error toast ("Commit or stash changes first")
- **FR-021**: System MUST display the worktree base branch on each conversation card when available (click-to-copy), alongside the worktree branch/path pills.

### Key Entities

- **Conversation** (worktree fields): worktreePath, worktreeBranch, baseBranch, previewBranch
- **PreviewState**: previewingConversationId (global singleton, runtime only)
- **FinalizeRequest**: conversationId, commitMessage

See `specs/007-claude-code-chat/data-model.md` for full entity definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Worktree isolation per conversation works
- [x] Feature branch conflict blocks conversation creation (no ghost chat card)
- [x] New conversation allows selecting a base branch before worktree creation
- [x] Preview mode shows worktree changes in main workspace
- [x] Finalize squashes, rebases, and cleans up correctly
- [x] Finalize allows selecting a different target base branch via dropdown
- [x] Worktree auto-recovery works after /tmp wipe
- [x] Global preview state tracked correctly (only one at a time)
- [x] Preview switching between conversations works
- [x] Visual preview indicator shown in conversation list
- [ ] Rebase shows confirmation dialog with target branch selector
- [ ] Rebase updates conversation's baseBranch after successful rebase

## Technical Implementation

### Components
- `components/chat/ChatPanel.vue` - Preview/finalize/rebase/close buttons in header
- `components/chat/FinalizeConfirm.vue` - Finalize dialog with commit message textarea and AI generate button (SparklesIcon)
- `components/chat/RebaseConfirm.vue` - Rebase confirmation dialog with target branch selector (similar to FinalizeConfirm)
- `components/chat/ConversationItem.vue` - Red-tinted background for preview state indicator, base/worktree branch and path pill buttons (click-to-copy)
- `components/conversations/NewConversationModal.vue` - New conversation dialog with base branch selector
- `components/conversations/ConversationsPanel.vue` - Opens new conversation dialog and forwards selected base branch

### Composables
- `composables/useChatStream.ts` - Auto-commit on turn completion, preview-sync after commit

### Store
- `stores/chat.ts` - createConversation({ baseBranch? }), previewingConversationId, previewConversation(), unpreviewConversation(), togglePreview(), finalizeConversation(), rebaseConversation()

### Server APIs
- `POST /api/chat/worktree` - Create conversation worktree
- `DELETE /api/chat/worktree` - Remove worktree and branch
- `POST /api/chat/worktree-commit` - Auto-commit worktree changes
- `POST /api/chat/preview` - Create preview branch in main worktree
- `DELETE /api/chat/preview` - End preview, return to base branch
- `POST /api/chat/preview-sync` - Update preview to latest worktree HEAD
- `POST /api/chat/finalize` - Squash, rebase, merge, cleanup
- `POST /api/chat/generate-commit-message` - AI-generate squash commit message from worktree history

### Server Utilities
- `server/utils/ensureChatWorktree.ts` - Worktree recovery after /tmp wipe

### Types
- `types/chat.ts` - FinalizeRequest, FinalizeResponse

## Assumptions

- Git is available on the system
- `/tmp` directory is writable for worktree creation
- Main worktree is a valid git repository

## Clarifications

### Session 2026-02-08

- Q: When preview is active and the user has uncommitted changes in the main worktree, what should happen when they switch or start a preview? → A: Block preview and show error toast ("Commit or stash changes first")
- Q: After a successful finalize, what should happen to the conversation in the UI? → A: Keep conversation in list, mark as "finalized" (read-only, no further messages)
- Q: What should the auto-commit (FR-003) include — only tracked file changes, or also new untracked files? → A: All changes including untracked files (`git add -A`)
- Q: Should multiple conversations be allowed to run streaming sessions concurrently, or only one at a time? → A: Allow concurrent streaming sessions across conversations
- Q: When finalize fails due to rebase conflicts, should the user be able to retry finalize, or must they manually rebase? → A: Allow retry — user can click Finalize again after upstream changes resolve

### Session 2026-02-13

- Q: Should the Rebase button immediately rebase onto the conversation's baseBranch, or should it show a confirmation dialog with target branch selection? → A: Show confirmation dialog with target branch selector (similar to Finalize dialog), allowing the user to select a different target base branch before rebasing (FR-022 series added)

### Conflict Resolution Enhancements
- **FR-016**: ConflictFileEditor MUST display source code with syntax highlighting using shiki, with conflict markers (ours/theirs sections) visually distinguished by background color (ours = cyan tint, theirs = magenta tint)
- **FR-017**: ConflictFileEditor MUST show line numbers alongside the highlighted source code
- **FR-018**: System MUST provide an "AI Resolve" button per conflicted file — sends the conflict content to Claude (Haiku) with instructions to intelligently merge both sides, returning clean resolved content without conflict markers
- **FR-019**: ConflictResolutionModal MUST provide an "AI Resolve All" button that sequentially resolves all unresolved files using the AI resolution API
- **FR-020**: AI resolution API (POST /api/rebase/ai-resolve) MUST accept worktreePath, filePath, and conflictContent, and return the AI-merged result
- **FR-023**: ConflictFileEditor MUST support per-conflict-block resolution actions (VS Code style) so users can accept ours, accept theirs, or accept both for each conflict block without applying to the whole file

### Conversation Creation Enhancements
- **FR-024**: New conversation flow MUST allow selecting a base branch before creation. The selected branch MUST be used by `POST /api/chat/worktree` and persisted to `Conversation.baseBranch`.

## Out of Scope

- Multi-branch preview (viewing multiple worktrees simultaneously)
- Worktree diff visualization (handled by git graph feature)
