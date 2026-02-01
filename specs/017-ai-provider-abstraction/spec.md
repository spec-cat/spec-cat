# Feature Specification: AI Provider Abstraction

**Feature Branch**: `017-ai-provider-abstraction`
**Created**: 2026-02-10
**Status**: Draft
**Input**: "Our chat stack currently hard-codes a single provider. We need a provider abstraction so any future AI engine (Copilot, Claude-2, etc.) can hook into the same UI and session flow without a full rewrite."

## Notes

- None.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch AI Provider from Settings (Priority: P1)

A developer wants to choose which AI provider powers new conversations. They open Settings, pick from a list of provider/model combinations (e.g., Claude Sonnet, Copilot Pulse), and the selection immediately affects every new conversation while remaining persisted across sessions.

**Why this priority**: Users must be able to opt into a different model/provider before we build any plumbing for Copilot. Without it, there is no way to verify the abstraction or to make the UI aware of providers beyond Claude.

**Independent Test**: Change the selection in Settings and confirm that the provider metadata stored on disk (settings.json) updates and that new conversations report the selected provider in their metadata.

**Acceptance Scenarios**:

1. **Given** multiple providers/models are registered, **When** the user opens Settings, **Then** the UI lists each provider with its available models (with descriptions) and highlights the current selection.
2. **Given** the user selects a new provider/model, **When** they close Settings, **Then** the preference is persisted and the chat store uses the new provider for any subsequently created conversation.
3. **Given** the settings file contains a provider/model that no longer exists, **When** the app initializes, **Then** it falls back to a default provider (Claude Sonnet) and logs a warning.

---

### User Story 2 - Provider-Agnostic Chat Session Flow (Priority: P1)

Chat streaming, permissions, and session resumption should work the same regardless of provider. The chat store and composables call into an `AIProvider` interface that exposes session creation, streaming callbacks, and lifecycle events.

**Why this priority**: Streaming conversations are the visible surface of the provider, so the abstraction must support the existing experience before we add a new UI switch.

**Independent Test**: Replace the default provider implementation with a stub that simulates session events and confirm that conversations still display streaming text, session IDs, and permission prompts.

**Acceptance Scenarios**:

1. **Given** a provider registration exists, **When** a user sends a message, **Then** the provider is asked to start or resume a session, and streaming data from the provider populates the chat store messages exactly as the current provider does today.
2. **Given** the provider reports a session ID, **When** the session needs to resume (error recovery, two cascades), **Then** the chat store uses the stored session ID and the provider receives it so the CLI can resume correctly.
3. **Given** a provider throws a permission/plan prompt, **When** the permission system is in use, **Then** the same UI flows (modal, approval, denial) are triggered, independent of the provider implementation.
4. **Given** a non-Claude provider is selected before streaming parity is implemented, **When** a streaming chat request is made, **Then** the request is rejected with a clear transitional unsupported-provider error.

---

### User Story 3 - Provider Registry and Server API (Priority: P2)

The server maintains a registry of all available providers and exposes an API that lists providers, their models, and capabilities. Clients use this API to populate Settings and consistency checks.

**Why this priority**: The UI must know what providers/models exist. A registry plus API means we can add new providers without changing every UI file.

**Independent Test**: Call the provider list API and verify it returns all registered providers with their names, IDs, model lists, and supported features (streaming, permissions, session resume).

**Acceptance Scenarios**:

1. **Given** the server loads provider modules on startup, **When** the registry is requested, **Then** it returns one entry per provider with metadata (id, display name, description, supported features, model list).
2. **Given** a provider implements a subset of features (e.g., no permission API), **When** the registry entry is consumed by the UI, **Then** the UI disables UI elements that rely on the missing capability.
3. **Given** a provider is added after the server starts (via hot-reloaded module), **When** the registry refreshes, **Then** the new entry appears without requiring a full rebuild (where the runtime supports it).

---

### User Story 4 - Prepare for Copilot Adapter (Priority: P2)

Before wiring Copilot itself, the abstraction is documented so future implementation steps can plug Copilot into the provider registry by implementing the same interface and configuration hooks.

**Why this priority**: Having a well-defined contract lets the Copilot work be scoped separately and ensures QA can focus on provider behavior instead of digging through unrelated Claude code.

**Independent Test**: Review the abstract provider interface documentation and confirm it lists all required methods/properties (startSession, streamEvents, cancel, model metadata, capabilities, etc.) plus any settings migrations.

**Acceptance Scenarios**:

1. **Given** the provider interface documentation exists, **When** a developer begins implementing Copilot, **Then** they can map Copilot SDK methods to each interface method without touching Claude-specific files.
2. **Given** there is a plan to store provider-specific credentials (Copilot tokens), **When** the contract is defined, **Then** it states where credentials live (env, server store) and how they are retrieved.
3. **Given** the UI allows selecting providers, **When** Copilot becomes available, **Then** it simply appears as another provider entry without layout changes.

### Edge Cases

- What happens when the provider registry returns zero providers? The UI should show a disabled provider picker with a message like "No providers configured," and the chat should prevent new conversations.
- What happens when providers disagree on the streaming format (CLI JSON streaming vs SSE)? The provider abstraction must translate any provider-specific events into the uniform message structure used by the chat store.
- What happens when a provider takes a dependency on credentials that fail to refresh? The registry and provider method should surface errors, and the UI should offer to reauthenticate or revert to the default provider.
- What happens if multiple providers are registered with the same ID? The registry should pick one deterministically (e.g., first loaded) and log a warning.
- What happens when the settings store contains a provider/model that exists but does not support the current permission mode? The UI should warn and fall back to a compatible provider or disable the incompatible permission mode selector.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide a server-side provider registry that loads provider modules (Claude, Copilot, etc.) and exposes metadata including provider ID, display name, description, supported features (streaming, permissions, session resume), and available models.
- **FR-002**: The settings store and UI MUST persist both a provider ID and a model key so the selection survives reloads and can be validated against the registry on initialization.
- **FR-003**: Define an `AIProvider` interface that encapsulates the chat lifecycle (start session, resume session, send chunk, cancel) plus capabilities (streaming, partial updates, permission prompts).
- **FR-004**: The chat store and composables MUST consume the `AIProvider` interface rather than Claude-specific utilities; they continue to track a generic `providerSessionId` that providers can interpret.
- **FR-005**: Implement the existing Claude logic as one provider conforming to the new interface (including session resume, permission/plan prompts, and CLI streaming), so current behavior does not regress.
- **FR-006**: Provide a provider-registry API for clients to retrieve registry data and adapt their UI (settings modal, provider selector, capability badges) accordingly.
- **FR-007**: The UI MUST display providers/models grouped by provider with descriptions and capability badges, and it MUST disable incompatible providers (e.g., those missing permission support when using permission mode) with explanatory text.
- **FR-008**: Providers MUST declare whether they support permission/plan approvals, streaming partial responses, and auto-commit features so the UI and backend can guard features that point to those capabilities.
- **FR-009**: Document how new providers register themselves (module exports, initialization hooks, capability declarations) so future integrations can follow a consistent pattern.
- **FR-010**: Provide a migration path for existing settings: when Claude is the only provider, the persisted `claudeModel` value must map to the new provider/model format on first run.
- **FR-011**: Until provider-specific streaming adapters are implemented, the chat streaming layer MUST enforce a transitional Claude-only constraint and reject other providers with an explicit unsupported-provider error.

### Key Entities

- **AI Provider**: An implementation that knows how to talk to a specific AI engine (Claude CLI, Copilot API, etc.), exposing methods for session management, streaming, and permission prompts plus metadata describing its models and capabilities.
- **Provider Registry**: The runtime registry loaded by the server that lists all providers, caches their metadata, and feeds the provider-registry API.
- **Provider Session**: A provider-created session object that includes a session ID (terminology provider-specific), the associated conversation ID, and runtime state (in-progress, permission pending, error). The chat store retains this state in a provider-agnostic format.
- **Settings Entry**: The persisted selection (`providerId`, `modelKey`) stored in `settings.json` and consumed by both client and server to route requests to the desired provider.

## Success Criteria *(mandatory)*

- **SC-001**: Switching providers via the Settings modal updates `settings.json`, and new conversations start with the selected provider within 3 seconds of the change.
- **SC-002**: The chat panel continues to stream responses, handle permission prompts, and resume sessions without regression after the default provider is refactored to use the interface.
- **SC-003**: The provider registry API returns metadata for each registered provider, including capabilities and model lists, and the Settings UI uses that metadata to render every provider/model option.
- **SC-004**: Adding a new provider requires only implementing the interface plus registering it with the registry; no other files (settings, chat store, UI) need to change.
- **SC-005**: Plugging Copilot into the registry (after this specification) results in a provider entry that appears in Settings and can be selected without additional UI work.

## Assumptions

- Claude remains the default provider and continues to be implemented via the existing CLI stack; the abstraction wraps it rather than replacing it initially.
- Providers can expose capability flags (e.g., `supportsPermissions`, `supportsStreaming`, `supportsResume`) to let the UI and chat store gate features.
- Credentials and CLI availability (Claude needs a binary, Copilot needs tokens) are managed within each provider implementation; the registry only ensures initialization order and surfaces errors.
- The chat store can be modified to track `providerId` alongside conversations without breaking the features list or existing persistence logic.
- Future providers (Copilot) will support at least the core streaming and session semantics required by the chat panel; anything missing can be flagged via capability metadata.
- The Settings API uses the same endpoints (`/api/settings`) but will read/write the new composite provider/model entry.
