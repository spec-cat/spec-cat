# Research: Auto Mode

**Date**: 2026-02-28  
**Feature**: `/home/khan/src/brick/specs/013-auto-mode/spec.md`

## Decision: Queue Eligibility and Discovery

**Decision**: Discover features from `/home/khan/src/brick/specs`, include only directories matching `NNN-*` with `spec.md`, then sort lexicographically.

**Rationale**: This exactly satisfies FR-003 and FR-003a while reusing existing feature scanning behavior from `/api/specs/features`.

**Alternatives considered**:
- Include all directories under `specs/` (rejected: violates FR-003a).
- Use filesystem order (rejected: nondeterministic processing sequence).

## Decision: Incremental Execution and Skip Logic

**Decision**: Persist SHA-256 hashes for `spec.md`, `plan.md`, and `tasks.md` after successful cascades only; skip when all hashes match; otherwise choose first changed file as cascade start (`spec -> plan -> tasks -> skill:better-spec`).

**Rationale**: Matches FR-003b, FR-005, and FR-018 while minimizing unnecessary AI runs.

**Alternatives considered**:
- Always rerun full chain (rejected: wastes cycles and conflicts with incremental requirement).
- Hash only `spec.md` (rejected: misses plan/tasks-only drift).

## Decision: Runtime Scheduler Model

**Decision**: Use a bounded-concurrency queue scheduler (`queued/running/success/failed/skipped`) with default concurrency `3`, user-configurable in settings.

**Rationale**: Satisfies FR-013 and FR-016 and aligns with existing Pinia-driven UI status updates.

**Alternatives considered**:
- Sequential execution only (rejected: violates FR-013).
- Separate worker process manager (rejected: unnecessary complexity for current architecture).

## Decision: Toggle-Off and Manual-Interaction Cancellation

**Decision**: On toggle-off, mark queued tasks failed with reason `Auto Mode disabled`, allow active tasks to complete; when a user manually sends a message in a running auto conversation, abort cascade and mark failed `Manual interaction`.

**Rationale**: Directly implements FR-010, FR-010a, and FR-020 with clear user control semantics.

**Alternatives considered**:
- Hard-stop all running tasks immediately (rejected: conflicts with FR-010a).
- Ignore manual user input during auto run (rejected: conflicts with clarified behavior).

## Decision: Conversation and UI Reuse

**Decision**: Extend existing `Conversation` with `autoMode?: boolean`, render `auto` badge in conversation list items, and keep full existing lifecycle actions unchanged.

**Rationale**: Meets FR-004, FR-008, and FR-014 while preserving established workflows.

**Alternatives considered**:
- New Auto Mode-specific conversation type/list (rejected: duplicates lifecycle and review UX).
- Title prefix markers only (rejected: brittle and user-editable).

## Decision: Base Branch and `sc/automode` Integration

**Decision**: Require base-branch selection at activation, initialize/fast-forward `sc/automode` from that base, create feature conversations from `sc/automode`, and after each successful feature cascade integrate it into `sc/automode` immediately.

**Rationale**: Implements FR-022, FR-023, and FR-024 while keeping a continuously accumulated integration branch for the cycle.

**Alternatives considered**:
- Use per-feature base branches directly (rejected: no shared accumulation branch).
- Integrate only at cycle end (rejected: conflicts with FR-024).

## Decision: Conflict Handling During In-Cycle Integration

**Decision**: Reuse existing AI-assisted rebase conflict-resolution capabilities for `sc/automode` integration conflicts.

**Rationale**: Satisfies FR-025 with existing server/chat conflict tooling rather than introducing new resolver logic.

**Alternatives considered**:
- Fail immediately on conflict (rejected: violates FR-025 expectation).
- Manual-only conflict resolution (rejected: does not meet automatic attempt requirement).

## Decision: Constitution and `.speckit` Synchronization

**Decision**: Add a dedicated queue unit with `featureId="constitution"`, run constitution update workflow in a normal conversation/worktree, and require normal preview/finalize review.

**Rationale**: Fulfills FR-012 and preserves parity with feature-level Auto Mode outputs.

**Alternatives considered**:
- Fold constitution updates into every feature task (rejected: excessive duplication).
- Hidden background process outside conversations (rejected: breaks visibility/review model).

## Decision: Persistence for Resume Semantics

**Decision**: Persist Auto Mode enabled flag, concurrency, task queue state, and file-hash records in project-scoped storage; on resume convert persisted `running` tasks back to `queued` before restart.

**Rationale**: Covers FR-002, FR-015, and FR-015a with deterministic recovery.

**Alternatives considered**:
- Memory-only runtime state (rejected: cannot resume after refresh).
- Persist only queue order without task state (rejected: cannot correctly normalize `running` state).

## Clarification Resolution Summary

All technical context unknowns are resolved. No `NEEDS CLARIFICATION` items remain for Phase 1 design.
