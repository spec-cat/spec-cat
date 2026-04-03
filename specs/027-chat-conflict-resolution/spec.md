# Feature Specification: Chat Conflict Resolution (AI-First)

**Feature Branch**: `027-chat-conflict-resolution`  
**Created**: 2026-02-16  
**Updated**: 2026-04-03  
**Status**: Draft (Child Spec)  
**Parent**: `011-chat-worktree-integration`

## In Scope

- Git rebase/merge conflict detection and resolution workflows
- AI-first conflict resolution using settings-configured AI model
- Dedicated conflict chat panel for AI interaction and progress display
- User guidance input for context-aware AI conflict resolution
- Conflict file list browsing and read-only viewing

## Out of Scope

- Manual conflict editing (Accept Ours/Theirs/Both buttons removed)
- Worktree lifecycle operations
- Preview/finalize primary flow wiring
- Git operations outside of conflict resolution

## User Stories

### User Story 1 - AI-Driven Conflict Resolution (Priority: P1)

A developer encounters merge/rebase conflicts. Instead of manually resolving each conflict, they provide optional guidance comments and click "Resolve Conflicts Automatically" to delegate all resolution to AI. The AI uses the model configured in settings and resolves all conflicts sequentially, showing progress in a dedicated chat panel on the right side of the conflict modal.

**Why this priority**: This is the core value proposition — making conflict resolution effortless by fully delegating to AI.

**Independent Test**: Trigger a rebase with conflicts, optionally enter guidance, click resolve button, verify AI resolves all files and chat panel shows progress.

**Acceptance Scenarios**:

1. **Given** a rebase/merge results in conflicted files, **When** the conflict modal opens, **Then** the user sees a file list on the left, a file viewer in the center, and a chat panel on the right.
2. **Given** the conflict modal is open, **When** the user enters guidance text and clicks "Resolve Conflicts Automatically", **Then** the AI resolves all conflicts using the settings-configured model, incorporating the user's guidance.
3. **Given** AI resolution is in progress, **When** the AI processes each file, **Then** the chat panel displays real-time progress messages showing which file is being resolved and its result.
4. **Given** all conflicts are resolved by AI, **When** the user reviews the results, **Then** they can click "Continue Rebase" to finalize.

---

### User Story 2 - Conflict File Browsing (Priority: P1)

A developer wants to review conflicted files before or after AI resolution. They can browse the file list and view file contents (read-only) to understand the nature of conflicts and verify AI resolutions.

**Why this priority**: Understanding conflicts is essential even when delegating resolution to AI.

**Independent Test**: Open conflict modal, click through files in the list, verify content is displayed with syntax highlighting and conflict markers are visually distinguished.

**Acceptance Scenarios**:

1. **Given** conflicts are detected, **When** the modal opens, **Then** all conflicted files appear in the left sidebar with status indicators (resolved/unresolved).
2. **Given** the file list is displayed, **When** the user clicks a file, **Then** the center panel shows the file content with syntax-highlighted conflict markers (read-only).
3. **Given** AI has resolved a file, **When** the user clicks that file, **Then** the viewer shows the resolved content and the file is marked as resolved in the list.

---

### User Story 3 - Guided AI Resolution (Priority: P2)

A developer has specific knowledge about how conflicts should be resolved (e.g., "prefer the feature branch changes for the API schema" or "keep both import sets"). They enter this guidance in the comment input before triggering AI resolution, and the AI incorporates this context.

**Why this priority**: Guidance improves AI resolution quality for domain-specific conflicts.

**Independent Test**: Enter specific guidance text, trigger resolution, verify AI output reflects the guidance context.

**Acceptance Scenarios**:

1. **Given** the conflict modal is open with unresolved files, **When** the user sees the comment input area, **Then** it shows placeholder text explaining its purpose.
2. **Given** the user has typed guidance like "keep the new API endpoints from the feature branch", **When** they click resolve, **Then** the AI prompt includes this guidance for all file resolutions.

---

### User Story 4 - Conflict Workflow Control (Priority: P1)

A developer wants to continue the rebase after all conflicts are resolved or abort if the resolution is unsatisfactory.

**Why this priority**: Essential workflow control for completing or abandoning the operation.

**Independent Test**: Resolve all conflicts, verify Continue Rebase button activates. Test abort button restores pre-conflict state.

**Acceptance Scenarios**:

1. **Given** all files are resolved, **When** the user clicks "Continue Rebase", **Then** the rebase operation continues and the modal closes on success.
2. **Given** an active conflict session, **When** the user clicks "Abort", **Then** the git operation is aborted, working tree is restored, and the modal closes.
3. **Given** continuing rebase reveals more conflicts, **When** new conflicts appear, **Then** the modal refreshes with the new conflict set.

---

### Edge Cases

- Binary file conflicts (show as unresolvable in chat, skip in AI resolution)
- AI service unavailable or erroring (show error in chat panel, suggest retry)
- Very large files (> 1MB warning in chat before processing)
- No AI provider configured in settings (show error prompting user to configure)
- Conflict markers malformed or nested from previous failed resolutions
- Network interruption during AI resolution (show error, allow retry)

## Requirements

### Functional Requirements

- **FR-001**: System MUST detect and list all conflicted files from git operations, including file paths, conflict types, and conflict marker locations with response time < 500ms for repos up to 10,000 files.

- **FR-002**: System MUST provide workflow controls: "Continue Rebase" (enabled only when all files resolved) and "Abort" (always available), with state cleanup after either operation.

- **FR-003**: Conflict file viewer MUST display file content read-only with syntax highlighting, show line numbers, clearly distinguish conflict marker sections (ours/separator/theirs) with color coding, and maintain file encoding.

- **FR-004**: System MUST use the AI model configured in the settings store (`providerId` and `providerModelKey`) for all conflict resolution operations. The system MUST NOT fall back to a different provider silently.

- **FR-005**: Conflict modal MUST display a three-panel layout: file list sidebar (left), file content viewer (center), and conflict resolution chat panel (right).

- **FR-006**: System MUST provide a "Resolve Conflicts Automatically" button that triggers AI resolution of all unresolved conflict files sequentially.

- **FR-007**: System MUST provide a text input area (comment/guidance field) where users can enter optional context or instructions before triggering AI resolution. This guidance MUST be included in the AI prompt for every file resolution.

- **FR-008**: The conflict chat panel MUST display real-time progress messages during AI resolution, including: which file is currently being processed, success/failure per file, and a summary when complete.

- **FR-009**: The conflict chat panel MUST display error messages clearly when AI resolution fails for any file, with the option to retry.

- **FR-010**: System MUST track conflict resolution lifecycle states: detected, resolving (AI in progress), resolved, failed, and aborted.

- **FR-011**: When AI resolves a file successfully, the system MUST automatically write the resolved content to disk and mark the file as resolved (git add).

- **FR-012**: System MUST validate conflict state consistency before "Continue Rebase", ensuring all conflicts are resolved in git and state matches filesystem.

### Key Entities

- **ConflictFile**: Represents a file with conflict markers (path, content, git status code)
- **ConflictChatMessage**: A message in the conflict chat panel (role: system/assistant/user, content, timestamp, optional file reference)
- **AiResolveRequest**: Request to resolve a conflict file (worktreePath, filePath, conflictContent, userGuidance)
- **AiResolveResponse**: AI resolution result (success, resolvedContent, error)

## Success Criteria

### Measurable Outcomes

- **SC-001**: User can resolve all merge/rebase conflicts with a single button click (zero manual conflict editing required).
- **SC-002**: Conflict detection completes in < 500ms, AI resolution processes each file in < 10 seconds.
- **SC-003**: Chat panel provides clear visibility into resolution progress and results for every file.
- **SC-004**: System correctly uses the settings-configured AI model for all resolution operations.

## Assumptions

- Git version 2.34+ is available on the system
- Conflict markers follow standard git format
- File system has necessary read/write permissions
- AI provider configured in settings is available and has sufficient quota
- Maximum of 1000 conflicted files per session
