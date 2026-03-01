# Feature Specification: Canonical Multi-Provider Abstraction for Chat Streaming

**Feature Branch**: `033-provider-canonical-abstraction`  
**Created**: 2026-03-01  
**Status**: Draft  
**Input**: User request: "Claude/Codex/Gemini provider structure needs unified abstraction and integrated behavior"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider-owned canonical event adapters (Priority: P1)

As a maintainer, I want each provider to convert raw output into canonical chat events inside provider boundaries so that WebSocket routes remain provider-agnostic.

**Why this priority**: Without this, every new provider adds conditional routing logic and increases integration risk.

**Independent Test**: Confirm `server/routes/_ws.ts` does not branch on provider ID for event transformation while Claude/Codex streams still render correctly.

**Acceptance Scenarios**:

1. **Given** a provider emits raw stream output, **When** the server receives it, **Then** canonical `UIStreamEvent` objects are produced via provider-owned adapter API.
2. **Given** Claude and Codex providers are enabled, **When** both stream turns are executed, **Then** both produce canonical events accepted by the same WS flow.
3. **Given** a new provider (Gemini) is added later, **When** it implements the adapter contract, **Then** WS routing code requires no provider-specific transform branch.

---

### User Story 2 - Unified approval interception policy (Priority: P1)

As a maintainer, I want permission interception logic to be centralized and provider-agnostic so approval behavior is consistent across providers.

**Why this priority**: Permission behavior is currently coupled to provider-specific heuristics and is hard to reason about when adding providers.

**Independent Test**: In ask/plan mode, verify permission interception works consistently for Claude and Codex using one policy module.

**Acceptance Scenarios**:

1. **Given** ask/plan mode and a sensitive tool action, **When** canonical events are processed, **Then** a permission request is emitted via unified policy logic.
2. **Given** provider stderr/non-json output implies permission denial, **When** processed, **Then** policy emits a normalized permission request payload.
3. **Given** auto/bypass mode, **When** the same tool action occurs, **Then** no permission interception is triggered by the policy.

---

### User Story 3 - Canonical client rendering path (Priority: P2)

As a frontend maintainer, I want chat UI state to rely only on canonical events so provider-specific synthetic UI patches are removed.

**Why this priority**: Provider-specific client patches increase UI complexity and create drift across provider behavior.

**Independent Test**: Confirm chat stream UI works for Codex without client-side synthetic `session_init` injection.

**Acceptance Scenarios**:

1. **Given** any provider session starts, **When** stream begins, **Then** `session_init` is received from canonical server events (not client synthesis).
2. **Given** Codex stream completes, **When** messages are rendered, **Then** no provider-specific client fallback injects fake tool/session metadata.
3. **Given** existing chat flows (permission request, tool blocks, completion), **When** tested, **Then** behavior remains functionally unchanged.

### Edge Cases

- Provider emits mixed canonical and raw JSON lines.
- Provider emits no renderable content but exits successfully.
- Permission denial is represented only in stderr text.
- Codex stream includes valid session identifiers only in envelope variants not covered by naive field matching.
- Resume session fails and retries with fresh/ephemeral path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `AIProvider` contract MUST support provider-owned canonical event transformation for streaming output.
- **FR-002**: WS runtime MUST consume canonical events through provider abstraction without provider-ID transform branching.
- **FR-003**: Canonical event transformation MUST support both raw provider records and already-canonical events.
- **FR-004**: Permission interception MUST be evaluated via a centralized policy module using canonical events.
- **FR-005**: Permission requests inferred from non-json process output MUST be normalized through shared policy utilities.
- **FR-006**: Approved tool bookkeeping MUST remain intact across allow/deny flow after policy refactor.
- **FR-007**: Client stream handling MUST stop injecting provider-specific synthetic `session_init` blocks.
- **FR-008**: Existing Claude and Codex chat flows (streaming text/tool/thinking/result/permission) MUST remain behaviorally compatible.
- **FR-009**: Provider registration flow MUST remain extensible so Gemini provider can be added without WS transform branching.
- **FR-010**: Refactor MUST preserve retry/session reset behavior and session ID continuity for unexpected exits and resume failures.

### Non-Functional Requirements

- **NFR-001**: The abstraction changes MUST not degrade turn streaming responsiveness under normal local usage.
- **NFR-002**: Changes MUST not require migration of persisted conversation/message schema.

## Assumptions & Dependencies

- Existing canonical `UIStreamEvent` type remains the integration contract between server and client.
- Claude and Codex provider implementations remain transport-compatible with their current CLIs.
- Gemini implementation is out of scope for this change and is enabled by the new abstraction surface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `server/routes/_ws.ts` contains no provider-specific transform branch for Claude/Codex canonical conversion.
- **SC-002**: Manual validation confirms ask/plan permission flows still function for both Claude and Codex.
- **SC-003**: Codex chat renders without client-side synthetic `session_init` injection.
- **SC-004**: Existing provider-related tests/type checks pass for changed modules.
