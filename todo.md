# Chat Streaming Performance TODO

## Goal
- Prevent chat creation latency from degrading (target: keep creation flow under ~2s in normal local repo state, excluding model response time).

## 1) Fix branch list API N+1 calls (highest impact)
- Problem
  - `server/api/git/branches.get.ts` runs one extra `git show` per branch in a sequential loop.
  - Chat creation modal calls this API every open, so latency grows as `sc/*` branches increase.
- Tasks
  - Replace per-branch `git show` loop with a single bulk git command (`for-each-ref`-based output including date).
  - Parse branch metadata in one pass.
  - Keep response shape backward-compatible with `BranchResponse`.
- Acceptance Criteria
  - API runtime does not scale linearly with branch count due to per-branch subprocess calls.
  - Modal branch dropdown loads noticeably faster with many `sc/*` branches.

## 2) Filter `sc/*` branches on server side
- Problem
  - UI filters out `sc/*` after receiving full branch list, so server still computes/returns unnecessary data.
- Tasks
  - Add query option (e.g., `excludeSc=true`) to `/api/git/branches`.
  - Apply filter server-side before expensive formatting/serialization.
  - Update `NewConversationModal.vue` to request filtered list.
- Acceptance Criteria
  - New conversation modal API excludes `sc/*` from payload at source.
  - Branch list payload size and processing time are reduced when many chat branches exist.

## 3) Reduce full conversation snapshot writes on create
- Problem
  - `createConversation()` calls `saveAllConversations()` (full dataset write), and `conversations.json` can grow large.
- Tasks
  - Switch creation path to incremental save (`saveConversation`) where safe.
  - Keep full save only when structure-wide changes are required.
  - Validate no regressions in archive/restore ordering behavior.
- Acceptance Criteria
  - Creating one conversation does not rewrite all conversations by default.
  - No data loss/regression in persisted conversation list.

## 4) Review chat worktree creation latency path
- Problem
  - `/api/chat/worktree` does multiple git commands and `git worktree add` synchronously in the create path.
- Tasks
  - Add timing logs around each git step in `server/api/chat/worktree.post.ts`.
  - Identify dominant step (`show-ref`, `rev-parse`, or `worktree add`).
  - Based on findings, optimize command sequence or defer non-critical work.
- Acceptance Criteria
  - Per-step latency is visible in logs.
  - Confirmed optimization plan based on measured hotspot.

## 5) Prevent hidden panel reactive overhead
- Problem
  - Right panels are `v-show` mounted; hidden `ConversationsPanel` still runs watchers/computed.
- Tasks
  - Evaluate `v-if` unmount strategy for `ConversationsPanel` and `FeaturesPanel` when fullscreen.
  - If unmounting is risky, gate expensive computed/watch logic when panel is hidden.
- Acceptance Criteria
  - Hidden panels do not continue expensive reactive work during streaming.
  - No UX regressions when toggling fullscreen.

## 6) Add regression/perf checks
- Tasks
  - Add lightweight benchmark script or test helper for branch API response time.
  - Add scenario notes: 10/30/50 chat branches and expected modal load time envelope.
- Acceptance Criteria
  - Team can re-run perf checks after changes.
  - Performance regressions are detectable before merge.

## Suggested execution order
1. Branch API N+1 제거
2. 서버측 `sc/*` 필터링
3. 저장 경로(full write) 최적화
4. worktree 생성 경로 계측 및 개선
5. hidden panel reactive 비용 최적화
6. 회귀/성능 검증 추가
