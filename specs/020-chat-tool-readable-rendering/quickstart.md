# Quickstart: Human-Readable Tool Rendering in Chat

**Feature**: 020-chat-tool-readable-rendering  
**Date**: 2026-02-14

## Prerequisites

- Repository at `/home/khan/src/brick2`
- Dependencies installed (`pnpm install`)
- User-run app session available for manual UI verification (AI session does not start dev server)

## Manual Validation Flow

### Flow A: Read Tool

1. Open a chat conversation and trigger a tool call that uses `Read`.
2. Verify tool header summary shows readable text with file path (when path exists).
3. Expand the tool block.
4. Verify `File` row is visible.
5. Verify `Range` row is shown when read range inputs exist.
6. Verify `Raw input JSON` is available as collapsible detail.

### Flow B: Write Tool

1. Trigger a tool call that uses `Write`.
2. Verify tool header summary reads `Write <path>` when path exists.
3. Expand the block and verify `New Content` section is shown.
4. For long content, verify `Truncated preview` hint is shown.
5. Verify `Raw input JSON` remains accessible.

### Flow C: Edit / MultiEdit Tool

1. Trigger a tool call that uses `Edit` or `MultiEdit`.
2. Verify tool header summary reads `Edit <path>` when path exists.
3. Expand the block and verify `Before` and `After` sections are shown.
4. For long content, verify `Truncated preview` hint is shown.
5. Verify `Raw input JSON` remains accessible.

### Flow D: Regression (Non-target Tools)

1. Trigger at least one non-target tool call (`Bash`, `Grep`, `Glob`, etc.).
2. Verify header summary still falls back to existing behavior.
3. Verify existing tool result preview/collapse behavior is unchanged.

## Done Criteria

- FR-001 through FR-007 pass manual checks.
- No rendering regressions in non-target tool blocks.
- Chat layout remains readable in narrow and wide panel widths.

## Validation Log (2026-02-14)

- `pnpm -s typecheck`: failed due pre-existing repository-wide type errors unrelated to this feature.
- Manual UI validation: pending user-run checks.
