# Quickstart: Codex Provider Integration

**Feature**: 018-codex-provider-integration

## Goal

Validate that Codex is exposed in settings, selection is normalized safely, streaming routes by provider adapter, and backend AI endpoints use capability guards.

## Preconditions

- Project dependencies installed with `pnpm install`
- Claude remains available as default provider
- Codex runtime prerequisites configured:
  - `codex` CLI is available in `PATH` or `CODEX_CLI_PATH` points to the binary
  - Codex CLI can run non-interactive `exec --json` commands in project working directories
  - For auto mode runs, Codex supports `--full-auto`
  - For bypass mode runs, Codex supports `--dangerously-bypass-approvals-and-sandbox`

## Codex Runtime Troubleshooting

- If Codex is visible but disabled with `streaming runtime prerequisites are not satisfied`, verify CLI discovery:
  - `which codex`
  - `echo $CODEX_CLI_PATH`
- If Codex fails at chat start with process exit errors:
  - Validate the selected model key exists for your CLI/runtime account.
  - Run a direct smoke check: `codex exec --json --model codex-latest "reply with ok"`
- If session resume fails, the server retries once without resume and emits a `session_reset` event.
- If permission mode is `ask` or `plan` and provider lacks permissions capability, selection is rejected with an actionable guard message.

## Manual Validation Steps

1. Open Settings -> AI Provider Settings.
2. Confirm Codex appears with model list and capability badges.
3. If Codex lacks required capabilities, confirm model radio is disabled with explicit reason.
4. If Codex supports required capabilities, select Codex model and save.
5. Corrupt settings manually (`providerId` unknown, invalid `providerModelKey`) and call provider-resolving API path; confirm fallback to valid defaults.
6. Start a new chat with Codex selected and verify streaming events complete without UI schema changes.
7. Send follow-up message and verify provider session continuity is preserved.
8. Call AI-assisted endpoints (`/api/chat/generate-commit-message`, `/api/rebase/ai-resolve`, `/api/chat/worktree-commit`) under both Claude and Codex selections.
9. Confirm unsupported capability paths return actionable errors instead of provider-ID hardcoded failures.
10. Switch back to Claude and verify existing chat behavior is unchanged.

## Tool Registration Lifecycle (Model API)

Use this policy for both Claude and Codex paths:

1. Load internal tool registry at app/runtime initialization (local definitions and executors only).
2. On every model API request, serialize and attach tools in the provider-specific request format.
3. Execute tool calls via shared executor/service (single implementation), not per-provider duplicated logic.
4. Feed tool results back into the same provider conversation/session and continue streaming.

This feature does not use one-time startup registration against model providers.

## Expected Outcomes

- Codex discoverability is present in settings.
- Invalid persisted selections are auto-corrected server-side.
- Streaming and done/error signaling remain compatible with existing frontend handlers.
- Capability guard messages are explicit and user-actionable.
- Claude default workflow remains backward-compatible.

## Validation Notes (2026-02-14)

- Provider selection normalization and capability guards validated via static code path review and type-level integration updates.
- Runtime adapters now dispatch through provider abstraction for both HTTP (`/api/chat`) and WebSocket (`/_ws`) paths.
- Full end-to-end manual chat validation is pending user-run UI checks because dev server execution is intentionally skipped in AI sessions.

## Validation Notes (2026-02-15)

- Codex stream parser mapping was expanded to normalize tool call events into canonical `tool_use` stream content-block events.
- Tool result events are now normalized into canonical `tool_result` payloads with explicit `is_error` signaling.
- Approval/permission-shaped Codex events are now normalized into canonical `permission_request` payloads for shared UI handling.
- Regression tests were added in `tests/server/codexStreamParser.test.ts` for tool call, tool result, and permission mapping paths.
