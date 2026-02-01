# Data Model: Codex Provider Integration

**Feature**: 018-codex-provider-integration
**Date**: 2026-02-14

## Entities

### ProviderMetadata

Represents registered provider identity and static capability/model declarations.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique provider ID (`claude`, `codex`) |
| `name` | `string` | Yes | Display name |
| `description` | `string` | Yes | Provider/runtime description |
| `models` | `AIProviderModel[]` | Yes | Model options and default marker |
| `capabilities` | `AIProviderCapabilities` | Yes | Feature support matrix |

Validation rules:
- `id` must be unique in registry.
- At least one model must exist.
- Exactly one model should be default when possible.

### ProviderCapabilities

Declares which backend/UI flows are supported by the provider.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `streaming` | `boolean` | Yes | Supports chat streaming/runtime adapter |
| `permissions` | `boolean` | Yes | Supports ask/plan permission flows |
| `resume` | `boolean` | Yes | Supports provider session continuation |
| `autoCommit` | `boolean` | No | Supports AI-assisted commit message / worktree auto-commit features |

Validation rules:
- `streaming=false` must block provider selection for chat flows.
- Backend endpoints requiring a capability must check before execution.

### ProviderSelection

Normalized persisted and request-time provider choice.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `providerId` | `string` | Yes | Selected provider ID |
| `modelKey` | `string` | Yes | Selected model key |

State transitions:
1. Load persisted selection.
2. Resolve unknown provider => default provider+default model.
3. Resolve invalid model => selected provider default model.
4. Persist normalized pair.

### ProviderRuntimeSession

Provider-agnostic container for runtime continuity.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `providerId` | `string` | Yes | Runtime provider used for message |
| `modelKey` | `string` | Yes | Runtime model key |
| `sessionId` | `string` | Yes | Provider-native session token (opaque) |

Validation rules:
- Session token is provider-specific and never parsed by shared UI/store code.
- Resume only attempted when capability `resume=true`.

### RequestToolPayload

Request-scoped tool definitions sent with each model API call.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tools` | `ToolDefinition[]` | Yes | Shared tool registry entries mapped to provider request format |
| `providerId` | `string` | Yes | Target provider adapter (`claude`, `codex`) |
| `conversationId` | `string` | No | Optional scope for context-aware tool subsets |

Validation rules:
- Payload is rebuilt per request from the internal registry (no startup-time remote registration state).
- Tool execution remains provider-agnostic (shared executor), while serialization is provider-specific.

### CapabilityGuardResult

Standardized result for endpoints requiring unsupported provider features.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | `boolean` | Yes | Always `false` for guard failure |
| `error` | `string` | Yes | Actionable message for user |
| `providerId` | `string` | No | Selected provider |
| `missingCapability` | `string` | No | Required capability key |

## Relationships

- `ProviderMetadata (1)` -> `ProviderCapabilities (1)`
- `ProviderMetadata (1)` -> `ProviderModel (*)`
- `ProviderSelection (1)` -> `ProviderMetadata (1)` by `providerId`
- `ProviderRuntimeSession (1)` -> `ProviderSelection (1)` for runtime request context
- `CapabilityGuardResult` emitted by endpoints when requested feature requires unsupported capability.

## State Flow

```text
Registry init
  -> metadata list for settings
  -> internal shared tool registry loaded
  -> selection chosen/persisted
  -> server resolves normalized selection
  -> adapter maps tools into request payload for selected provider
  -> runtime adapter dispatch by providerId
  -> stream events mapped to shared contract
  -> session token captured for resume
```

## Notes

- Existing conversation records already store `providerId`, `providerModelKey`, and `providerSessionId`; this feature preserves these fields.
- Capability checks must replace hardcoded provider ID checks in AI-assisted server routes.
