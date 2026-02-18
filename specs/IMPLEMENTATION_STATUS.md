# Specs Implementation Status Dashboard

Last updated: 2026-02-18

This dashboard normalizes feature status across all `specs/*` folders using:
- declared status in each `spec.md`
- checkbox progress in each `tasks.md`
- split/superseded relationships between parent and child specs

## Lifecycle Summary

- `done`: 8
- `review`: 7
- `in_progress`: 13
- `backlog`: 1

## Feature Matrix

| Feature | Declared Status | Tasks | Lifecycle | Notes |
|---|---|---:|---|---|
| `001-app-layout` | In Progress | 29/30 | `review` | Functionally near-complete; one header naming task remains. |
| `001-source-file-explorer` | Draft | 0/18 | `backlog` | Planned but not started in tracked tasks. |
| `002-git-graph` | In Progress (Redesign) | 0/0 | `in_progress` | Parent redesign spec; child specs `021`-`024` split out. |
| `003-worktree-management` | Implemented | 13/14 | `done` | Core worktree feature shipped; minor validation task open. |
| `004-spec-viewer` | Draft | 0/0 | `review` | Legacy parent; effectively split/covered by `028`-`030`. |
| `007-claude-code-chat` | Implemented | 48/50 | `done` | Base chat workflow implemented; a few manual checks remain. |
| `008-spec-search` | In Progress | 25/28 | `review` | Implementation mostly complete; validation/dependency checks pending. |
| `009-conversation-management` | Implemented | 25/26 | `done` | Core conversation management is implemented. |
| `010-chat-permission-system` | Implemented | 13/13 | `done` | Fully tracked as complete. |
| `011-chat-worktree-integration` | Implemented | 0/0 | `done` | Implemented spec without active task checklist. |
| `012-cascade-automation` | Implemented | 21/21 | `done` | Fully tracked as complete. |
| `013-auto-mode` | In Review | 21/23 | `review` | Major implementation complete; final manual scenario pass pending. |
| `014-theme-system` | Implemented | 20/20 | `done` | Marked implemented based on full task completion. |
| `015-features-panel` | Draft | 0/0 | `review` | Legacy parent; implementation now split into `028`-`030`. |
| `016-embedded-skills` | In Review | 23/24 | `review` | Feature implemented; remaining work is validation/regression check. |
| `017-ai-provider-abstraction` | Draft | 0/11 | `in_progress` | Abstraction exists, but planning artifacts and task tracking are stale. |
| `018-codex-provider-integration` | Implemented | 30/31 | `done` | Marked implemented; one final validation task remains unchecked. |
| `019-conversation-archive` | Implemented | 29/31 | `review` | Implemented with minor manual validation/regression tasks open. |
| `020-chat-tool-readable-rendering` | In Progress | 7/11 | `in_progress` | Core UI behavior done; manual validation tasks remain. |
| `021-git-graph-rendering-core` | Draft (Child Spec) | 0/8 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `022-git-graph-operations` | Draft (Child Spec) | 0/8 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `023-git-graph-diff-viewer` | Draft (Child Spec) | 0/6 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `024-git-graph-search-filter-ux` | Draft (Child Spec) | 0/6 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `025-chat-worktree-lifecycle` | Draft (Child Spec) | 0/7 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `026-chat-preview-finalize-flow` | Draft (Child Spec) | 0/10 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `027-chat-conflict-resolution` | Draft (Child Spec) | 0/13 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `028-features-panel-core` | Draft (Child Spec) | 0/8 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `029-features-panel-actions` | Draft (Child Spec) | 0/7 | `in_progress` | Child-spec split created; task backfill/verification pending. |
| `030-features-panel-active-linking` | Draft (Child Spec) | 0/7 | `in_progress` | Child-spec split created; task backfill/verification pending. |

## Reorganization Notes

- Parent-to-child decompositions are now explicitly tracked in this dashboard:
  - Git graph: `002` -> `021`-`024`
  - Chat/worktree lifecycle: `007`/`011` -> `025`-`027`
  - Features/spec panel: `004`/`015` -> `028`-`030`
- Status normalization follows Vibe Kanban lifecycle (`backlog`, `in_progress`, `review`, `done`) so portfolio-level planning is consistent.

## Next Sync Targets

1. Backfill child-spec task checkboxes (`021`-`030`) against current implementation to restore FR traceability.
2. Close remaining manual validation tasks in high-completion specs (`008`, `013`, `016`, `018`, `019`, `020`).
3. After traceability cleanup, promote reviewed items to `done` in both this dashboard and feature-local docs.
