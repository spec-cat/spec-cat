# Refactoring TODO

Continuation of the large-file refactoring work. Tests must stay green at every
step. Pattern: extract pure logic / API boundaries into `utils/` or dedicated
modules; keep the reactive Pinia store / Vue component surface stable.

## Current state (after round 5)

Large file sizes (all 6 primary targets):

| File | Lines |
|---|---|
| `stores/chat.ts` | 2064 |
| `composables/useChatStream.ts` | 1392 |
| `stores/gitGraph.ts` | 1309 |
| `components/chat/ChatInput.vue` | 951 |
| `components/git/GitGraph.vue` | 900 |
| `server/utils/git.ts` | 875 |

Tests: **414 passing** (started at 159). 25 new pure-logic modules extracted
across 5 rounds. Zero regressions.

## Guardrails

- **Run `pnpm test` after every meaningful edit.** The extraction pattern relies
  on characterization tests catching behavior drift.
- **Never change the exported surface of stores/composables without cause.**
  Consumers are not updated in these rounds; the goal is internal hygiene.
- **Keep reactive state in the store.** Extract helpers/APIs/factories only.
  Pinia setup stores wrap refs in `readonly()` on export which blocks external
  mutation, so any "split into sub-stores" must preserve that contract.
- **Test pattern for the chat store**: use `vi.mock('vue', { readonly: x => x })`
  so tests can seed state. See `tests/stores/chat.test.ts`.
- **Prefer function factories over classes.** Existing extractions use
  `createX()` returning `{ methods }` (see `cascadeQueue.ts`, `saveScheduler.ts`).

## Priority 1 — Remaining server/utils/git.ts splits

Low risk, consistent with earlier `gitBranchOperations.ts` work.

- [ ] **Extract tag operations** → `server/utils/gitTagOperations.ts`
      Functions: `createTag`, `deleteTag`, `deleteRemoteTag`, `pushTag`,
      `getTagDetail`. Keep re-exports in `git.ts`.
- [ ] **Extract stash operations** → `server/utils/gitStashOperations.ts`
      Functions: `listStashes`, `createStash`, `applyStash`, `popStash`,
      `dropStash`, `stashBranch`.
- [ ] **Extract remote operations** → `server/utils/gitRemoteOperations.ts`
      Functions: `listRemotes`, `addRemote`, `editRemote`, `deleteRemote`,
      `fetchAll`.

Expected: `git.ts` drops from 875 → ~450 lines.

## Priority 2 — useChatStream.ts remaining hot spots

- [ ] **Extract `sendMessage` prompt/options composition**
      The sendMessage in useChatStream.ts (~80 lines around line 1235+) does
      prompt construction, stream-opt merging, and dispatch. Split the pure
      options builder into `utils/streamMessageOptions.ts`.
- [ ] **Extract `subscribe` + `tryResumeStreaming`**
      Post-reload recovery logic (~130 lines). Move to
      `composables/useStreamReconnect.ts` — takes ensureConnection + chatStore
      as dependencies.
- [ ] **Extract `flushTextChunk` pure path**
      The flat-content append portion is pure once the block ref is known.
      Thin win (~10 lines) but simplifies `applyBlockDelta`.

## Priority 3 — chat.ts archive + conversation CRUD

- [ ] **Extract archive API calls** → `utils/archiveApi.ts`
      `/api/conversations/:id/archive`, `/api/conversations/:id/restore`,
      `/api/conversations/archive/:id`. Currently inline in `archiveConversation`
      / `restoreArchivedConversation` / `deleteArchivedConversation`.
- [ ] **Extract conversation title generation**
      `updateConversationTitleIfNeeded` logic — pure string generation from
      first user message.
- [ ] **Consider: sub-store split**
      After helpers are out, consider splitting `stores/chatConflict.ts` as a
      separate Pinia store that the chat store references. HIGH RISK — do last,
      after characterization tests cover conflict lifecycle.

## Priority 4 — gitGraph.ts thin wrappers

- [ ] **Group runGitMutation wrappers by domain**
      50+ thin wrappers around `runGitMutation` (branch ops, tag ops, stash
      ops, remote ops). Don't extract individually; consider a `createGitMutations`
      factory that returns a domain bundle given `runGitMutation`.
      Example shape:
      ```ts
      const branchOps = createBranchMutations(runGitMutation)
      // returns { checkoutBranch, createBranch, deleteLocalBranch, ... }
      ```
- [ ] **Extract selection state** (`selectedCommit`, `selectedCommitFiles`,
      `selectCommit`, `clearSelection`, `selectUncommittedChanges`) into a
      cohesive slice. Low ROI — probably skip unless pursuing sub-stores.

## Priority 5 — ChatInput.vue remaining

- [ ] **Extract menu UI state** → `composables/useToggleableMenus.ts`
      `showModeMenu`, `showModelMenu`, `handleClickOutside` pattern. Thin
      generic `createToggleMenu` helper that closes on click-outside.
- [ ] **Extract retry flow**
      `canRetry` computed + retry handler (~40 lines). Target: a
      `useRetryLastMessage()` composable that takes `chatStore` + `streamMessage`.
- [ ] **Consider: textarea auto-resize helper**
      `resetTextareaHeight` + adjust-on-input logic. Small but repeats a
      common pattern.

## Priority 6 — GitGraph.vue remaining

- [ ] **Extract toolbar component** → `components/git/GitGraphToolbar.vue`
      Find widget, filter pills, remote/settings buttons. Currently ~80 lines
      of template + handlers inline.
- [ ] **Extract layout orchestration**
      `GitGraph.vue` is mostly commit list + detail + comparison layout. Could
      become a thin orchestrator if `GitGraphLayout.vue` owns the split.

## Skipped / deferred

- **`ensureConnection` WebSocket lifecycle** — partial extraction done
  (`wsConnectionState.ts` with `createConnectionState` / `isStaleConnection` /
  `checkExistingConnection`). Deeper split is low ROI because the promise
  plumbing + onopen/onclose/onerror handlers would require 5+ callback
  parameters. Current state is good.
- **chat.ts conversation CRUD core** — `createConversation`, `selectConversation`,
  `deleteConversation` touch many reactive refs and run multiple `$fetch` calls.
  Refactor only if sub-store split is pursued.

## Test conventions

- New pure utils go in `utils/` with `tests/utils/<name>.test.ts`.
- API wrappers follow the pattern: **one export per endpoint**, params object,
  typed response. See `utils/rebaseApi.ts` and `utils/worktreeApi.ts`.
- When extracting from a store/composable, the first commit should keep the
  old call-sites identical but delegate to the new module. The second commit
  (if needed) updates usage patterns (e.g., accept returned tuple instead of
  mutating a passed-in ref).
