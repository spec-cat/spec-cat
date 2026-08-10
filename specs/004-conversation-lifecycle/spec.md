# Feature Specification: Conversation Creation and Worktree Integration

## User Value

A developer can choose the execution context for a new AI conversation and intentionally integrate completed work into a selected project branch without manually managing worktrees or temporary branches.

## User Scenarios

### Scenario 1: Create a configured conversation

**Independent Test**: Open the new conversation modal, select a provider and local base branch, create the conversation, and verify its managed worktree starts from that branch and the selected provider CLI starts normally.

### Scenario 2: Rebase an active conversation

**Independent Test**: Select an active conversation, choose another local base branch, run Rebase Worktree, and verify the conversation branch is rebased while its worktree and terminal session remain available.

### Scenario 3: Finalize a completed conversation

**Independent Test**: Select an active conversation with commits, provide a squash message and target branch, finalize it, and verify the target advances to one squashed commit while the tmux session, managed worktree, and temporary branch are removed.

### Scenario 4: Browse an archived conversation

**Independent Test**: Archive a conversation, select it in the archived list, and verify its persisted terminal history is visible while terminal input and integration actions remain unavailable.

### Scenario 5: Restore and continue an archived conversation

**Independent Test**: Restore a non-finalized archived conversation and verify a new managed worktree and branch are created at the archived branch tip, then verify the original provider conversation resumes and accepts another prompt.

## Functional Requirements

- **FR-001**: The system MUST present new conversation creation in a modal.
- **FR-002**: The modal MUST allow selection of Claude or Codex and an existing local non-session base branch.
- **FR-003**: The system MUST create the managed worktree from the selected base branch.
- **FR-004**: The system MUST allow the selected provider CLI to use its own configured default model without overriding it at conversation creation.
- **FR-005**: The system MUST allow an active managed conversation to be rebased onto a selected local base branch.
- **FR-006**: A successful rebase MUST preserve the conversation worktree, temporary branch, and terminal session.
- **FR-007**: Finalization MUST save pending worktree changes before integration.
- **FR-008**: Finalization MUST rebase conversation commits onto the selected target before squashing them.
- **FR-009**: Finalization MUST fast-forward the selected target to the resulting commit without discarding unrelated main-worktree changes.
- **FR-010**: Successful finalization MUST terminate the conversation tmux session and remove its managed worktree and temporary branch.
- **FR-011**: The system MUST persist finalized state and the resulting commit hash in conversation metadata.
- **FR-012**: A finalized conversation MUST be read-only and MUST NOT restart its provider CLI.
- **FR-013**: Rebase conflicts MUST preserve the worktree and report conflicting file names.
- **FR-014**: Integration operations for one conversation MUST execute serially.
- **FR-015**: Pressing unmodified `N` outside editable or terminal input MUST open the new conversation modal.
- **FR-016**: Rebase and Finalize actions MUST remain visible in the active conversation header while the conversation is eligible for integration.
- **FR-017**: Pressing unmodified `Enter` inside the new conversation form MUST create the conversation when its required selections are valid.
- **FR-018**: The system MUST allow an archived conversation's persisted terminal history to be opened without creating a tmux session or worktree.
- **FR-019**: An archived conversation view MUST be read-only and MUST NOT expose terminal input, rebase, preview, or finalize actions.
- **FR-020**: Restoring a non-finalized archived conversation MUST create a new managed worktree and recreate its managed branch at the archived branch tip.
- **FR-021**: Restoring MUST preserve the provider conversation identifier and resume that provider conversation when the terminal runtime starts.

## Key Entities

- **Conversation Configuration**: Provider and selected base branch fixed at creation.
- **Managed Worktree**: Isolated checkout and temporary branch used by one conversation.
- **Integration Target**: Existing local branch selected for rebase or finalization.
- **Finalized Conversation**: Read-only session metadata retaining provider, target branch, and final commit.
- **Archived Conversation**: Persisted metadata and terminal history with no live tmux session or worktree.
- **Restored Conversation**: The original provider conversation bound to a newly provisioned managed git runtime.

## Success Criteria

- **SC-001**: Every modal-created conversation uses the selected provider and base branch while respecting the provider CLI's model configuration.
- **SC-002**: Rebase leaves the conversation usable when no conflict occurs.
- **SC-003**: Finalize produces at most one new commit on the selected target and removes all temporary runtime resources.
- **SC-004**: Conflicted integration leaves the worktree available for resolution and identifies each conflicted file.
- **SC-005**: An archived conversation can be inspected without recreating runtime resources or accepting input.
- **SC-006**: A restored conversation retains its archived git tip and provider context while running in a newly created worktree and branch.

## Assumptions

- The configured project is a git repository with at least one local non-session branch.
- Conflict resolution can be performed in the retained terminal worktree before retrying integration.
