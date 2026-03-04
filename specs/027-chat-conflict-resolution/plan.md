# Implementation Plan: Chat Conflict Resolution

**Branch**: `027-chat-conflict-resolution` | **Date**: 2026-02-16 | **Spec**: `specs/027-chat-conflict-resolution/spec.md`

## Summary

Implement a dedicated conflict resolution system that handles git rebase/merge conflicts through specialized APIs and UI components. The system provides both manual and AI-assisted resolution capabilities while maintaining clean separation from worktree lifecycle operations.

## Technical Context

### Stack Components
- **Backend**: Nuxt 3.16+ server with Nitro runtime
- **Frontend**: Vue 3.5+ with TypeScript 5.6+
- **State Management**: Pinia 2.2+ for conflict session state
- **UI Components**: Tailwind CSS with @heroicons/vue
- **Git Integration**: Node child_process for git commands

### Dependencies
- Git 2.34+ (for conflict detection commands)
- Existing chat store infrastructure
- Filesystem access for reading conflicted files
- Optional: AI service integration (rate-limited)

### Constraints
- Must not modify parent feature's worktree lifecycle APIs
- Must maintain compatibility with existing chat session structure
- Conflict state must persist across page refreshes
- Performance: < 500ms conflict detection for large repos

## Constitution Check

This implementation aligns with project constitution by:
- Maintaining clear module boundaries (conflict resolution isolated from lifecycle)
- Following existing patterns from chat store and API structure
- Preserving spec → plan → task traceability
- Using established tech stack without new dependencies

## Project Structure

### Owned Files

```
server/api/rebase/
├── conflicts.get.ts         # List conflicted files [FR-001]
├── resolve.post.ts          # Mark file as resolved [FR-002]
├── continue.post.ts         # Continue after resolution [FR-002]
├── abort.post.ts            # Abort conflict flow [FR-002]
└── ai-resolve.post.ts       # AI resolution endpoint [FR-018]

components/chat/
├── ConflictResolutionModal.vue   # Main conflict UI [FR-002, FR-019]
└── ConflictFileEditor.vue        # Individual file editor [FR-003, FR-016, FR-017]

stores/
└── chat.ts                  # Conflict state section [FR-021, FR-006D/E/F]

types/
└── chat.ts                  # AiResolveRequest/Response types [FR-020]
```

### Do Not Edit

```
server/api/chat/worktree*.ts    # Parent feature's lifecycle
server/api/chat/preview*.ts     # Preview flow (out of scope)
server/api/chat/finalize.post.ts # Finalize flow (out of scope)
```

## Implementation Approach

### 1. Conflict Detection Layer
- Use `git diff --name-only --diff-filter=U` for conflict listing
- Parse git conflict markers to identify line ranges
- Cache detection results for performance

### 2. State Management Strategy
- Extend chat store with `conflictSession` state
- Persist using existing conversation persistence
- Clear state on successful continue/abort

### 3. Editor Component Architecture
- Use Monaco Editor or CodeMirror for syntax highlighting
- Custom conflict marker decorations
- Two-way binding with resolution state

### 4. AI Integration Pattern
- Separate endpoint to maintain API boundary
- Request queuing for rate limiting
- Fallback to manual on AI service errors

### 5. Error Handling Philosophy
- Graceful degradation (AI fails → manual)
- Clear error messages with recovery actions
- State rollback on operation failures

## Key Design Decisions

### Decision 1: Conflict State Storage
**Choice**: Extend existing chat store vs separate conflict store
**Selected**: Extend chat store
**Rationale**: Maintains state cohesion, reuses persistence infrastructure

### Decision 2: Editor Library
**Choice**: Monaco Editor vs CodeMirror vs Custom
**Selected**: Monaco Editor (if bundle size acceptable), else CodeMirror
**Rationale**: Best syntax highlighting support, conflict marker API

### Decision 3: AI Service Integration
**Choice**: Direct API vs queued processing
**Selected**: Queued with rate limiting
**Rationale**: Prevents service overload, better UX with progress

### Decision 4: Conflict Marker Parsing
**Choice**: Regex parsing vs Git plumbing commands
**Selected**: Regex for display, git commands for resolution
**Rationale**: Faster rendering, accurate git state management

## Generated Artifacts

No additional artifacts needed - all requirements sufficiently detailed in spec.md.

## FR Coverage Matrix

| FR | Implementation Approach |
|----|------------------------|
| FR-001 | Git command wrapper in conflicts.get.ts with caching |
| FR-002 | Individual endpoints for resolve/continue/abort with state validation |
| FR-003 | Monaco/CodeMirror integration with conflict decorations |
| FR-004 | Isolated ai-resolve.post.ts endpoint with request validation |
| FR-016 | Language detection + Monaco syntax highlighting |
| FR-017 | Editor line number configuration with marker offsets |
| FR-018 | Queued AI service calls with rate limiting |
| FR-019 | Batch processing in Modal with progress tracking |
| FR-020 | TypeScript interfaces in types/chat.ts |
| FR-021 | State machine in chat store with transition logging |
| FR-006D | Leverage existing chat conversation persistence |
| FR-006E | Cleanup hooks in continue/abort endpoints |
| FR-006F | Pre-flight validation before git continue |

## Testing Strategy

### Unit Tests
- Conflict marker parsing regex
- State transition validations
- AI response processing

### Integration Tests
- Git command execution with fixtures
- API endpoint error scenarios
- State persistence/recovery

### E2E Tests
- Full conflict resolution flow
- AI resolution with fallback
- Abort/recovery scenarios

## Performance Considerations

- Cache git conflict detection (5s TTL)
- Lazy load editor component
- Stream large file content
- Debounce resolution state saves
- Virtual scrolling for many conflicts

## Security Considerations

- Validate file paths (no directory traversal)
- Sanitize AI responses (no code injection)
- Rate limit AI endpoints per session
- Validate git command outputs
- Check file size limits before processing
