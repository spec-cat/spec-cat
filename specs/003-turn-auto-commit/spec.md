# Feature Specification: Conversation Turn Auto-Commit

## User Value

A developer can treat each completed AI response as a recoverable checkpoint without interrupting the conversation to stage and commit files manually.

## User Scenarios

### Scenario 1: Commit a completed Claude response

**Independent Test**: Submit one request in a Claude conversation that changes a tracked or untracked file, wait for Claude's main prompt to return, and verify exactly one new commit contains the resulting workspace changes.

### Scenario 2: Commit a completed Codex response

**Independent Test**: Submit one request in a Codex conversation that changes a tracked or untracked file, wait for Codex's composer and model footer to return, and verify exactly one new commit contains the resulting workspace changes.

### Scenario 3: Skip an empty response checkpoint

**Independent Test**: Complete a response that leaves the worktree unchanged and verify that no commit is created.

## Functional Requirements

- **FR-001**: The system MUST arm completion detection when terminal input containing Enter is submitted for a conversation.
- **FR-002**: The system MUST detect Claude completion using Claude-specific main-prompt output.
- **FR-003**: The system MUST detect Codex completion using Codex-specific composer and model-footer output.
- **FR-004**: The system MUST wait for terminal output to become quiet before evaluating response completion.
- **FR-005**: The system MUST stage all tracked and untracked, non-ignored worktree changes after a completed response.
- **FR-006**: The system MUST create one provider-labelled commit when staged changes exist.
- **FR-007**: The system MUST create no commit when the worktree has no committable changes.
- **FR-008**: The system MUST serialize auto-commit attempts for the same worktree.
- **FR-009**: The system MUST report auto-commit success or failure in the conversation terminal without terminating the provider session.

## Key Entities

- **Turn Monitor**: Per-session state that tracks submission, subsequent output, quiet time, and provider prompt reappearance.
- **Provider Completion Detector**: Claude- or Codex-specific logic that identifies the provider's main input prompt.
- **Turn Checkpoint**: A git commit containing all worktree changes present when one response completes.

## Success Criteria

- **SC-001**: A response with file changes creates exactly one commit after the provider returns to its main prompt.
- **SC-002**: A response without file changes creates zero commits.
- **SC-003**: Permission prompts and transient pauses do not create a checkpoint before the main provider prompt returns.

## Assumptions

- Conversations run inside valid managed git worktrees.
- Provider terminal layouts retain their main prompt and footer markers.
- Existing repository ignore rules define which untracked files are eligible for staging.
