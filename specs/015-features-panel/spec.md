# Feature Specification: Features Panel

**Feature Branch**: `015-features-panel`
**Created**: 2026-02-08
**Status**: Draft
**Description**: A panel component that discovers feature specifications and displays them as interactive cards. Each card shows the feature name, ID, and status badges indicating which documentation artifacts exist. Cards provide action buttons for cascade operations (clarify, plan, tasks, implement, analyze). Clicking a card opens a full-screen modal for viewing and editing specification files. The panel links conversations to features and supports automated workflow progression.

## Structure Notice

This spec has been rebaselined into a consolidated Features family with child specs:

- `specs/028-features-panel-core/`
- `specs/029-features-panel-actions/`
- `specs/030-features-panel-active-linking/`

Run active planning and implementation in those child specs.

## Clarifications

### Session 2026-02-08

- Q: What sort order should features use in the list? → A: Sort by directory name (natural alphanumeric — numeric prefix first).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Feature Inventory (Priority: P1)

A developer opens the application and sees the Features Panel listing all features. Each feature is displayed as a card showing its display name, feature ID, and color-coded status badges indicating which specification artifacts exist (spec, plan, tasks). The developer can quickly scan the list to understand the project's feature landscape and their development progress.

**Why this priority**: This is the foundational capability — without a visible feature list, no other panel interactions are possible. It delivers immediate value by providing an at-a-glance overview of all project features and their spec-readiness status.

**Independent Test**: Can be fully tested by loading the panel with a `specs/` directory containing multiple features at various stages, and verifying each card renders correctly with the right badges.

**Acceptance Scenarios**:

1. **Given** feature specifications exist with various documentation files, **When** the panel loads, **Then** each feature appears as a card showing its name (extracted from specification heading or derived from feature identifier), feature ID, and the correct status badges (green for spec, cyan for plan, yellow for tasks).
2. **Given** no feature specifications exist, **When** the panel loads, **Then** an empty state message is displayed guiding the user to create a feature specification.
3. **Given** a feature directory has only a `spec.md` file, **When** the panel renders that card, **Then** only the "spec" badge is shown (no "plan" or "tasks" badges).
4. **Given** features are loaded, **When** the user clicks the refresh button, **Then** the feature list is re-fetched from the server and updated.

---

### User Story 2 - View and Edit Spec Files in Modal (Priority: P1)

A developer clicks a feature card and opens a full-screen modal for that feature. The modal shows tabs for all documentation files in the feature, renders the selected file as styled markdown, and supports in-app editing with Edit, Save, and Cancel functionality.

**Why this priority**: Viewing and maintaining spec content is essential before taking cascade actions. The modal is the primary in-app spec authoring surface.

**Independent Test**: Can be fully tested by opening a feature modal, switching tabs, rendering markdown, editing content, and saving via PUT.

**Acceptance Scenarios**:

1. **Given** the panel is showing the features list, **When** the user clicks a feature card, **Then** a full-screen modal opens with tab entries for documentation files in that feature using human-readable labels (e.g., "Spec", "Plan", "Tasks", "Checklist: requirements").
2. **Given** the modal is open, **When** the user switches file tabs, **Then** the selected file is loaded and rendered with styled headings, code blocks, tables, and lists.
3. **Given** the modal is showing a loaded file, **When** the user clicks Edit, **Then** the viewer switches to editable textarea mode with Save and Cancel controls.
4. **Given** the modal is in edit mode, **When** the user clicks Save, **Then** the panel persists the updated file content and updates the rendered content on success.
5. **Given** a file load or save fails, **When** the modal handles the error, **Then** it shows an error state (and retry for load) without closing the modal.

---

### User Story 3 - Trigger Cascade Operations (Priority: P2)

A developer sees action buttons on each feature card (Clarify, Plan, Tasks, Run, Analyze) and clicks one to trigger the corresponding workflow step. "Plan" triggers Plan → Tasks → Implement cascade, "Tasks" triggers Tasks → Implement cascade, and "Run" triggers Implement only. "Analyze" runs a prerequisite quality check step first, then the analyze operation. Each action creates or reuses a conversation linked to that feature.

**Why this priority**: This is the primary workflow automation — converting spec artifacts into implementation through the cascade pipeline. It depends on the feature list being visible (P1) but is the main reason developers use the panel.

**Independent Test**: Can be tested by clicking each action button and verifying the correct speckit command is sent to the chat system with the right cascade step sequence.

**Acceptance Scenarios**:

1. **Given** a feature card with a spec, **When** the user clicks "Plan", **Then** a conversation is created (or existing one reused), named `plan: {featureId}`, and the plan command is sent with queued follow-up steps for tasks and implementation.
2. **Given** a feature card with a plan, **When** the user clicks "Tasks", **Then** the tasks command is sent with queued follow-up step for implementation.
3. **Given** a feature card with tasks, **When** the user clicks "Run", **Then** the implement command is sent with no queued follow-up steps.
4. **Given** a feature card with tasks, **When** the user clicks "Analyze", **Then** the system queues the analyze action, executes the quality check prerequisite first, and only sends the analyze command after the prerequisite step completes.
5. **Given** prerequisite quality check fails for "Analyze", **When** the click is handled, **Then** the action is aborted and the analyze command is not sent.
6. **Given** a conversation already exists for a feature, **When** the user clicks an action button (without Shift), **Then** the existing conversation is reused instead of creating a new one.
7. **Given** a conversation already exists for a feature, **When** the user Shift+clicks an action button, **Then** a new conversation is forcibly created.

---

### User Story 4 - Open Spec Chat (Priority: P2)

A developer clicks the chat icon on a feature card to open a new conversation specifically linked to that feature. The conversation is named `spec: {featureId}` and is pre-associated with the feature for context injection.

**Why this priority**: Provides ad-hoc chat capability with feature context, complementary to the structured cascade actions.

**Independent Test**: Can be tested by clicking the chat icon and verifying a new conversation is created with the correct feature association.

**Acceptance Scenarios**:

1. **Given** a feature card with a spec exists, **When** the user clicks the chat icon, **Then** a new conversation is created with `featureId` set and title `spec: {featureId}`, and the conversation panel selects it.
2. **Given** no spec file exists for a feature, **When** the user views the card, **Then** the chat icon and action buttons are not visible.

---

### User Story 5 - Active Feature Highlighting (Priority: P3)

When a developer has an active conversation linked to a feature, the corresponding feature card in the panel is visually highlighted (cyan border and background tint). The panel also auto-scrolls to bring the active feature card into view when the active conversation changes.

**Why this priority**: Quality-of-life enhancement that helps developers maintain context awareness — knowing which feature they're currently working on. Not required for core functionality.

**Independent Test**: Can be tested by switching between conversations with different feature associations and verifying the correct card highlights and scrolls into view.

**Acceptance Scenarios**:

1. **Given** the active conversation is linked to feature `007-ai-provider-chat`, **When** the features list is visible, **Then** the card for `007-ai-provider-chat` has a distinct highlighted style (cyan border) while other cards have the default style.
2. **Given** the user switches to a conversation linked to a different feature, **When** the features list is visible, **Then** the panel auto-scrolls to bring the newly active feature card into view.
3. **Given** the active conversation has no associated feature, **When** the features list is visible, **Then** no card is highlighted.

---

### Edge Cases

- What happens when no feature specifications exist? The panel shows an error notification and displays an empty list.
- What happens when a feature contains no documentation files? The file list view shows a "No spec files found" message.
- What happens when a spec file fails to load? The content viewer shows an error message with a retry button.
- What happens when a feature specification has no heading? The feature name falls back to a human-readable version derived from the feature identifier.
- What happens when the user clicks an action button while the feature's conversation is already streaming? The existing streaming conversation is not reused, and a new conversation is created instead.
- What happens when invalid file access is attempted? The system rejects the request with an error.
- What happens when a non-documentation file is requested? The system rejects the request with an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST discover all feature specifications and display them as cards sorted by feature identifier in natural alphanumeric order (numeric prefix first, e.g., `001-` before `002-` before `015-`).
- **FR-002**: Each feature card MUST display the feature name (extracted from specification heading, or derived from feature identifier as fallback) and feature ID.
- **FR-003**: Each feature card MUST show color-coded status badges indicating which specification artifacts exist: "spec" (green), "plan" (cyan), "tasks" (yellow).
- **FR-004**: Clicking a feature card MUST open a full-screen specification modal for that feature.
- **FR-005**: The modal MUST list all documentation files within a feature (including subdirectories) as file tabs with human-readable labels.
- **FR-006**: The modal MUST render markdown files with styled formatting (headings, code blocks, tables, lists, blockquotes, checkboxes) and sanitize content to prevent security vulnerabilities.
- **FR-007**: Feature cards MUST provide action buttons (Clarify, Plan, Tasks, Run, Analyze) that trigger workflow steps.
- **FR-008**: Action buttons MUST only appear when a spec file exists for the feature. The "Tasks" button MUST only appear when a plan exists. The "Run" and "Analyze" buttons MUST only appear when tasks exist.
- **FR-009**: The "Plan" action MUST trigger a cascade pipeline that sequentially executes Plan → Tasks → Implement. The "Tasks" action MUST cascade Tasks → Implement.
- **FR-009A**: The "Analyze" action MUST execute a quality check prerequisite step before the analyze command for that feature. If the prerequisite step cannot be resolved or fails, the analyze step MUST NOT be executed.
- **FR-010**: Action buttons MUST reuse an existing conversation for the same feature (if one exists and is not currently streaming), or create a new conversation if none exists.
- **FR-011**: Action buttons MUST support Shift+click to force creation of a new conversation, bypassing reuse logic.
- **FR-012**: Feature cards MUST provide a chat icon button that creates a new conversation linked to the feature with the title `spec: {featureId}`.
- **FR-013**: The panel MUST visually highlight the feature card corresponding to the active conversation's linked feature (cyan border and background tint).
- **FR-014**: The panel MUST auto-scroll to bring the active feature card into view when the active conversation changes.
- **FR-015**: The panel MUST provide a refresh button to re-fetch the feature list from the server.
- **FR-016**: The system MUST protect against unauthorized file access by validating all file access requests.
- **FR-017**: The system MUST only serve documentation files with appropriate extensions.
- **FR-018**: The modal content viewer MUST show loading, error, and retry states appropriately.
- **FR-018A**: The modal MUST support in-app editing with Edit, Save, and Cancel controls, and persist changes.
- **FR-019**: The features list view MUST provide a search input at the top that filters features by name or ID. The search experience MUST be responsive and avoid excessive re-renders.
- **FR-020**: Selecting a feature in the panel MUST synchronize the same `featureId` into Git Graph selection state, and clearing feature selection MUST clear Git Graph feature selection.

### Key Entities

- **Feature**: A discovered spec directory containing markdown documentation files with status tracking for spec, plan, and tasks artifacts.
- **SpecFile**: A markdown file within a feature directory that can be viewed and edited.
- **Cascade Pipeline**: An ordered sequence of speckit operations that execute automatically in series to progress a feature from specification through implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can browse the full feature inventory and identify each feature's spec-readiness status within 2 seconds of panel load.
- **SC-002**: Users can navigate from the feature list to viewing a specific spec file's content in 2 clicks or fewer.
- **SC-003**: Users can trigger a full cascade pipeline (Plan → Tasks → Implement) for a feature with a single click.
- **SC-004**: The panel correctly displays status badges for 100% of features, with no false positives or negatives for spec/plan/tasks existence.
- **SC-005**: Markdown content renders correctly for all standard markdown elements (headings, code, tables, lists, blockquotes, checkboxes) with consistent styling.
- **SC-006**: Active feature highlighting updates within 1 second of switching conversations.
- **SC-007**: All file access requests are validated against path traversal, with 0 unauthorized file access possible.
