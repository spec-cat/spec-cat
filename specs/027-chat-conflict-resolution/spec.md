# Feature Specification: Chat Conflict Resolution

**Feature Branch**: `027-chat-conflict-resolution`
**Created**: 2026-02-16
**Status**: Draft (Child Spec)
**Parent**: `011-chat-worktree-integration`

## In Scope

- Git rebase/merge conflict detection and resolution workflows
- Conflict resolution UI components and interactions
- Optional AI-assisted conflict resolution capabilities
- Conflict state management and persistence

## Out of Scope

- Worktree lifecycle operations
- Preview/finalize primary flow wiring
- Git operations outside of conflict resolution

## User Stories

### User Story 1 - Conflict Detection
**As a** developer working with git conflicts
**I want** to see all conflicted files clearly when a rebase/merge has conflicts
**So that** I can understand what needs resolution before continuing

### User Story 2 - Manual Conflict Resolution
**As a** developer resolving conflicts
**I want** to edit conflict markers in a dedicated editor with syntax highlighting
**So that** I can make informed decisions about which changes to keep

### User Story 3 - AI-Assisted Resolution
**As a** developer with complex conflicts
**I want** to optionally use AI to suggest conflict resolutions
**So that** I can resolve conflicts faster while maintaining control

### User Story 4 - Conflict Workflow Control
**As a** developer in a conflict resolution flow
**I want** to continue the operation after resolving or abort if needed
**So that** I maintain control over my git state

## Acceptance Scenarios

### Scenario 1: Conflict File Detection
**Given** a git operation results in conflicts
**When** the conflict detection API is called
**Then** all conflicted files are returned with paths and conflict marker locations

### Scenario 2: Single File Resolution
**Given** a conflicted file is open in the editor
**When** the user resolves conflicts and saves
**Then** the file is marked as resolved and can proceed to next conflict

### Scenario 3: AI Resolution Request
**Given** a conflicted file with standard git markers
**When** the user requests AI resolution
**Then** AI provides a suggested resolution that preserves semantic intent from both sides

### Scenario 4: Abort Conflict Flow
**Given** an active conflict resolution session
**When** the user chooses to abort
**Then** the git operation is safely aborted and working tree is restored

## Functional Requirements

### FR-001: Conflict Detection and Listing
System MUST detect and list all conflicted files from git operations, including file paths, conflict types (content/modify-delete/rename), and conflict marker line numbers with response time < 500ms for repos up to 10,000 files.

### FR-002: Per-File Resolution Flow
System MUST provide individual file resolution with mark-as-resolved capability, supporting continue operation after all conflicts resolved or abort operation to restore pre-conflict state, with state persistence across page refreshes.

### FR-003: Conflict Editor Interface
Conflict editor MUST display git conflict markers with syntax highlighting, show line numbers, support standard text editing operations, clearly distinguish <<<<<<< HEAD, =======, and >>>>>>> markers with visual indicators, and maintain file encoding.

### FR-004: AI-Assisted Conflict Resolution
System MUST provide optional AI resolution that analyzes both sides of conflicts, suggests semantically appropriate merges, remains isolated to conflict resolution APIs only, provides explanations for suggestions, and allows user override of any suggestion.

### FR-016: Conflict Editor Syntax Highlighting
Editor MUST provide language-specific syntax highlighting for code within conflict blocks, maintaining highlighting even with conflict markers present, with support for TypeScript, JavaScript, Vue, CSS, JSON, and Markdown files.

### FR-017: Conflict Editor Line Numbers
Editor MUST show accurate line numbers that account for conflict markers, update dynamically as conflicts are resolved, and maintain correct line number mapping for error reporting.

### FR-018: Per-File AI Resolution API
System MUST implement AI resolution endpoint that accepts single conflicted file content, returns suggested resolution with explanations, handles rate limiting with max 10 requests per minute, and validates file size < 1MB.

### FR-019: Batch AI Resolution
System MUST support "AI Resolve All" operation that processes multiple conflicts in sequence, shows progress indicator, allows cancellation mid-operation, and falls back to manual resolution on AI failure.

### FR-020: AI Resolution Data Types
System MUST define AiResolveRequest with fields for fileContent, filePath, and conflictContext, and AiResolveResponse with resolvedContent, explanation, and confidence score (0-1).

### FR-021: Conflict Lifecycle State Management
System MUST track conflict resolution lifecycle states including: detected, in-progress, resolved, failed, and aborted, with transitions logged for debugging and state recovery.

### FR-006D: Conflict State Persistence
System MUST persist conflict resolution progress to allow recovery from page refresh, including resolved files list, in-progress edits, and resolution method used (manual/AI).

### FR-006E: Conflict State Cleanup
System MUST clean up conflict state data after successful continue or abort operations, ensuring no orphaned state remains in storage.

### FR-006F: Conflict State Validation
System MUST validate conflict state consistency before continue operations, ensuring all conflicts are actually resolved in git and state matches filesystem.

## Key Entities

### ConflictFile
- path: string (relative file path)
- status: 'unresolved' | 'resolved' | 'error'
- conflictType: 'content' | 'modify-delete' | 'rename'
- markers: Array<{start: number, end: number, type: 'ours' | 'separator' | 'theirs'}>

### ConflictSession
- id: string (unique session identifier)
- operation: 'rebase' | 'merge' | 'cherry-pick'
- files: Array<ConflictFile>
- startedAt: timestamp
- state: 'active' | 'completed' | 'aborted'

### AiResolveRequest
- fileContent: string (full file content with markers)
- filePath: string (for context)
- conflictContext: string (operation type and branch info)

### AiResolveResponse
- resolvedContent: string (suggested resolution)
- explanation: string (reasoning for resolution)
- confidence: number (0-1 confidence score)

## Success Criteria

### SC-001: Isolated Conflict Workflow
Conflict resolution workflow operates independently without requiring modifications to worktree lifecycle, preview, or finalize APIs, verified by API call tracing showing no calls to excluded endpoints.

### SC-002: Reproducible Conflict Resolution
All conflict resolution operations produce identical results when repeated with same inputs, including AI suggestions (given same model), file marking operations, and state transitions, verified by automated replay tests.

### SC-003: Conflict Resolution Performance
Conflict detection completes in < 500ms for repos with up to 10,000 files, editor loads conflicts in < 200ms, AI resolution responds in < 5 seconds per file, verified by performance benchmarks.

### SC-004: State Recovery Resilience
Conflict resolution state survives page refreshes, network interruptions, and process restarts, with < 5 second recovery time to restore previous state, verified by chaos testing.

## Edge Cases

- Binary file conflicts (should show as unresolvable)
- Conflicts in generated files (should warn before resolution)
- Symbolic link conflicts
- Permission/mode change conflicts
- Very large files (> 10MB)
- Malformed conflict markers
- Nested conflict markers from previous failed resolutions

## Assumptions

- Git version 2.34+ is available on the system
- Conflict markers follow standard git format
- File system has necessary read/write permissions
- AI service (if used) has appropriate rate limits configured
- Maximum of 1000 conflicted files per session
