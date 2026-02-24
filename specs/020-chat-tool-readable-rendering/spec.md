# Feature Specification: Human-Readable Tool Rendering in Chat

**Feature Branch**: `020-chat-tool-readable-rendering`  
**Created**: 2026-02-14  
**Status**: In Progress  
**Input**: User request: "In the chat window, display read/write/edit contents in a human-readable way, ideally like GitHub Copilot"
**Dependencies**: 007-ai-provider-chat, 017-ai-provider-abstraction, 018-codex-provider-integration

## User Scenarios & Testing

### User Story 1 - Read Tool Clarity (Priority: P1)

A developer wants `Read` tool usage shown with clear file path and range so they can quickly understand what the agent inspected.

**Independent Test**: Trigger a `Read` tool call and verify chat shows readable path/range summary without opening raw JSON.

**Acceptance Scenarios**:

1. **Given** a tool block with `name=Read`, **When** rendered in chat, **Then** the header shows a readable summary including file path when present.
2. **Given** read range inputs (`offset/limit` or line fields), **When** expanded, **Then** range details are shown as human-readable text.
3. **Given** users need debugging detail, **When** expanded, **Then** raw input JSON remains available in a collapsible section.

---

### User Story 2 - Write/Edit Diff-Like Readability (Priority: P1)

A developer wants `Write` and `Edit` tool actions displayed like a concise patch preview so they can review what changed at a glance.

**Independent Test**: Trigger `Write` and `Edit` tool calls and verify new/old content snippets are visible in structured sections.

**Acceptance Scenarios**:

1. **Given** a tool block with `name=Write`, **When** expanded, **Then** file path and new content preview are shown in dedicated sections.
2. **Given** a tool block with `name=Edit` or `name=MultiEdit`, **When** expanded, **Then** "Before" and "After" previews are shown in separate labeled panels.
3. **Given** very long content, **When** preview is rendered, **Then** content is truncated with explicit truncation hint.

---

### User Story 3 - Backward-Compatible Fallback (Priority: P1)

A developer wants non-Read/Write/Edit tools to keep current behavior so no existing tool rendering regresses.

**Independent Test**: Trigger non-target tools (e.g., `Bash`, `Grep`) and verify existing summary/result rendering still works.

**Acceptance Scenarios**:

1. **Given** an unknown or non-target tool name, **When** rendered, **Then** current summary/result UI remains available.
2. **Given** tool input lacks known keys, **When** rendered, **Then** component falls back to existing `inputSummary` and raw JSON display.
3. **Given** tool results are present, **When** rendered, **Then** current result preview/collapse behavior remains unchanged.

## Requirements

### Functional Requirements

- **FR-001**: Chat tool headers MUST show human-readable summary text for `Read`, `Write`, `Edit`, and `MultiEdit` when path/content fields exist.
- **FR-002**: Expanded `Read` tool view MUST display file path and read range metadata in readable labels.
- **FR-003**: Expanded `Write` tool view MUST display file path plus a truncated new-content preview block.
- **FR-004**: Expanded `Edit`/`MultiEdit` view MUST display file path plus separate `Before` and `After` preview blocks.
- **FR-005**: Long previews MUST be truncated with explicit visual hint that the preview is partial.
- **FR-006**: Raw tool input JSON MUST remain accessible via collapsible section for debugging.
- **FR-007**: Non-target tools MUST preserve existing rendering behavior and status/result states.

### Non-Functional Requirements

- **NFR-001**: Rendering changes MUST remain within existing chat panel layout constraints on desktop and mobile widths.
- **NFR-002**: No changes to stream protocol, provider payload schema, or store persistence format.

## Success Criteria

- **SC-001**: In manual chat runs, `Read/Write/Edit` blocks are understandable without reading raw JSON.
- **SC-002**: `Write/Edit` previews show structured labels (`File`, `Before`, `After`, `New Content`) in all tested cases.
- **SC-003**: Non-target tools render without behavioral regression compared to previous UI.
