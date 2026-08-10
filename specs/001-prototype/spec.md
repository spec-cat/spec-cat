# Feature Specification: CLI Conversation Prototype

**Feature Branch**: `001-prototype`  
**Created**: 2026-07-10  
**Status**: Draft  
**Input**: User description: "Clean up the current code and specify the prototype using `/speckit.specify`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Provider Conversation (Priority: P1)

A developer can create a new conversation, choose either Claude or Codex before starting it, and immediately interact with the selected CLI in the browser terminal.

**Why this priority**: Provider selection and terminal access are the core value of the prototype.

**Independent Test**: Start one Claude conversation and one Codex conversation from the UI, then confirm each opens as a separate terminal-backed session with the selected provider shown in session details.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the developer selects a provider and starts a new session, **Then** a new conversation is created for that provider.
2. **Given** a provider conversation is active, **When** the developer types into the terminal, **Then** input is delivered to the attached CLI process.
3. **Given** a conversation exists, **When** the developer selects it from the conversation list, **Then** the browser reconnects to that conversation.

---

### User Story 2 - Preserve Terminal Usability Across Refreshes (Priority: P1)

A developer can refresh the browser without losing the terminal layout, current screen, or ability to continue the session.

**Why this priority**: Browser refresh is common during local development and must not corrupt the terminal view.

**Independent Test**: Open a conversation, resize the browser, refresh the page, and verify the terminal fills the available panel and shows the current session screen without duplicated control sequences.

**Acceptance Scenarios**:

1. **Given** a conversation is active, **When** the browser refreshes, **Then** the terminal reconnects to the most recent selected session.
2. **Given** the browser viewport changes, **When** the terminal panel is resized, **Then** the terminal dimensions update to fill the available panel.
3. **Given** a shell search prompt or CLI prompt is visible, **When** the page refreshes, **Then** the screen is restored once without repeated historical control sequences.

---

### User Story 3 - Isolate Conversation Work (Priority: P1)

A developer can start each new conversation in an isolated workspace so that CLI changes do not collide with the main working directory or other conversations.

**Why this priority**: AI CLI sessions can edit files, so isolation is required before the prototype is safe for real work.

**Independent Test**: Create a conversation, inspect its details, and verify it has a dedicated working directory and branch derived from the current project.

**Acceptance Scenarios**:

1. **Given** a git project is configured as the target project, **When** a new conversation starts, **Then** it receives a dedicated worktree and branch.
2. **Given** the developer configured a target project directory, **When** a new conversation starts, **Then** the conversation is created from that project instead of the application server directory.
3. **Given** multiple conversations are created, **When** their details are inspected, **Then** each conversation has a distinct worktree path and branch.

---

### User Story 4 - Fully Delete a Conversation (Priority: P2)

A developer can permanently remove a conversation and its attached runtime resources from the UI.

**Why this priority**: The prototype creates local sessions, logs, branches, and worktrees; users need a complete cleanup path.

**Independent Test**: Delete a conversation from the list and verify it disappears, its terminal closes, and its managed worktree and branch are removed.

**Acceptance Scenarios**:

1. **Given** a conversation exists, **When** the developer confirms deletion, **Then** the conversation metadata and log are removed.
2. **Given** a deleted conversation has an active terminal session, **When** deletion completes, **Then** the attached runtime session is terminated.
3. **Given** a deleted conversation has a managed worktree, **When** deletion completes, **Then** the managed worktree and branch are removed.

---

### User Story 5 - Run the Built Server Reliably (Priority: P2)

A developer can build the prototype and run the production server without missing native terminal dependencies.

**Why this priority**: The prototype must work outside the development server to be usable as a packaged local tool.

**Independent Test**: Build the application, run the generated server output, and open the web UI successfully.

**Acceptance Scenarios**:

1. **Given** dependencies are installed, **When** the developer runs the build, **Then** the production output includes the native terminal module required at runtime.
2. **Given** the production server starts, **When** the developer opens the UI, **Then** the application loads and can list sessions.

### Edge Cases

- The selected provider binary is missing or not executable.
- The configured target project directory is not a git repository.
- A previous session exists in metadata but its tmux session has already exited.
- A managed worktree was removed manually before conversation deletion.
- The browser refreshes while a CLI is in an interactive prompt.
- A legacy conversation exists without provider, worktree, or current metadata fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a developer to choose the provider for each new conversation from the supported provider list.
- **FR-002**: The system MUST create each new conversation with a unique, human-readable conversation identifier.
- **FR-003**: The system MUST attach browser terminal input and output to the selected conversation's runtime session.
- **FR-004**: The system MUST restore the current terminal screen after browser refresh without replaying accumulated terminal history as live input/output.
- **FR-005**: The terminal view MUST resize to fill its panel after initial load, browser refresh, font readiness, and container size changes.
- **FR-006**: The system MUST persist enough conversation metadata to list, reconnect, inspect, and delete conversations across server restarts.
- **FR-007**: The system MUST display conversation provider, runtime state, current working directory, branch, base branch, log size, and update time.
- **FR-008**: The system MUST support a configurable target project directory for newly created conversations.
- **FR-009**: The system MUST create a dedicated worktree and branch for each new conversation when the target project is valid.
- **FR-010**: The system MUST reject or fail clearly when a new conversation cannot be isolated in a valid project worktree.
- **FR-011**: The system MUST delete conversation metadata and logs when a user confirms permanent deletion.
- **FR-012**: The system MUST terminate the attached runtime session when a conversation is permanently deleted.
- **FR-013**: The system MUST remove the managed worktree and branch associated with a permanently deleted conversation.
- **FR-014**: The system MUST protect deletion from removing paths outside the managed worktree area.
- **FR-015**: The production build MUST include native terminal runtime assets required by the packaged server.
- **FR-016**: All user-facing application text, project documentation, code comments, and specification files MUST be written in English.

### Key Entities

- **Conversation**: A persisted AI CLI session with identifier, provider, runtime name, working directory, timestamps, log size, and optional worktree metadata.
- **Provider**: A supported CLI backend that can be selected when a new conversation is created.
- **Runtime Session**: The attached terminal process responsible for keeping the provider CLI alive across browser connections.
- **Managed Worktree**: A dedicated workspace and branch created for a conversation and removed during permanent deletion.
- **Target Project Directory**: The git project used as the base for new managed worktrees.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can create and reconnect to Claude and Codex conversations from the UI without editing configuration files.
- **SC-002**: After a browser refresh, the terminal fills the available panel and restores the current session screen within 2 seconds on a typical local machine.
- **SC-003**: New conversations created from a valid target project always receive a distinct managed worktree and branch.
- **SC-004**: Permanent deletion removes the conversation from the UI and removes its managed runtime resources without manual cleanup.
- **SC-005**: The packaged server starts successfully after a clean build and can load the main UI plus the sessions endpoint.
- **SC-006**: A text search for Korean characters in source files, specs, and project guidance returns no matches.

## Assumptions

- Claude remains the default provider when no provider is explicitly selected.
- Existing legacy sessions remain readable even if they do not have newer metadata fields.
- Browser close or disconnect preserves the conversation; only explicit deletion performs permanent cleanup.
- The target project is expected to be a local git repository with an available base branch.
