# Behavior-Preserving Code Cleanup Plan

## Goal and guardrails

- [ ] Preserve all current features, design, API routes, persisted data formats, keyboard shortcuts, terminal behavior, and provider behavior.
- [x] Keep Codex and Claude behavior equivalent throughout the cleanup.
- [x] Preserve the provider commands exactly:
  - Codex: `codex --dangerously-bypass-approvals-and-sandbox`
  - Claude: `claude --dangerously-skip-permissions`
- [x] Do not introduce new features, redesigns, dependency upgrades, API renames, or storage migrations during cleanup.
- [x] Make small, reviewable changes and validate each stage before continuing.
- [x] Do not run the development server. Use tests, type checking, builds, and static inspection.

## Phase 0 — Lock down current behavior

- [x] Record baseline results for `bun test`, `bun run typecheck`, and `bun run build`.
- [x] Record production bundle size, test duration, type-check duration, and current polling/request behavior.
- [x] Map existing coverage for conversation attach/resume, terminal resize and scrolling, provider state detection, session switching, jobs, worktrees, Git operations, spec workflows, archives, and database queries.
- [x] Add characterization tests where planned refactoring is not protected, especially for `server/api/terminal.ts`, `app.vue`, tmux screen parsing, provider resume, and Git action dispatch.
- [x] Treat current API payloads, filesystem schemas, terminal frames, command ordering, error messages, and timing-sensitive behavior as compatibility contracts.

## Phase 1 — Consolidate shared utilities and types

- [x] Consolidate repeated tmux operations such as session checks, pane capture, session termination, mouse configuration, and window sizing into a server-only utility.
- [x] Keep prompt submission centralized in `server/utils/tmux-input.ts` and verify multiline, Unicode, leading-dash, large-input, and cleanup-failure cases.
- [x] Consolidate repeated Git process execution and error normalization without changing arguments, ordering, cwd, or exit-code behavior.
- [x] Move shared API payload, session, runtime-state, and component-expose types into focused files under `types/`.
- [x] Remove client type imports from server implementation modules where a public type contract is sufficient.
- [x] Standardize fetch-error handling and async loading/error/finally patterns while preserving current messages and timing.
- [x] Centralize only genuinely shared constants; avoid a catch-all constants module.

## Phase 2 — Simplify server responsibilities

- [x] Split `server/api/terminal.ts` into focused modules for WebSocket peers, session/tmux provisioning, runtime monitoring, and lifecycle cleanup.
- [x] Keep the terminal route as a thin composition boundary with unchanged WebSocket frames and timing.
- [x] Separate provider command construction and resume-session discovery from process orchestration in `server/utils/provider-resume.ts`.
- [x] Preserve exact quoting, environment variables, working directories, provider commands, and fallback behavior.
- [x] Extract shared polling, timeout, and cancellation mechanics from provider queries and job execution while keeping provider-specific state recognition isolated.
- [x] Centralize teardown ordering for archive, delete, finalize, recovery, preview cleanup, tmux termination, worktree removal, and branch cleanup.
- [x] Separate pure parsing and state transitions from filesystem, tmux, Git, and process side effects.
- [x] Reuse one atomic-write approach for filesystem state without changing paths or JSON schemas under `~/.spec-cat`.
- [x] Keep Nitro handlers focused on validation, service calls, and response mapping.

## Phase 3 — Simplify application orchestration

- [x] Reduce `app.vue` to application composition and layout responsibilities.
- [x] Extract cohesive controllers for session polling and selection, panel persistence, terminal bridging, Git refresh coordination, and modal coordination.
- [x] Replace repetitive `ConversationWorkspaceExpose` forwarding functions with a typed adapter while retaining null-safe behavior and lifecycle timing.
- [x] Consolidate shared active/archive conversation filtering helpers without changing searchable fields or matching rules.
- [x] Audit all watchers, timers, media-query listeners, WebSocket listeners, and terminal addons for clear ownership and paired cleanup.
- [x] Prevent duplicate listeners, polling loops, and refresh calls after conversation or layout changes.
- [x] Keep terminal instances mounted exactly where required to preserve xterm buffers, scroll positions, selections, focus, and WebGL state.
- [x] Preserve the current resize and settle sequence until rapid resize, maximize, mobile breakpoint, refresh, and conversation-switch tests are in place.

## Phase 4 — Decompose large UI modules

- [x] Split `components/GitGraphPanel.vue` into headless interaction/state logic and focused presentational components.
- [x] Preserve graph keys, geometry, scroll anchoring, infinite-load thresholds, selection, search, filtering, and context-menu behavior.
- [x] Split `components/AppSidebarPanel.vue` into conversation list, archive list, search, and session-row components.
- [x] Preserve inline rename focus, active selection, session previews, and action propagation.
- [x] Split `components/DatabaseWorkspace.vue` by connection management, schema browsing, editor state, and results rendering.
- [x] Keep query execution, result display, and draft persistence behavior unchanged.
- [x] Consolidate duplicated Git action metadata across `GitWorkspace`, `GitGraphToolbar`, and `GitContextMenu` into one typed source.
- [x] Extract a component only when its props/events create a smaller stable interface; avoid wrappers that only move template lines.
- [x] Preserve existing classes and CSS variables unless static analysis and visual verification prove they are unused.

## Phase 5 — Improve runtime efficiency safely

- [x] Trace session polling, Git-state polling, graph reloads, shell refreshes, and their callers before changing request frequency.
- [x] Coalesce only semantically identical refreshes while preserving existing freshness guarantees.
- [x] Apply request-generation or cancellation guards consistently so stale responses cannot overwrite newer state.
- [x] Measure deep watchers and broad reactive dependencies, then replace only unnecessary ones with narrower dependencies.
- [x] Cache only pure parsing and formatting work with explicit invalidation rules.
- [x] Do not cache filesystem, Git, tmux, provider, or session state without a tested freshness contract.
- [x] Preserve stable keys and scroll state when optimizing large lists.
- [x] Remove dead exports, unreachable code, stale comments, and unused CSS only after search, type checking, tests, and builds confirm no dynamic consumers.

## Phase 6 — Naming and documentation cleanup

- [x] Improve misleading internal names without changing public identifiers, environment variables, persisted keys, CLI commands, or compatibility.
- [x] Document intentionally retained legacy names such as existing `code-cat` storage keys.
- [x] Add concise comments for non-obvious lifecycle boundaries and invariants.
- [x] Remove comments that merely repeat the code or describe behavior that no longer exists.
- [x] Document ownership and cleanup of timers, sockets, tmux clients, worktrees, temporary buffers, and persisted session files.

## Required validation for every phase

- [x] Run focused tests for touched modules, followed by the complete `bun test` suite.
- [x] Run `bun run typecheck`.
- [x] Run `bun run build` and `bun run verify-build` after server or packaging changes.
- [x] Confirm that API paths and payloads, filesystem paths and schemas, provider commands, terminal frames, and Git command ordering remain unchanged.
- [x] Confirm that Codex and Claude still expose equivalent conversation states and lifecycle behavior.
- [ ] Manually verify when the user runs the app:
  - No scroll jump or flashing during resize or conversation switching.
  - The chat panel remains fully fitted after resize, refresh, and conversation switching.
  - Mouse-wheel conversation scrolling remains available after refresh and switching.
  - Terminal text and Unicode remain intact.
  - Idle and processing states are detected within the existing 1–2 second requirement.
- [x] Compare results against the baseline and keep only measured improvements that do not reduce reliability.

## Recommended execution order

- [x] Step 1: Characterization tests and baseline documentation.
- [x] Step 2: Shared tmux/process helpers and public type boundaries.
- [x] Step 3: Terminal route and provider orchestration decomposition.
- [x] Step 4: `app.vue` controller extraction with terminal lifecycle regression coverage.
- [x] Step 5: Git graph, sidebar, and database decomposition, one area at a time.
- [x] Step 6: Measured polling/reactivity improvements, dead-code removal, and documentation cleanup.

## refer to herdr buffer reader
- [x] refer to "herdr" buffer parser, refine and improve the recognition of buffer state of spec cat
