# Quickstart: Auto Mode

## Goal

Enable Auto Mode from the sidebar, process eligible spec units in one automated cycle with incremental cascade logic, and review resulting spec changes through the standard preview/finalize conversation workflow.

## Prerequisites

- Branch: `013-auto-mode`
- Existing spec directories under `/home/khan/src/brick/specs`
- Chat/worktree features already functioning in the workspace
- Settings page available for concurrency configuration

## Implementation Sequence (Phase 2-ready)

1. Add Auto Mode state model and persistence layer (enabled state, queue snapshot, hash records, concurrency).
2. Add sidebar toggle interaction that requires base-branch selection on activation.
3. Implement queue discovery + eligibility filter (`NNN-*` + `spec.md`) + SHA-256 skip logic.
4. Implement incremental step resolver (`plan/tasks/skill:better-spec`) and scheduler with max concurrency.
5. Reuse/create feature conversations flagged as auto, with existing worktree creation and stream pipeline.
6. Prepare `sc/automode` from selected base and create feature worktrees from `sc/automode`.
7. After each successful feature, integrate into `sc/automode` and attempt AI-assisted conflict resolution when needed.
8. Implement disable and manual-interaction cancellation semantics.
9. Add conversation-list auto badge and preserve all existing lifecycle actions.
10. Add dedicated `constitution` task path and include it in cycle processing.

## Manual Validation Checklist

1. Toggle Auto Mode on and verify base-branch selection is required before processing begins.
2. Confirm queue is alphabetically ordered and excludes directories missing `spec.md` or non-`NNN-*` names.
3. Confirm unchanged features are skipped when all stored hashes match.
4. Modify only `tasks.md` for a feature and verify Auto Mode runs only `skill:better-spec` for that feature.
5. Modify only `plan.md` and verify Auto Mode runs `tasks -> skill:better-spec`.
6. Modify `spec.md` and verify Auto Mode runs full `plan -> tasks -> skill:better-spec`.
7. Verify conversations are created/reused per feature and show an `auto` indicator in the conversation list.
8. Verify messages render with standard structured blocks (tool boxes + markdown) identical to normal chat.
9. Disable Auto Mode mid-run and verify queued tasks fail with `Auto Mode disabled` while currently running tasks complete.
10. Send a manual message in an active Auto Mode conversation and verify task fails with `Manual interaction`.
11. Verify successful feature completion immediately updates `sc/automode` in-cycle.
12. Force an integration conflict and verify AI-assisted resolution is attempted.
13. Refresh during running cycle and verify persisted tasks resume with prior `running` tasks reset to `queued`.
14. Verify `constitution` conversation is created/processed and reviewable through preview/finalize.
15. Verify cycle ends in idle state with toggle still on and no automatic re-scan until off/on.

## Done Criteria

- FR-001 through FR-027 (including sub-requirements) are behaviorally satisfied.
- SC-001 through SC-010 are manually testable and observed.
- No implementation-code modifications are performed by Auto Mode workflows.
- All resulting changes remain review-gated through existing preview/finalize flow.
