# Implementation Plan: Chat Conflict Resolution (AI-First)

**Branch**: `027-chat-conflict-resolution` | **Date**: 2026-04-03 | **Spec**: `specs/027-chat-conflict-resolution/spec.md`

## Summary

Overhaul the conflict resolution UI from a manual-editing workflow to an AI-first approach. The modal adopts a three-panel layout (file list / file viewer / chat panel) where users provide optional guidance comments and click "Resolve Conflicts Automatically" to delegate all resolution to AI. Manual conflict editing controls (Accept Ours/Theirs/Both, edit mode) are removed. The system enforces use of the settings-configured AI model.

## Technical Context

### Stack Components
- **Backend**: Nuxt 3.16+ server with Nitro runtime
- **Frontend**: Vue 3.5+ with TypeScript 5.6+
- **State Management**: Pinia 2.2+ for conflict session state
- **UI Components**: Tailwind CSS with @heroicons/vue
- **Git Integration**: Node child_process for git commands

### Dependencies
- Git 2.34+ (for conflict detection commands)
- Existing chat store infrastructure (`stores/chat.ts`)
- Settings store (`stores/settings.ts`) for AI provider/model selection
- AI resolve endpoint (`server/api/rebase/ai-resolve.post.ts`)
- Existing conflict detection/resolve/continue/abort APIs

### Constraints
- Must not modify parent feature's worktree lifecycle APIs
- Must use the AI model configured in settings (no silent fallback)
- Chat panel is conflict-specific (not the main conversation chat)

## Project Structure

### Owned Files

```
server/api/rebase/
├── conflicts.get.ts           # List conflicted files [FR-001] (existing)
├── resolve.put.ts             # Write resolved content + git add [FR-011] (existing)
├── continue.post.ts           # Continue after resolution [FR-002] (existing)
├── continue-sync.post.ts      # Continue sync mode [FR-002] (existing)
├── abort.post.ts              # Abort conflict flow [FR-002] (existing)
└── ai-resolve.post.ts         # AI resolution endpoint [FR-004, FR-007] (modify)

components/chat/
├── ConflictResolutionModal.vue  # Three-panel layout [FR-005, FR-006] (rewrite)
├── ConflictFileEditor.vue       # Read-only file viewer [FR-003] (modify)
└── ConflictChatPanel.vue        # Conflict chat panel [FR-008, FR-009] (new)

stores/
└── chat.ts                      # Conflict state + chat messages [FR-010, FR-011] (modify)

types/
└── chat.ts                      # Updated types [FR-007]
```

### Do Not Edit

```
server/api/chat/worktree*.ts     # Parent feature's lifecycle
server/api/chat/preview*.ts      # Preview flow (out of scope)
server/api/chat/finalize.post.ts # Finalize flow (out of scope)
stores/settings.ts               # Read only, do not modify
```

## Implementation Approach

### 1. Three-Panel Modal Layout [FR-005]
- Widen modal to `max-w-7xl` to accommodate three panels
- Left panel: file list sidebar (existing, keep as-is)
- Center panel: read-only file viewer (simplify ConflictFileEditor)
- Right panel: new ConflictChatPanel component

### 2. ConflictFileEditor Simplification [FR-003]
- Remove all manual editing controls: Accept Ours/Theirs/Both buttons, edit mode toggle, inline conflict action buttons, Mark Resolved button
- Keep: syntax highlighting, conflict marker coloring, line numbers
- Make viewer completely read-only

### 3. ConflictChatPanel Component [FR-008, FR-009]
- New component showing conflict resolution chat messages
- Top area: scrollable message list (system messages, progress updates, errors)
- Bottom area: guidance text input + "Resolve Conflicts Automatically" button
- Messages track: resolution start, per-file progress, per-file result, errors, completion summary

### 4. AI Resolution with User Guidance [FR-004, FR-007]
- Modify `ai-resolve.post.ts` to accept optional `userGuidance` field
- Include user guidance in AI prompt for every file
- Read provider/model from settings; error if provider unavailable (no silent fallback)
- Update `AiResolveRequest` type to include `userGuidance?: string`

### 5. Store Changes [FR-010, FR-011]
- Add `conflictChatMessages` array to conflict state
- Add `addConflictChatMessage()` helper
- Modify `aiResolveAllConflicts()` to post progress messages to chat
- Add `userGuidance` field to conflict state
- Track lifecycle states: detected → resolving → resolved/failed/aborted

### 6. Workflow Controls [FR-002, FR-006]
- "Resolve Conflicts Automatically" button in chat panel (replaces header AI Resolve All)
- "Continue Rebase" and "Abort" remain in header
- Continue only enabled when all files resolved
- Abort always available

## Key Design Decisions

### Decision 1: Chat Panel Scope
**Choice**: Dedicated conflict chat vs reuse main conversation chat
**Selected**: Dedicated conflict chat panel
**Rationale**: Conflict resolution is a focused workflow; mixing with main conversation adds noise

### Decision 2: Manual Editing Removal
**Choice**: Keep manual editing as fallback vs remove entirely
**Selected**: Remove entirely
**Rationale**: User explicitly wants AI-first, all-in approach. File viewer remains read-only for review.

### Decision 3: AI Provider Enforcement
**Choice**: Fall back to Claude if other provider selected vs enforce settings
**Selected**: Enforce settings, error if unavailable
**Rationale**: User wants explicit control via settings; silent fallback is confusing

### Decision 4: Guidance Input Placement
**Choice**: Separate input in header vs integrated in chat panel
**Selected**: Integrated in chat panel bottom area
**Rationale**: Natural chat UX — guidance text sits next to the resolve button

## FR Coverage Matrix

| FR | Implementation Approach |
|----|------------------------|
| FR-001 | Existing conflicts.get.ts endpoint (no changes needed) |
| FR-002 | Continue/Abort buttons in modal header, existing endpoints |
| FR-003 | ConflictFileEditor simplified to read-only viewer with syntax highlighting |
| FR-004 | ai-resolve.post.ts reads provider from settings, no fallback |
| FR-005 | ConflictResolutionModal three-panel layout rewrite |
| FR-006 | "Resolve Conflicts Automatically" button in ConflictChatPanel |
| FR-007 | User guidance input in ConflictChatPanel, passed to AI endpoint |
| FR-008 | ConflictChatPanel message list with real-time updates |
| FR-009 | Error messages in chat panel with retry option |
| FR-010 | Conflict lifecycle state in chat store |
| FR-011 | Auto-write + git add after AI resolve (existing resolveConflictFile) |
| FR-012 | Pre-flight validation in continueRebase (existing) |

## Testing Strategy

### Manual Testing
- Trigger rebase conflict, verify three-panel layout
- Enter guidance, click resolve, verify AI uses guidance
- Verify chat panel shows progress messages
- Verify continue/abort workflow
- Test with no AI provider configured

### Integration Tests
- AI resolve endpoint with user guidance
- Provider enforcement (no fallback)
- State lifecycle transitions

## Performance Considerations

- Lazy load ConflictChatPanel component
- Virtual scrolling for chat messages if many files
- AI resolution processes files sequentially to avoid rate limits
