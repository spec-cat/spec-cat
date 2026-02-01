# Feature Specification: Chat Permission System

**Feature Branch**: `010-chat-permission-system`
**Created**: 2026-02-08
**Status**: Implemented
**Split from**: `007-claude-code-chat` (original FR-029 ~ FR-033)
**Dependencies**: 007-claude-code-chat

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Permission Control (Priority: P2)

As a developer, I want to control what Claude can do so that I can balance automation with oversight.

**Acceptance Scenarios**:

1. **Given** the chat input, **When** I open the permission mode dropdown, **Then** I see 4 modes: plan, ask, auto, bypass.
2. **Given** I'm in "ask" mode, **When** Claude needs to use a tool, **Then** I see a permission request with tool name, description, and Allow/Deny buttons.
3. **Given** Claude proposes a plan, **When** I'm in plan mode, **Then** I see the plan with Approve/Reject buttons.

---

### Edge Cases

- Permission mode not saved → Defaults to "ask" mode
- WebSocket disconnect during permission request → Request is lost, user must retry

## Requirements *(mandatory)*

### Functional Requirements

#### Permission Modes
- **FR-001**: System MUST provide 4 permission modes: plan, ask, auto, bypass
- **FR-002**: System MUST show permission mode selector dropdown with icons and colors
- **FR-003**: System MUST display permission request UI (tool name, description, Allow/Deny) in "ask" mode
- **FR-004**: System MUST display plan approval UI (Approve/Reject) in "plan" mode
- **FR-005**: System MUST persist permission mode to localStorage (`chat-permission-mode`)

### Key Entities

- **PermissionMode**: 'plan' | 'ask' | 'auto' | 'bypass'
- **PermissionRequest**: tool name, description, allow/deny

See `specs/007-claude-code-chat/data-model.md` for full entity definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] Permission modes (plan/ask/auto/bypass) work correctly
- [x] Permission request UI shows tool name and Allow/Deny buttons
- [x] Plan approval UI shows Approve/Reject buttons
- [x] Permission mode persists across page refreshes

## Technical Implementation

### Components
- `components/chat/ChatInput.vue` - Permission mode selector dropdown, permission request/plan approval UI

### Composables
- `composables/useChatStream.ts` - Permission handling (setPendingPermission, setPendingPlanApproval, ExitPlanMode intercept)

### Store
- `stores/chat.ts` - permissionMode state, localStorage persistence

### Types
- `types/chat.ts` - PermissionMode union type

### WebSocket
- `/_ws` - Permission mode sent with connection, permission responses sent back to CLI

## Assumptions

- Claude Code CLI supports permission modes via `--allowedTools` and `--permissionMode` flags
- WebSocket connection is established before permission requests arrive

## Out of Scope

- Custom permission rules per tool
- Permission audit logging
- Role-based access control
