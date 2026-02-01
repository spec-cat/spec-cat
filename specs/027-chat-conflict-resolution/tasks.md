# Tasks: Chat Conflict Resolution

- [ ] T001 [FR-001] Normalize conflict listing API output in `server/api/rebase/conflicts.get.ts`.
- [ ] T002 [FR-002] Normalize resolve + continue + abort behavior across `server/api/rebase/*`.
- [ ] T003 [FR-003] Lock conflict file editing behavior in `components/chat/ConflictFileEditor.vue`.
- [ ] T004 [FR-003] Lock modal-level resolution workflow in `components/chat/ConflictResolutionModal.vue`.
- [ ] T005 [FR-004] Scope AI resolve handling to rebase conflict endpoints.
- [ ] T006 [FR-001][FR-002] Scope conflict store state in `stores/chat.ts`.

---

## FR Traceability Addendum (2026-02-16)

- [ ] T900 [Traceability] Verify every FR in this child spec is explicitly mapped in this tasks file and update mappings when tasks change.

---

## Inherited Backlog from 011 Umbrella

- [ ] T700 [FR-020] Add AiResolveRequest and AiResolveResponse types in `types/chat.ts`.
- [ ] T701 [FR-018][FR-020] Implement AI resolve endpoint in `server/api/rebase/ai-resolve.post.ts`.
- [ ] T702 [FR-016][FR-017][FR-018] Implement conflict editor syntax-highlighting + line numbers + per-file AI resolve in `components/chat/ConflictFileEditor.vue`.
- [ ] T703 [FR-019] Add "AI Resolve All" action in `components/chat/ConflictResolutionModal.vue`.
- [ ] T704 [FR-018][FR-019] Add `aiResolveConflictFile` / `aiResolveAllConflicts` store actions in `stores/chat.ts`.
- [ ] T705 [Traceability] Backfill conflict-lifecycle mapping [FR-006d, FR-006e, FR-006f, FR-021].
