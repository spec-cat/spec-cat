# Implementation Plan: Human-Readable Tool Rendering in Chat

**Branch**: `020-chat-tool-readable-rendering` | **Date**: 2026-02-14 | **Spec**: `specs/020-chat-tool-readable-rendering/spec.md`

## Summary

Update `components/chat/ChatToolBlock.vue` to render `Read/Write/Edit/MultiEdit` inputs as structured human-readable UI while preserving existing fallback and result rendering behavior.

## Scope

- In scope: `ChatToolBlock` rendering logic, parsing helpers, display labels, preview truncation, fallback behavior.
- Out of scope: Provider protocol changes, backend changes, message schema migrations, auto mode formatting changes.

## Design Decisions

1. Keep parsing local to `ChatToolBlock.vue` to avoid cross-layer coupling.
2. Reuse existing tool result area unchanged to minimize regression risk.
3. Keep raw JSON display via `<details>` for observability/debugging.
4. Use conservative key matching (`file_path`, `path`, `content`, `old_string`, `new_string`) with fallback.

## FR Coverage Matrix

| FR | Implementation Step | File |
|---|---|---|
| FR-001 | Tool-specific summary generation in header | `components/chat/ChatToolBlock.vue` |
| FR-002 | Read metadata rows (`File`, `Range`) in expanded view | `components/chat/ChatToolBlock.vue` |
| FR-003 | Write `New Content` preview section with truncation | `components/chat/ChatToolBlock.vue` |
| FR-004 | Edit `Before`/`After` preview sections | `components/chat/ChatToolBlock.vue` |
| FR-005 | Shared preview truncation utility + hint text | `components/chat/ChatToolBlock.vue` |
| FR-006 | Collapsible raw JSON section | `components/chat/ChatToolBlock.vue` |
| FR-007 | Default fallback to `inputSummary` + existing result renderer | `components/chat/ChatToolBlock.vue` |

## Validation Plan

1. Manual `Read` flow: verify readable summary and range labels.
2. Manual `Write` flow: verify path + new content preview + truncation hint.
3. Manual `Edit` flow: verify before/after blocks.
4. Manual non-target tool flow (`Bash`/`Grep`): verify no regressions.

## Risks & Mitigations

- Risk: provider payload key variation.
  - Mitigation: multi-key lookup + fallback rendering.
- Risk: long previews affecting layout.
  - Mitigation: max line/char clipping + max-height containers.
