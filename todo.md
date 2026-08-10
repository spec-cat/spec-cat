# TODO — Features in `~/src/brick` (spec-cat) missing from code-cat

## 절대 지켜져야 하는 룰

- 현재 디자인은 그대로 유지
- codex, claude모두 동일하게 작동해야함
- codex기본명령어: "codex --dangerously-bypass-approvals-and-sandbox"
- claude: "claude --dangerously-skip-permissions"
- UI 변경시 (리사이즈, 대화전환시) 맨 위로 스크롤했다가 다시 내려오는 일은 절대 없어야함 (화면 깜빡거림)
- 절대 화면 글씨들이 깨지지 않아야 함 (이상한 문자들이 좀 붙어나오는것은 제일 후순위로 어쩔수 없다면 알려줘)
- 어떤 상황에서도 (리사이즈, 새로고침, conversation 전환) chat패널에 꽉 찬 화면이 나와야함
- 새로고침시, conversation들을 전환시에도 마우스 휠로 대화 스크롤이 언제나 가능해야함
- idle, processing감지가 정확해야함 (1~2초 이내감지)


Inventory of capabilities implemented in the original spec-cat workbench
(`~/src/brick`) that this project does not have yet. Grouped by area.

## AI Chat Execution Architecture

- [x] Job queue execution engine — server-side turn lifecycle (queued/running/done/failed/cancelled), per-session serialization, event buffering with cursor-based replay, restart reconciliation (no waiting_permission state: providers are fixed to bypass)
- [x] External automation WebSocket API (`/_ws`) — external tools submit chat turns and stream job events (submit/subscribe+cursor); Python reference client at scripts/automation-client.py (HTTP-polling flavor; no speckit auto-detection/worktree auto-provisioning — jobs target existing conversations)
- [x] Browserless jobs — `POST /api/jobs` with per-event JSON persistence under the store; list/status/cancel API; Claude completion via Stop hook (~100ms), Codex via screen heuristic
- [x] CLI-hook-based turn detection — Stop/PostToolUse/UserPromptSubmit hooks injected into the Claude worktree settings, JSONL spool tailed at 100ms; idle detection ~100-200ms with double-commit guard. Codex stays on the screen-scrape heuristic (hooks require CODEX_HOME ownership, which would break the user's ~/.codex auth); both providers expose identical states
- [x] One-shot provider queries — headless `claude -p` / `codex exec --output-last-message` via execFile (simpler and more robust than brick's marker-based PTY scraping)
- [x] AI commit message generation — POST /api/sessions/:id/commit-message drafts from the merge-base..worktree diff; "AI Generate" button in the finalize modal (plain fill-in, no embedded preview terminal)
- [x] Session resume — `claude --resume` / `codex resume <id>`, session ID capture (Claude project JSONL / Codex rollout scan), tmux relaunch uses the captured id so conversations survive tmux/server restarts
- [ ] Permission mode system — plan/ask/auto/bypass modes, tool approval UI, plan approve/reject flow (NOTE: conflicts with the absolute rules above, which fix both providers to their bypass commands — needs a product decision before implementing)
- [ ] Provider abstraction registry — capability metadata (streaming/resume/autoCommit/conflict resolution), capability gating, per-provider model selection
- [ ] Image attachments in chat
- [ ] Message queueing while streaming, retry last message, abort, context reset
- [x] Chat context diagnostics API (`/api/chat/context`) — effective cwd, provider, session/runtime state, discovered instruction files
- [x] Chat debug panel (Logs sidebar panel: websocket lifecycle, control frames, resizes, runtime state transitions)
- [x] Browser completion notifications (Notification API when tab unfocused; toast for background conversations when focused)

## Spec Workflow

- [x] Spec editing — `PUT /api/specs/...` plus a full-height edit modal (plain textarea instead of CodeMirror 6; no new editor dependency)
- [ ] Spec semantic search — SQLite FTS5 + sqlite-vec + local embeddings (bge-small), background indexer/scheduler, reindex API, Cmd+K search modal
- [x] FR traceability analysis — coverage across spec/plan/tasks (`GET /api/specs/traceability`), per-feature FR coverage chip with alert tooltip and risk coloring
- [x] Skills system — `skills/*.md` registry plus built-in `better-spec`, render API, per-feature run buttons (prompt sent via bracketed paste)
- [x] Cascade / auto mode — per-feature speckit step buttons (specify/clarify/plan/tasks/implement) plus one-click sequential specify→plan→tasks→implement chain (advances on hook-accurate idle transitions; sequential only; clarify is a manual step only, it asks questions and would stall the chain)
- [x] Spec browser as a permanent column — the feature list sits between the activity bar and the conversation list instead of behind a sidebar tab; the activity-bar `S` button is a show/hide toggle (state in `code-cat-spec-panel-collapsed`). On mobile it stays a full-width overlay, mutually exclusive with the sidebar
- [x] Rendered markdown spec viewer (marked + DOMPurify; shiki omitted to keep the bundle light)
- [x] Conversation↔feature routing (brick's `findConversationByFeature` + `pendingFeatureAction`) — a conversation is linked to a feature by its worktree branch or by the `featureId` recorded when it was created from the spec browser. Log-tail feature-id scanning (`linkedFeatures`) is explicitly NOT a routing signal: it matched conversations that merely mentioned the id, which is what made actions fire in unrelated conversations. Every spec-browser action (speckit step, skill, cascade) switches to the owning conversation and waits for the socket to reattach; when no conversation owns the feature the New Conversation modal opens and the action is replayed once the new conversation's CLI reaches a settled prompt. Shift+click always forces a new conversation. The "active" chip names the target conversation and fills in when it is already attached

## Conversation Management

- [x] Archive-first deletion — soft delete, archive list/search/restore (reopens with a fresh worktree), bulk delete (code-cat deletes permanently)
- [x] Conversation titles with inline rename (double-click or ✎) and last-output preview (ANSI-stripped log tail)
- [x] Conversation text search (client-side over id/title/provider/branches, incl. archives)
- [x] Storage limit warnings (soft cap 30 conversations, near-limit banner at 80%)
- [x] Interrupted-stream reconciliation on server boot (recovery plugin kills orphaned `*-web-*` tmux sessions, removes orphaned/archived worktrees, logs missing ones)

## Git

- [x] Rebase conflict resolution flow — fully automatic, no manual editor UI. When `git rebase` (rebase button or finalize) stops on conflicts, `server/utils/conflict-resolver.ts` submits a resolve prompt into the conversation's live tmux PTY via the browserless job queue (NOT `claude -p`/`codex exec`; identical for both providers), then stages + `git rebase --continue` in a bounded loop (8 agent rounds); on non-convergence it `--abort`s and throws the conflict error as before. The agent's messages are returned as a one-time `conflictReport` shown in a dismissible modal (not persisted). brick's per-file conflict-marker editor + continue/abort modal UI intentionally dropped
- [x] Worktree branch follow — when a speckit step checks out a feature branch inside the conversation's worktree, the conversation adopts it instead of being orphaned on the abandoned `sc/<id>` ref. Pure rules in `server/utils/branch-follow.ts` (never follow a detached HEAD, a protected trunk, the base branch, or `sc/preview`); driver `followSessionBranch` in `session-integration.ts`. Triggered by the worktree watcher (which now tracks the branch as well as HEAD, since `checkout -b` leaves HEAD put), on turn-end commit, and once on attach. The vacated `sc/<id>` branch is deleted only when the new branch already contains it
- [x] Real-time auto-refresh — implemented via 3s `/api/git/state` fingerprint polling instead of chokidar+WS; graph re-queries only when the fingerprint changes
- [x] Remote management — add/edit/delete remotes UI and API
- [x] Commit comparison view — select a commit, right-click another → file list and combined stats
- [x] Proper git operation dialogs — themed modal dialogs (merge/push/rebase/reset/stash/tag/cherry-pick/revert/clean/...) instead of `window.prompt/confirm`
- [x] Graph find widget with next/prev navigation (client-side, highlights matches, Enter/Shift+Enter)
- [x] Branch filter dropdown (local + grouped remotes)
- [x] Graph settings — rounded/angular style, mute non-ancestral commits, column visibility
- [x] Infinite scroll / load-more with scroll position preservation (limit grows near bottom; keyed rows keep scroll)
- [x] Merge-base highlighting for feature/conversation/preview branches (`sc/*` merge bases with HEAD get a dashed ring + "base" chip)
- [x] Flat/tree toggle for changed file lists (commit detail files; uncommitted lists remain flat)
- [x] Lightweight polling endpoint `GET /api/git/state` (HEAD/refs/uncommitted hashes)

## UI / Platform

- [ ] Mobile responsive layout — bottom tab bar switching single panels; chat fullscreen mode
- [x] Settings system — `~/.spec-cat/v2/settings.json` via GET/POST /api/settings; theme + git graph state persisted server-side (no separate modal; permission mode/model N/A while providers are fixed-bypass)
- [x] Worktree management — list/create/delete worktrees independent of conversations (modal from the git graph; API refuses session-owned/main worktrees)
- [x] Toast notifications
- [x] Splash screen (fade-out overlay until the terminal and session list are initialized)
- [ ] Design guide page (component showcase)
- [x] Repository status snapshot API (`GET /api/repository/status`)
- [x] xterm WebglAddon + Unicode11Addon (Unicode11 activated before open(), WebGL after open() with context-loss fallback to DOM renderer)

## Packaging / Quality

- [x] CLI launcher — `bin/code-cat.mjs` (port/host/project args), bin+files entries, node-pty assets included in the pack (kept `private: true`; publishing is a user decision)
- [x] Post-build verification script (`bun run verify-build` smoke-boots the built server, checks assets + node-pty natives)
- [ ] Test coverage — brick has 414 vitest tests plus a branch-API perf benchmark (code-cat: now 203 bun tests, up from 15; parity still open)

## Notes

- Gemini provider: brick has only a spec document (034) and GEMINI.md; no server provider is actually registered, so it is excluded above.
- brick's structured chat block renderer (`ChatMessages.vue`) is legacy inside brick itself — its live chat also moved to an xterm terminal surface, so code-cat's terminal-first design matches brick's final direction.
