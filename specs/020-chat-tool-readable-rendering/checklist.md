# FR Checklist: 020-chat-tool-readable-rendering

**Date**: 2026-02-14
**Updated**: 2026-03-21

- [x] FR-001: Human-readable header summary for `Read/Write/Edit/MultiEdit` and provider-specific variants (`read_file`, `write_file`, `create_file`, `replace`, `edit_file`, `run_shell_command`, `shell`).
- [x] FR-002: Expanded `Read` view includes readable `File` and `Range` metadata.
- [x] FR-003: Expanded `Write` view includes `New Content` preview.
- [x] FR-004: Expanded `Edit/MultiEdit` view shows diff viewer in the result section. (Before/After separate previews removed in favor of unified diff.)
- [x] FR-005: Long previews are truncated with explicit hint (up to 6 lines, expandable).
- [x] FR-006: Raw tool input JSON is available via collapsible section.
- [x] FR-007: Non-target tools keep fallback rendering behavior.
- [x] FR-008: Tool results containing unified diff output (`diff --git`, `+++`, `---`, `@@`) MUST be rendered with per-line syntax coloring (green for additions, red for deletions, cyan for hunk headers) and diff stats (`+N / -N`).
- [x] FR-009: Consecutive low-signal tool calls (read, glob, grep, list, search, etc.) MUST be grouped into a `ChatToolGroupSummary` component showing elapsed time and compact inline summary instead of individual tool blocks.
- [x] FR-010: Individual tool blocks MUST default to collapsed state; auto-expand is disabled.

## Validation Status

- Implementation status: complete
- Manual validation status: pending (requires user-run UI session)
