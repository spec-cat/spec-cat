# Feature Specification: Auto Mode

**Feature Branch**: `013-auto-mode`
**Created**: 2026-02-08
**Status**: In Review (implementation complete; final manual validation pending)
**Input**: User description: "Auto Mode - Background scheduler that automatically runs speckit workflow per spec unit, finds discrepancies between implementation and specs, and updates specs (not implementation). Reuses existing chat UI and conversation system — each spec unit gets its own conversation with cascade pipeline. Features on/off toggle in UI, keeps constitution and .speckit files up to date, requires human review before merging to main."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enable Auto Mode (Priority: P1)

A developer wants to keep their specifications up to date without manually running the speckit workflow for each feature. They click the "Auto Mode" toggle button in the UI to activate background spec processing. Once enabled, the system scans eligible spec directories and creates a regular chat conversation per feature (reusing existing conversations for a feature if available, just like 012-cascade-automation). Each conversation runs the Auto Mode step sequence incrementally — if all files match stored hashes, the feature is skipped; otherwise, execution starts from the first changed file in the sequence (plan → tasks → skill:better-spec). The system updates specs to reflect reality — it never modifies implementation code. The developer can see all Auto Mode conversations in the normal conversation list, click into any of them to watch progress in real-time, and review/finalize changes using the standard worktree preview/finalize flow.

**Why this priority**: This is the core value proposition of Auto Mode. Without the ability to turn it on and have it process specs automatically, no other functionality matters.

**Independent Test**: Can be fully tested by toggling Auto Mode on and verifying that conversations are created per spec unit, cascade messages are sent, and spec files are updated in each conversation's worktree.

**Acceptance Scenarios**:

1. **Given** Auto Mode is off and specs exist for multiple features, **When** the user clicks the Auto Mode toggle to "on", **Then** the system creates (or reuses) conversations per feature, begins sending cascade commands, and the toggle reflects the "on" state.
2. **Given** Auto Mode is on and processing specs, **When** the user clicks the Auto Mode toggle to "off", **Then** the system stops sending new cascade steps (current streaming message completes naturally) and the toggle reflects the "off" state.
3. **Given** Auto Mode is on, **When** a spec cascade completes for a feature, **Then** the updated spec files remain in the conversation's worktree branch (not merged to main) awaiting human review via the standard preview/finalize flow.

---

### User Story 2 - Monitor Auto Mode Progress (Priority: P2)

While Auto Mode is running, the developer monitors progress through the existing conversation list. Auto Mode conversations appear in the normal conversation list with a visual indicator (e.g., badge or icon) showing they were created by Auto Mode. The developer can click into any Auto Mode conversation to see the full chat history — the cascade commands sent and Claude's responses — just like any manual conversation. Streaming status badges show which conversations are actively processing.

**Why this priority**: Visibility into what Auto Mode is doing is essential for user trust. By reusing the conversation list, no separate monitoring UI is needed.

**Independent Test**: Can be tested by enabling Auto Mode and verifying that Auto Mode conversations appear in the conversation list with appropriate badges and streaming indicators.

**Acceptance Scenarios**:

1. **Given** Auto Mode is on and processing multiple features, **When** the user views the conversation list, **Then** Auto Mode conversations are visible with an "auto" badge and streaming status indicators for active ones.
2. **Given** Auto Mode has completed processing a feature, **When** the user clicks on that conversation, **Then** they see the full cascade chat history and can use the standard preview/finalize buttons.
3. **Given** Auto Mode encounters an error processing a feature, **When** the user clicks on that conversation, **Then** they see the error in the chat message history, just like any failed chat interaction.

---

### User Story 3 - Review and Merge Auto Mode Results (Priority: P2)

After Auto Mode finishes processing a spec, the developer reviews changes using the exact same flow as any chat conversation: click the conversation, use the preview button (eye icon) to check out the worktree's changes, review diffs, and finalize (merge to main) or close/discard. No new review UI is introduced — Auto Mode results are first-class conversations.

**Why this priority**: Equal to monitoring — the human-in-the-loop review is a core principle of Spec Cat. By reusing the existing preview/finalize flow, no new review mechanism is needed.

**Independent Test**: Can be tested by completing an Auto Mode run for one feature and then using the existing preview/finalize flow on that conversation.

**Acceptance Scenarios**:

1. **Given** Auto Mode has completed processing a feature's specs, **When** the user clicks the preview button on that conversation, **Then** the standard preview flow activates showing the worktree changes.
2. **Given** the user is previewing Auto Mode changes, **When** they click finalize, **Then** the standard finalize flow executes — squash, rebase, merge to main, cleanup.
3. **Given** the user wants to discard Auto Mode changes, **When** they delete the conversation or close the worktree, **Then** the worktree is cleaned up and changes are discarded.

---

### User Story 4 - Constitution and .speckit Sync (Priority: P3)

Auto Mode also keeps project-wide configuration files up to date. It creates a dedicated conversation (with featureId "constitution") to run the constitution update workflow. This conversation follows the same pattern — visible in the conversation list, reviewable with preview/finalize.

**Why this priority**: This is a valuable enhancement but secondary to the core spec-per-feature processing. The project-wide files change less frequently than individual feature specs.

**Independent Test**: Can be tested by modifying the project in a way that makes the constitution outdated, enabling Auto Mode, and verifying a "constitution" conversation is created with updated files.

**Acceptance Scenarios**:

1. **Given** Auto Mode is on and the constitution is stale relative to the codebase, **When** Auto Mode processes the constitution, **Then** it creates a conversation with featureId "constitution" and runs the constitution update workflow.
2. **Given** the constitution conversation has completed, **When** the user previews and finalizes it, **Then** the constitution and .speckit files on main are updated via the standard finalize flow.

---

### Edge Cases

- What happens when Auto Mode is enabled but there are no spec directories? The system should report "no specs to process" via a toast/notification and transition to idle state. The user must toggle off and on to trigger a new scan.
- What happens when Auto Mode tries to process a feature that already has an active worktree? It skips that feature for this cycle (it will not be retried unless the user re-triggers Auto Mode).
- What happens when a worktree creation fails (e.g., branch conflict, disk space)? The error appears in the conversation chat history. The system continues processing other features.
- What happens when the user navigates away from the page while Auto Mode is running? Since conversations use the existing WebSocket/PTY infrastructure, active streams continue on the server. The Auto Mode queue state is persisted so it can resume on reconnect.
- What happens when Auto Mode is re-enabled after being disabled mid-processing? It should start a fresh scan. Existing conversations from previous runs remain in the conversation list for review.
- What happens when multiple specs depend on each other? Each spec is processed independently in its own conversation. Cross-spec consistency is not in scope for this feature.
- What happens when the user manually opens an Auto Mode conversation and sends a message while cascade is running? The current cascade is cancelled entirely and the task is marked as failed with reason "Manual interaction". Manual interaction takes priority.

## Clarifications

### Session 2026-02-08

- Q: What is the comparison mechanism for FR-007 ("compare current implementation against existing specs")? → A: Claude's Auto Mode step sequence (plan/tasks/skill:better-spec) is the comparison mechanism. No separate diff or comparison engine is built.
- Q: Does Auto Mode always run every feature on each activation? → A: No. Queue discovery is incremental: unchanged features are skipped using SHA-256 hash comparison over feature spec contents.
- Q: Where should the Auto Mode toggle be placed in the UI? → A: In the sidebar, near the conversation list header, adjacent to the conversations it creates.
- Q: Should there be a timeout or maximum duration per conversation cascade? → A: No timeout. Cascades run until completion. The user can manually stop stuck conversations via the existing conversation controls.
- Q: How should the feature queue ordering work, and how many cascades can run simultaneously? → A: Alphabetical by spec directory name. Up to N cascades run concurrently (default 3), configurable via a setting in the settings page.
- Q: What happens when Auto Mode completes a full cycle (all queued features processed)? → A: Single cycle per activation — process all features once, then transition to idle state (still "on" but not re-scanning). The user must toggle off and on to trigger a new cycle.

### Session 2026-02-24

- Q: Should Auto Mode execution be always full cascade, incremental based on changed files, skip if all match hashes, or combination? → A: Combination: Skip if all match (C), otherwise incremental execution (B)
- Q: When should file hashes be stored for incremental execution comparison? → A: Only after successful cascade completion (all steps finished without errors)
- Q: Who should be authorized to toggle Auto Mode on/off? → A: no permission
- Q: Should there be a way to force re-processing of unchanged specs? → A: No force option - users must modify a file to trigger reprocessing
- Q: What should happen to Auto Mode cascade when user manually interacts? → A: Cancel current cascade entirely - mark task as failed with reason "Manual interaction"

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an on/off toggle control in the sidebar, near the conversation list header, to enable or disable Auto Mode.
- **FR-002**: System MUST persist the Auto Mode enabled/disabled state so it survives page refreshes (localStorage).
- **FR-003**: When Auto Mode is enabled, the system MUST scan `specs/` and build a processing queue ordered alphabetically by directory name.
- **FR-003a**: A feature directory MUST be eligible only when it matches `NNN-*` and contains `spec.md`.
- **FR-003b**: Queue discovery MUST use SHA-256 hash comparison on spec.md, plan.md, and tasks.md files. Features are skipped entirely if all three files match stored hashes from previous successful runs.
- **FR-004**: System MUST create a regular chat conversation per feature using the existing conversation system (009-conversation-management), reusing an existing conversation for the same featureId if one exists (same as 012-cascade-automation).
- **FR-005**: System MUST run the Auto Mode step sequence incrementally based on file changes: if spec.md changes, run all steps (plan → tasks → skill:better-spec); if only plan.md changes, run from tasks onward; if only tasks.md changes, run only skill:better-spec. Execution always stops before implement.
- **FR-006**: Each conversation MUST have its own isolated worktree via the existing worktree integration (011-chat-worktree-integration).
- **FR-007**: System MUST update spec files to reflect the current codebase by running the Auto Mode step sequence (plan → tasks → skill:better-spec) via Claude's analysis. No separate diff or comparison engine is built. The system MUST never modify implementation code.
- **FR-008**: Auto Mode conversations MUST be visually distinguishable in the conversation list with an "auto" badge or indicator.
- **FR-009**: Completed spec updates MUST remain in conversation worktree branches until a human reviews via the standard preview/finalize flow.
- **FR-010**: When Auto Mode is disabled, queued (not-yet-started) tasks MUST immediately transition to failed with reason `Auto Mode disabled`, and no new tasks may start.
- **FR-010a**: Tasks already in running state when Auto Mode is disabled MUST be allowed to complete naturally.
- **FR-011**: System MUST skip features that already have an active worktree for the same feature.
- **FR-012**: System MUST process and update constitution and .speckit memory files by creating a dedicated conversation with featureId "constitution".
- **FR-013**: System MUST process specs concurrently, running up to N conversation cascades in parallel, where N is a user-configurable concurrency limit (default: 3).
- **FR-016**: System MUST provide a concurrency setting in the settings page that controls how many Auto Mode cascades can run simultaneously (default: 3). The setting MUST be persisted (localStorage).
- **FR-014**: Auto Mode conversations MUST support the full existing conversation lifecycle: rename, delete, preview, finalize, search/filter.
- **FR-015**: The Auto Mode queue state MUST be persisted so that if the page is refreshed while Auto Mode is on, it can resume processing unfinished tasks.
- **FR-015a**: During resume, tasks persisted as `running` MUST be reset to `queued` and restarted from the beginning of the feature sequence.
- **FR-017**: Auto Mode MUST operate as a single cycle per activation — once all queued features have been processed, the system transitions to an idle state (toggle remains "on" but no re-scanning occurs). The user must toggle off and on again to trigger a new cycle.
- **FR-018**: System MUST store SHA-256 hashes of spec.md, plan.md, and tasks.md files only after successful cascade completion (all steps finished without errors) for a feature, enabling incremental execution on subsequent runs. Failed cascades do not update stored hashes.
- **FR-019**: System MUST allow any authenticated user to toggle Auto Mode on/off without requiring special permissions or authorization.
- **FR-020**: System MUST cancel any running Auto Mode cascade when a user manually sends a message in that conversation, marking the task as failed with reason "Manual interaction".

### Key Entities

- **AutoModeState**: The Auto Mode runtime state managed in the chat store. Contains: enabled (boolean), queue (list of featureIds to process), activeFeatureIds (set of featureIds currently being processed, up to concurrency limit), processedFeatures (set of completed featureIds in this cycle), concurrency (number, default 3), idle (boolean, true when cycle completes — all features processed, no active cascades).
- **Conversation** (existing, extended): The existing Conversation entity gains an optional `autoMode: boolean` field to indicate it was created/used by Auto Mode, enabling the "auto" badge in the conversation list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can enable Auto Mode with a single click and see the first conversation cascade begin within 5 seconds.
- **SC-002**: All spec directories are discovered and queued for processing within 3 seconds of Auto Mode activation.
- **SC-003**: Users can monitor Auto Mode progress by viewing the conversation list — no separate monitoring UI needed.
- **SC-004**: 100% of Auto Mode spec changes go through human review (preview/finalize) before reaching the main branch.
- **SC-005**: Disabling Auto Mode stops new cascade processing. Active streams complete naturally. No orphaned processes.
- **SC-006**: Users can review, approve, or reject each Auto Mode result independently using the standard preview/finalize flow per conversation.
- **SC-007**: Auto Mode conversations are fully functional conversations — users can click into them, see the chat history, manually interact, preview, and finalize.

## Assumptions

- The existing conversation system (009), worktree integration (011), and cascade automation (012) are stable and reusable.
- The cascade pipeline mechanism from 012 can be triggered programmatically for each conversation.
- The chat store can manage multiple conversations with cascade pipelines queued sequentially.
- The `@anthropic-ai/claude-code` SDK and WebSocket/PTY infrastructure support multiple concurrent conversation sessions (up to the configured concurrency limit).
- The conversation list UI can accommodate an "auto" badge without layout changes.
