# Feature Specification: Spec Viewer

**Feature Branch**: `004-spec-viewer`
**Created**: 2026-02-08
**Status**: Draft
**Execution Model**: Parent requirement source for Features v2 family
**Input**: User description: "Feature card click opens full-screen modal with markdown-rendered spec files viewer and editing capability"

## Structure Notice

This spec has been rebaselined into a consolidated Features family with child specs:

- `specs/028-features-panel-core/`
- `specs/029-features-panel-actions/`
- `specs/030-features-panel-active-linking/`

Use the child specs for active planning and execution.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Feature Specs (Priority: P1)

A developer working in Spec Cat wants to quickly review the specification files for a feature. They see a list of features in Column 2 (Features panel). They click on a feature card and a **full-screen modal** opens showing the available spec files as tabs. The first file (spec.md) is selected by default and its markdown-rendered content fills the modal. The developer can switch between files using tabs without closing the modal. Pressing ESC or clicking the backdrop closes the modal and returns to the feature list.

**Why this priority**: This is the core purpose of the spec viewer — reading spec content without leaving the app. Without this, the feature has no value.

**Independent Test**: Can be fully tested by clicking a feature card, verifying the full-screen modal opens with file tabs, and that markdown content renders correctly.

**Acceptance Scenarios**:

1. **Given** the app is loaded with features in `specs/` directory, **When** the user views Column 2, **Then** a list of all features is displayed with their names and IDs.
2. **Given** the feature list is visible, **When** the user clicks a feature card, **Then** a full-screen modal opens showing the feature's spec files as tabs, with the first file selected.
3. **Given** the modal is open, **When** the user clicks a different file tab, **Then** the modal content updates to show the newly selected file's rendered markdown.
4. **Given** the modal is open, **When** the user presses ESC or clicks the backdrop, **Then** the modal closes and the user returns to the feature list.
5. **Given** a feature has no spec files, **When** the user clicks the feature card, **Then** the modal opens with an empty state message.

---

### User Story 2 - Cascade Pipeline Commands (Priority: P2)

A developer wants to run speckit pipeline commands (Clarify, Plan, Tasks, Implement) on a feature. On each feature card, cascade action buttons are available. Clicking a button creates or reuses a conversation linked to the feature and sends the appropriate speckit command, with support for chained execution (Plan triggers Tasks then Implement).

**Why this priority**: Pipeline commands drive the spec-driven development workflow. They existed in the previous panel and must be preserved.

**Independent Test**: Can be tested by clicking a cascade button on a feature and verifying the correct speckit command is sent in a linked conversation.

**Acceptance Scenarios**:

1. **Given** a feature has a spec file, **When** the user sees the feature card, **Then** cascade buttons (Clarify, Plan, Tasks, Run) are displayed based on available files.
2. **Given** a feature has a spec file, **When** the user clicks "Plan", **Then** a conversation linked to the feature is created/reused and the `/speckit.plan` command is sent.
3. **Given** the user clicks "Plan", **When** the command completes, **Then** the cascade continues with Tasks and then Implement automatically.
4. **Given** the user holds Shift and clicks a cascade button, **When** the action fires, **Then** a new conversation is always created instead of reusing an existing one.

---

### User Story 3 - Open Spec Chat (Priority: P3)

A developer wants to have a conversation about a specific feature's spec. They click the chat icon on a feature card to create a new conversation linked to that feature. This links the conversation to the feature context for spec editing workflows.

**Why this priority**: Supports the conversational spec editing workflow but is secondary to viewing and pipeline commands.

**Independent Test**: Can be tested by clicking the chat icon on a feature and verifying a new linked conversation is created and selected.

**Acceptance Scenarios**:

1. **Given** a feature has a spec file, **When** the user clicks the chat icon on the feature card, **Then** a new conversation is created with the feature ID linked.
2. **Given** the new conversation is created, **When** the user views the conversations panel, **Then** the conversation appears with the title "spec: {feature-id}".

---

### User Story 4 - Active Feature Highlighting (Priority: P3)

When a conversation linked to a feature is active, the corresponding feature card in the list is visually highlighted, helping the user understand which feature they're working on.

**Why this priority**: Visual context aid that improves navigation but doesn't block any workflow.

**Independent Test**: Can be tested by selecting a conversation linked to a feature and verifying the feature card shows highlight styling.

**Acceptance Scenarios**:

1. **Given** the user selects a conversation linked to a feature, **When** the feature list is visible, **Then** the corresponding feature card is highlighted with a distinct border/background.
2. **Given** a highlighted feature card is off-screen, **When** the conversation becomes active, **Then** the feature list scrolls to bring the card into view.

---

### User Story 5 - Edit Spec Files (Priority: P1)

A developer wants to edit a spec file directly in the app. While viewing a spec file in the full-screen modal, they click the "Edit" button to switch from rendered markdown view to a raw markdown editor (textarea). They make changes and click "Save" to persist via PUT endpoint. They can also click "Cancel" to discard changes and return to the rendered view.

**Why this priority**: Editing specs in-app is essential for the spec-driven workflow. Without this, developers must switch to an external editor.

**Independent Test**: Open a spec file in the modal, click Edit, modify content, click Save, verify changes are persisted. Re-open the file and confirm changes are visible.

**Acceptance Scenarios**:

1. **Given** a spec file is being viewed in the modal, **When** the user clicks the "Edit" button, **Then** the rendered markdown is replaced by a textarea containing the raw markdown source.
2. **Given** the user is in edit mode, **When** they modify the content and click "Save", **Then** the content is sent via PUT to the server, saved to disk, and the view switches back to rendered markdown with the updated content.
3. **Given** the user is in edit mode, **When** they click "Cancel", **Then** the changes are discarded and the view returns to the previously rendered markdown.
4. **Given** the user is in edit mode, **When** saving fails (server error), **Then** an error toast is shown and the user remains in edit mode with their changes preserved.

---

### Edge Cases

- What happens when a feature directory exists but contains no spec files? The feature card should still appear but with no file badges, and clicking it should show an empty file list with a message indicating no spec files found.
- What happens when a spec file is very large (e.g., >500 lines)? The viewer should render it fully with scroll, without truncation.
- What happens when a spec file contains broken markdown or invalid content? The viewer should render it as best-effort markdown, falling back to plain text display for unparseable sections.
- What happens when spec files are added or modified while the viewer is open? The file list should update on refresh (manual refresh button); the currently viewed file should not auto-reload to avoid disrupting reading.
- What happens when a feature directory is deleted while viewing its spec? The viewer should show a "feature not found" state and return to the feature list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a list of all features found in the `specs/` directory in Column 2.
- **FR-002**: Each feature card MUST show the feature name, feature ID, and badges indicating which spec files exist (spec, plan, tasks, etc.).
- **FR-003**: Users MUST be able to click a feature card to open a full-screen modal displaying the feature's spec files as tabs.
- **FR-004**: Users MUST be able to click a file tab in the modal to view its contents rendered as formatted markdown.
- **FR-005**: The markdown viewer MUST render standard markdown including headings, lists, tables, code blocks, bold/italic text, and links.
- **FR-006**: Users MUST be able to close the modal via ESC key, close button, or backdrop click to return to the feature list.
- **FR-007**: The panel MUST provide cascade pipeline buttons (Clarify, Plan, Tasks, Run) on feature cards based on available files.
- **FR-008**: Cascade buttons MUST create or reuse a conversation linked to the feature and send the appropriate speckit command.
- **FR-009**: The "Plan" cascade MUST chain execution through Tasks and then Implement automatically.
- **FR-010**: Shift+click on a cascade button MUST always create a new conversation instead of reusing an existing one.
- **FR-011**: Users MUST be able to open a new spec-linked conversation via a chat icon on each feature card that has a spec file.
- **FR-012**: The feature card for the currently active conversation's linked feature MUST be visually highlighted.
- **FR-013**: The panel MUST auto-scroll to bring the highlighted feature card into view when the active conversation changes.
- **FR-014**: The panel MUST include a refresh button to reload the feature list from the filesystem.
- **FR-015**: The panel MUST follow the retro-terminal visual theme consistent with other panels in the application.
- **FR-016**: Features with no spec files MUST still appear in the list but with no file badges.
- **FR-017**: The viewer MUST provide a server endpoint that returns the list of features and their available spec files.
- **FR-018**: The viewer MUST provide a server endpoint that returns the raw content of a specific spec file for a given feature.
- **FR-019**: Users MUST be able to switch from rendered markdown view to an edit mode (textarea with raw markdown) via an Edit button in the modal.
- **FR-020**: Users MUST be able to save edited spec content via a Save button, which persists changes to disk via a PUT server endpoint.
- **FR-021**: Users MUST be able to cancel editing to discard changes and return to the rendered markdown view.
- **FR-022**: The system MUST provide a PUT server endpoint to write spec file content to disk with path traversal protection.

### Key Entities

- **Feature**: A project feature identified by a directory under `specs/`, containing zero or more spec files. Has an ID (directory name), a display name (extracted from spec or directory name), and a set of available files.
- **Spec File**: A markdown file within a feature directory (e.g., spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md). Has a filename, a display label, and raw markdown content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate from feature list to rendered spec content in 1 click (click feature card opens modal with first file selected).
- **SC-002**: Markdown content renders visually with proper formatting (headings, lists, tables, code blocks) within 1 second of file selection.
- **SC-003**: All existing cascade pipeline functionality (Clarify, Plan, Tasks, Run) continues to work identically to the previous implementation.
- **SC-004**: The feature list loads and displays all features from `specs/` directory within 2 seconds of page load.
- **SC-005**: Users can close the modal and return to the feature list in a single action (ESC, close button, or backdrop click).
- **SC-006**: Users can edit and save a spec file without leaving the modal, and changes are immediately visible upon returning to the rendered view.

## Assumptions

- The `specs/` directory structure follows the convention where each subdirectory represents a feature (e.g., `specs/001-app-layout/`).
- Feature display names are derived from the directory name by stripping the numeric prefix and converting hyphens to spaces (e.g., "001-app-layout" → "app layout"), or from the spec.md title if available.
- The application already has markdown rendering dependencies available (marked + dompurify) from the chat module.
- The panel replaces the previous kanban board functionality entirely — no kanban modal, no drag-and-drop task management.
- AutoMode toggle and status components from the previous panel will be preserved in their current positions.
