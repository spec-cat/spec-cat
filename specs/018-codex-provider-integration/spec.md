# Feature Specification: Codex Provider Integration

**Feature Branch**: `018-codex-provider-integration`
**Created**: 2026-02-14
**Status**: Implemented (aligned to repository behavior on 2026-02-18)
**Input**: "After adding provider abstraction, validate current state and prepare/implement Codex as an additional provider."

## Notes

- Current baseline already includes provider registry, Claude provider, and a placeholder Codex metadata entry.
- Streaming runtime remains Claude-only in chat and websocket paths.
- Tool registration follows request-scoped model API payloads (tools are sent per request), not one-time startup registration.
- Provider-specific adapters map shared tool definitions to each model API format (Claude/Codex), while execution stays shared.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select Codex in Settings (Priority: P1)

A developer can see Codex in provider settings and understand whether it is usable now (enabled when supported, disabled with clear reason when not).

**Why this priority**: Provider selection UX is the entry point; users must understand Codex availability without trial-and-error.

**Independent Test**: Open Settings and verify Codex appears with model/capability metadata and accurate enabled/disabled state.

**Acceptance Scenarios**:

1. **Given** provider metadata is loaded, **When** Settings is opened, **Then** Codex appears as a provider with model list and capability badges.
2. **Given** Codex lacks required capabilities (e.g., streaming), **When** user attempts selection, **Then** selection is blocked with an explicit reason.
3. **Given** Codex supports required capabilities, **When** selected, **Then** settings persist `{ providerId: "codex", modelKey }`.

---

### User Story 2 - Provider-Safe Selection Resolution (Priority: P1)

Server selection logic must normalize invalid provider/model combinations and guarantee safe runtime behavior.

**Why this priority**: Invalid stored state can cause runtime crashes or inconsistent routing.

**Independent Test**: Manually write invalid provider/model values to `settings.json` and verify server resolves to valid defaults.

**Acceptance Scenarios**:

1. **Given** unknown provider ID in settings, **When** selection is resolved, **Then** it falls back to default provider/model.
2. **Given** valid provider but invalid model key, **When** selection is resolved, **Then** provider default model is used.
3. **Given** duplicate provider registration IDs, **When** registry initializes, **Then** deterministic behavior and warning logs are emitted.

---

### User Story 3 - Codex Streaming Adapter (Priority: P2)

Codex can power chat streaming and session lifecycle through the same app-level event format used by current chat flows.

**Why this priority**: This is the actual runtime value of adding Codex as a provider.

**Independent Test**: Select Codex, start a new chat, and confirm assistant streaming output, completion event, and session continuity.

**Acceptance Scenarios**:

1. **Given** Codex is selected, **When** user sends a chat message, **Then** server routes to Codex runtime adapter instead of Claude CLI.
2. **Given** Codex returns provider-native events, **When** events are bridged, **Then** UI receives normalized `provider_json`/`done` (or equivalent shared events).
3. **Given** resume/session tokens are available, **When** follow-up messages are sent, **Then** provider session continuity is preserved.
4. **Given** Codex emits tool call/result/approval-style events, **When** events are bridged, **Then** parser emits canonical tool-use stream blocks, `tool_result`, and `permission_request` payloads compatible with shared chat contracts.

---

### User Story 4 - Capability-Based Backend Guards (Priority: P2)

Non-chat features that use AI (commit message generation, conflict resolution, auto-mode steps) must check provider capabilities and return actionable errors when unsupported.

**Why this priority**: Today these flows are hard-gated by provider ID checks and will not scale with additional providers.

**Independent Test**: Execute each AI-assisted endpoint under Claude and Codex selections and confirm either successful execution or clear capability error.

**Acceptance Scenarios**:

1. **Given** selected provider lacks `autoCommit`, **When** auto-commit endpoint is called, **Then** response explains unsupported capability (not provider hardcode).
2. **Given** selected provider lacks conflict-resolution capability, **When** AI resolve is called, **Then** request is rejected with capability-specific message.
3. **Given** provider supports capability, **When** endpoint executes, **Then** code path uses provider abstraction without Claude-specific branching.

## Edge Cases

- Codex adapter is registered but runtime binary/API credentials are missing.
- Codex selected in settings but only partial capability support exists.
- Existing conversations created under Claude continue after provider switch.
- Resume token format differs between providers.
- Provider API initialization fails for one provider but should not break metadata listing for others.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Registry MUST include Codex provider metadata (id, name, description, models, capabilities).
- **FR-002**: Settings/UI MUST represent Codex availability accurately and block incompatible selections with clear messaging.
- **FR-003**: Server provider selection resolution MUST normalize invalid provider/model combinations to valid defaults.
- **FR-004**: Chat streaming runtime MUST route by provider abstraction and support Codex when its adapter is available.
- **FR-005**: Provider runtime adapter MUST map provider-native events to shared chat event contracts consumed by existing stores/composables.
- **FR-006**: Session resume/state handling MUST remain provider-agnostic and preserve provider-specific session IDs.
- **FR-007**: AI-assisted server endpoints MUST use capability-based guards instead of direct `providerId !== 'claude'` checks.
- **FR-008**: Unsupported capability responses MUST include clear, user-actionable error text.
- **FR-009**: Default provider behavior (Claude) MUST remain backward compatible during Codex rollout.
- **FR-010**: Integration documentation MUST describe required environment/configuration for Codex runtime, request-scoped model API tool registration lifecycle, and failure modes.

### Key Entities

- **Codex Provider**: Provider registration + runtime adapter implementation for Codex.
- **Provider Capability Matrix**: Declared feature support per provider (streaming, permissions, resume, auto-commit, etc.).
- **Selection Resolver**: Server utility that validates and normalizes `{providerId, modelKey}`.
- **Provider Runtime Adapter**: Bridge that translates provider-native streaming/session semantics into app-standard events.

## Success Criteria *(mandatory)*

- **SC-001**: Codex appears in settings/provider list and is selectable only when required capabilities are satisfied.
- **SC-002**: Invalid stored provider/model states are auto-corrected without server errors.
- **SC-003**: When Codex adapter is enabled, new chats can stream and complete via Codex without UI regressions.
- **SC-004**: At least three AI-assisted backend flows use capability-based guards instead of provider hardcoded checks.
- **SC-005**: Claude behavior remains unchanged for existing users who do not switch providers.

## Assumptions

- Claude remains the default provider during rollout.
- Codex runtime may be delivered incrementally (metadata first, streaming adapter second).
- Existing chat UI event handling remains the canonical contract providers must adapt to.
