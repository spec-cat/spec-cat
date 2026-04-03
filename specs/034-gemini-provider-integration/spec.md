# Feature Specification: Gemini Provider Integration

**Feature Branch**: `[034-gemini-provider-integration]`  
**Created**: 2026-03-02  
**Status**: Implemented  
**Input**: User description: "gemini provider 구현"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gemini CLI Integration (Priority: P1)

As a user, I want to use Google's Gemini models via the local Gemini CLI so that I can leverage different AI capabilities within the Spec Cat workspace.

**Why this priority**: Expanding AI provider support is critical for user flexibility and leveraging the latest models.

**Independent Test**: Can be fully tested by selecting "Gemini CLI" from the provider dropdown and initiating a chat.

**Acceptance Scenarios**:

1. **Given** the user is in the chat panel, **When** they open the provider selection, **Then** "Gemini CLI" should be listed alongside Claude and Codex.
2. **Given** Gemini CLI is selected, **When** the user sends a message, **Then** the local `gemini` executable should be spawned with `stream-json` output format.

### User Story 2 - Model Selection (Priority: P2)

As a user, I want to choose between different Gemini models (Flash, Pro, Experimental) so that I can balance speed and capability for my tasks.

**Why this priority**: Different tasks require different model strengths (e.g., Flash for speed, Pro for reasoning).

**Independent Test**: Ensure that changing the model in the UI passes the correct model ID to the `gemini` CLI process.

**Acceptance Scenarios**:

1. **Given** Gemini is the active provider, **When** I view the model list, **Then** I should see "Gemini 2.0 Flash", "Gemini 2.0 Pro", and "Gemini 2.0 Flash Thinking".

## Requirements *(mandatory)*

### Functional Requirements

#### Core Provider
- **FR-001**: System MUST implement the `AIProvider` interface for Gemini.
- **FR-002**: System MUST locate the `gemini` CLI executable in the system PATH or common installation directories.
- **FR-003**: System MUST support spawning the `gemini` CLI with `--output-format stream-json`.
- **FR-004**: System MUST parse the streaming JSON output and convert it into `UIStreamEvent` using the canonical event format.
- **FR-005**: System MUST provide at least three Gemini models (flash, pro, experimental).
- **FR-006**: System MUST register `geminiProvider` in the `aiProviderRegistry`.

#### Tool Use Event Mapping
- **FR-007**: System MUST map Gemini `tool_use` events to canonical `block_start` (blockType `tool_use`) + `block_delta` (with `parameters` JSON) + `block_end` events.
- **FR-008**: System MUST map Gemini `tool_result` events to `UIStreamToolResultEvent`, including error content from `event.error.message`.
- **FR-009**: System MUST maintain per-session state (`textOpen`, `textBlockId`, `nextIndex`) to correctly handle interleaved text and tool blocks within a single turn.
- **FR-010**: System MUST track `lastKnownSessionId` separately since Gemini CLI only provides `session_id` in the init event, not subsequent events.

#### Error Handling
- **FR-011**: System MUST emit `UIStreamErrorEvent` when the Gemini CLI result event has `status !== 'success'`, extracting error detail from nested `error.message` and `result.error.message` structures.
- **FR-012**: System MUST handle `--resume "default-session"` exit code 42 gracefully (retry without resume).

#### Session Resume
- **FR-013**: System MUST support session resume via `--resume` flag using the tracked session ID from the init event.

### Key Entities

- **`geminiProvider`**: Implementation of `AIProvider` that manages the lifecycle of the Gemini CLI process.
- **`GeminiModelEntry`**: Represents the configuration for a specific Gemini model.
- **`GeminiSessionState`**: Per-session state tracking text/tool block interleaving (`textOpen`, `textBlockId`, `nextIndex`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `geminiProvider` successfully streams JSON and integrates with the existing chat UI without errors.
- **SC-002**: Process lifecycle (spawning, killing, handling signals) is managed robustly without zombie processes.
- **SC-003**: Tool use/result events from Gemini are rendered correctly in `ChatToolBlock` using Gemini-specific tool names (`read_file`, `write_file`, `edit_file`, `run_shell_command`, etc.).
- **SC-004**: Structured error messages from Gemini CLI are surfaced to the user via `UIStreamErrorEvent`.
