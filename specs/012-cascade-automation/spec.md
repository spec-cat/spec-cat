# Feature Specification: Cascade Automation

**Feature Branch**: `012-cascade-automation`
**Created**: 2026-02-08
**Status**: Implemented
**Split from**: `007-ai-provider-chat` (original FR-043 ~ FR-046)
**Dependencies**: 007-ai-provider-chat, 009-conversation-management, 011-chat-worktree-integration

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cascade Automation (Priority: P2)

As a developer, I want to trigger Speckit pipeline steps from the Kanban feature list directly into the chat.

**Acceptance Scenarios**:

1. **Given** I click "Plan" on a feature, **When** the step completes, **Then** "Tasks" and "Implement" buttons are auto-enabled.
2. **Given** an existing conversation for a feature, **When** I click a pipeline button, **Then** the existing conversation is reused.
3. **Given** I Shift+click, **Then** a new conversation is forced regardless of existing ones.

---

### Edge Cases

- Feature has no existing conversation → New conversation is created
- Conversation is currently streaming → Step is queued until completion
- WebSocket disconnects mid-cascade → Queue is lost, user must restart

## Requirements *(mandatory)*

### Functional Requirements

#### Cascade Pipeline
- **FR-001**: System MUST support cascade from Kanban feature (Plan → Tasks → Implement)
- **FR-002**: System MUST queue subsequent cascade steps and auto-send on completion. Steps may be `/speckit.*` commands or `skill:*` prompt steps.
- **FR-003**: System MUST reuse existing conversation by featureId
- **FR-004**: System MUST support force-new conversation via Shift+click

### Key Entities

- **Conversation** (cascade field): featureId
- **CascadeState**: queue of pending cascade steps (speckit commands and/or skill prompt steps), auto-send on 'done' event

See `specs/007-ai-provider-chat/data-model.md` for full entity definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Cascade automation queues and executes pipeline steps
- [x] Existing conversations are reused by featureId
- [x] Shift+click forces new conversation

## Technical Implementation

### Composables
- `composables/useChatStream.ts` - enableCascade, sendCascadeStep, cascadeStates queue, auto-send on 'done'

### Store
- `stores/chat.ts` - findConversationByFeature, createConversation with featureId

### Integration Points
- `004-kanban-board` - Pipeline buttons trigger cascade

## Assumptions

- Kanban board feature (004) provides pipeline trigger UI
- Speckit pipeline steps are well-defined prompts
- Each feature has a unique featureId

## Out of Scope

- Custom pipeline step definitions
- Cascade progress visualization
- Parallel pipeline execution
