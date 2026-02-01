# Research: Codex Provider Integration

**Feature**: 018-codex-provider-integration
**Date**: 2026-02-14

## R-001: Codex Runtime Transport

- Decision: Implement Codex as a provider runtime adapter that uses the same CLI-style streaming process pattern as Claude paths.
- Rationale: Preserves streaming-native behavior, avoids introducing new external SDK dependencies, and fits existing server route/process supervision patterns.
- Alternatives considered: Direct REST/SDK integration (rejected: violates current dependency/architecture direction), non-streaming request/response wrapper (rejected: breaks streaming UX contract).

## R-002: Provider Selection Normalization

- Decision: Keep a single server-side `resolveServerProviderSelection()` normalization path for unknown provider and invalid model key fallbacks.
- Rationale: Prevents invalid persisted state from causing runtime errors and centralizes selection safety logic.
- Alternatives considered: Per-endpoint fallback logic (rejected: duplication and drift risk), client-only normalization (rejected: server still receives invalid persisted/requested values).

## R-003: Duplicate Provider Registration Handling

- Decision: Preserve deterministic overwrite behavior with explicit warning logs on duplicate provider IDs.
- Rationale: Current registry already logs duplicate IDs; keeping deterministic last-registration-wins avoids startup failure while surfacing configuration errors.
- Alternatives considered: Throw and fail startup (rejected: breaks metadata endpoint availability), silently ignore duplicates (rejected: hard to debug).

## R-004: Event Contract Bridging

- Decision: Codex adapter outputs provider-native payloads wrapped as existing stream events (`provider_json`, `done`, `error`) consumed by `useChatStream`.
- Rationale: Minimizes frontend changes and protects established message processing semantics.
- Alternatives considered: New frontend event schema for Codex (rejected: cross-provider branching across UI/store paths), lossy text-only translation (rejected: loses structured tool/thinking/session signals).

## R-005: Session Continuity Model

- Decision: Keep provider-specific session ID opaque and stored in existing conversation session field (`providerSessionId`) with provider-driven resume behavior.
- Rationale: Maintains provider-agnostic store schema while letting each provider own token format.
- Alternatives considered: Unified normalized session token format (rejected: unnecessary abstraction and migration cost), no resume support for Codex initially (rejected: conflicts with session continuity requirements).

## R-006: Capability Guards for AI-Assisted Endpoints

- Decision: Replace hardcoded `providerId !== 'claude'` gates with capability checks (`streaming`, `autoCommit`, conflict-resolution capability extension if needed).
- Rationale: Scales to more providers and makes unsupported features explicit and actionable.
- Alternatives considered: Keep provider ID checks and add Codex exceptions (rejected: brittle branching), optimistic execution with runtime failure (rejected: poor UX/error quality).

## R-007: Settings UX for Disabled Providers

- Decision: Continue showing Codex metadata even when disabled, with explicit reason text based on missing capabilities/runtime readiness.
- Rationale: Users can discover Codex status without trial-and-error and understand what blocks selection.
- Alternatives considered: Hide disabled providers (rejected: poor discoverability), allow selection and fail later in chat (rejected: delayed failure, worse UX).

## R-008: Model API Tool Registration Timing

- Decision: Register tools at model API request time by attaching tool definitions to each provider call, with no one-time startup registration against provider services.
- Rationale: Matches provider APIs (Claude/Codex) that accept tools per request, keeps tool set context-aware per conversation/endpoint, and avoids stale global registration state.
- Alternatives considered: Startup-time global registration (rejected: does not match provider request semantics and complicates dynamic tool changes), per-provider duplicated tool executors (rejected: logic drift and maintenance overhead).

## Clarification Resolution Summary

All `NEEDS CLARIFICATION` topics for runtime transport, event mapping, selection normalization, capability guards, and tool registration timing are resolved in this document.
