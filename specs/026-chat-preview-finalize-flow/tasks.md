# Tasks: Chat Preview & Finalize Flow

- [ ] T001 [FR-001] Lock preview create/delete API behavior in `server/api/chat/preview.post.ts` and `server/api/chat/preview.delete.ts`.
- [ ] T002 [FR-002] Lock preview sync behavior in `server/api/chat/preview-sync.post.ts`.
- [ ] T003 [FR-003] Lock finalize branch-target behavior in `server/api/chat/finalize.post.ts`.
- [ ] T004 [FR-004] Lock rebase API state transition in `server/api/chat/rebase.post.ts`.
- [ ] T005 [FR-001][FR-003] Scope panel control rendering in `components/chat/ChatPanel.vue`.
- [ ] T006 [FR-001][FR-004] Scope preview/finalize/rebase actions in `stores/chat.ts`.
- [ ] T007 [FR-002] Enforce preview-sync response validation in store caller path in `stores/chat.ts` (treat `success: false` as failure with contextual logs).
- [ ] T008 [FR-002] Enforce preview-sync response validation in stream completion path in `composables/useChatStream.ts` (no silent success on sync failure).
- [x] T009 [FR-005] Prevent cascade automation from reusing finalized conversations in `components/features/FeaturesPanel.vue` and show archive-first error message.

---

## FR Traceability Addendum (2026-02-16)

- [ ] T900 [Traceability] Verify every FR in this child spec is explicitly mapped in this tasks file and update mappings when tasks change.

---

## Inherited Backlog from 011 Umbrella

- [ ] T700 [Traceability] Backfill finalize/rebase mapping from current umbrella [FR-022, FR-022a, FR-022b, FR-022c, FR-022d, FR-022e, FR-022f].
