# Feature Specification: Embedded Skills System

**Feature Branch**: `016-embedded-skills`
**Created**: 2026-02-08
**Status**: Draft
**Input**: User description: "Spec Cat integrates specific agents as built-in skills executable from the features panel. First skill: better-spec (spec document quality validator based on What/How/Track separation principle)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Built-in Skill from Features Panel (Priority: P1)

A developer working on a feature specification wants to validate spec document quality directly from the features panel without leaving the Spec Cat UI. They select a feature card, choose the "Better Spec" skill, and the system runs the document quality analysis agent within a chat conversation, streaming results back in real-time.

**Why this priority**: This is the core interaction — launching an embedded skill from the features panel — without which the entire feature has no purpose. It delivers immediate value by giving users one-click access to spec quality validation.

**Independent Test**: Can be fully tested by clicking a skill action on any feature card that has spec documents, observing the skill execute in a chat conversation, and receiving a structured validation report.

**Acceptance Scenarios**:

1. **Given** a feature with spec.md exists in the features panel, **When** the user clicks the "Better Spec" skill action on the feature card, **Then** a chat conversation is created (or reused) for that feature and the better-spec skill agent prompt is sent to Claude with the feature's spec documents as context.
2. **Given** the better-spec skill is running for a feature, **When** Claude processes the skill prompt, **Then** the validation results stream back in real-time within the chat panel, displaying the structured report with pass/fail items per document.
3. **Given** a feature has only spec.md (no plan.md or tasks.md), **When** the user runs the better-spec skill, **Then** the skill analyzes only the available documents and reports which documents are missing rather than failing.

---

### User Story 2 - Discover Available Skills for a Feature (Priority: P1)

A developer browses the features panel and wants to know which skills are available for a given feature. The feature card displays available skill actions alongside existing cascade actions (Clarify, Plan, Tasks, Run, Analyze), making skills discoverable without extra navigation.

**Why this priority**: Skill discoverability is essential — users cannot use skills they cannot find. This must work alongside the existing cascade actions to maintain a cohesive experience.

**Independent Test**: Can be tested by viewing any feature card in the features panel and verifying that embedded skill actions appear alongside existing actions.

**Acceptance Scenarios**:

1. **Given** the system has registered embedded skills, **When** the features panel loads, **Then** each feature card displays available skill actions in addition to existing cascade actions (Clarify, Plan, Tasks, Run, Analyze, Chat).
2. **Given** a skill requires certain documents to be present (e.g., better-spec needs at least spec.md), **When** the feature lacks those documents, **Then** the skill action is visually disabled with a tooltip explaining the prerequisite.
3. **Given** a skill is currently running for a feature conversation, **When** the user views the feature card, **Then** all skill action buttons are disabled for that feature and show a running state indicator (pulse).

---

### User Story 3 - Register and Manage Embedded Skills (Priority: P2)

A project administrator defines which skills are available in Spec Cat by placing agent definition files in a designated skills directory. Each skill has a name, description, icon, required document prerequisites, and an agent prompt template. Skills are automatically discovered by the system on startup.

**Why this priority**: Registration is the foundation for extensibility. Without a clear mechanism to add skills, the system would be hardcoded and not scalable, but it builds on top of the core execution flow (P1).

**Independent Test**: Can be tested by adding a new skill definition file to the skills directory and verifying it appears in the features panel without code changes.

**Acceptance Scenarios**:

1. **Given** a skill definition file exists in the designated skills directory, **When** the system starts or the skills directory is scanned, **Then** the skill is registered and available in the features panel.
2. **Given** a skill definition includes a name, description, icon identifier, document prerequisites, and prompt template, **When** the skill is loaded, **Then** all metadata is correctly parsed and used in the UI.
3. **Given** a skill definition file is malformed or missing required fields, **When** the system attempts to load it, **Then** the skill is skipped with a warning logged, and other valid skills remain available.

---

### User Story 4 - Skill Execution with Conversation Integration (Priority: P2)

When a skill is executed, it integrates with the existing conversation system — reusing conversations linked to the feature, supporting the permission system, and operating within an isolated worktree. The skill execution follows the same patterns as cascade commands, ensuring consistency across all AI-driven workflows.

**Why this priority**: Consistent integration with existing infrastructure (conversations, permissions, worktrees) is critical for reliability and user trust, but depends on the core skill execution being established first.

**Independent Test**: Can be tested by running a skill, verifying the conversation is linked to the feature, and confirming the existing conversation is reused on subsequent skill runs.

**Acceptance Scenarios**:

1. **Given** a conversation already exists for a feature, **When** the user runs a skill for that feature, **Then** the existing conversation is reused (same behavior as cascade actions).
2. **Given** the user holds Shift and clicks a skill action, **When** the skill is triggered, **Then** a new conversation is created instead of reusing the existing one.
3. **Given** the chat permission mode is set to "plan" or "ask", **When** a skill executes actions requiring approval, **Then** the permission prompt is shown to the user before proceeding.

---

### Edge Cases

- What happens when the user runs two different skills simultaneously for the same feature? The system should queue them or use separate conversations to avoid message interleaving.
- What happens when a skill's agent prompt references documents that are deleted during execution? The skill should handle file-not-found gracefully and report the issue in the conversation.
- What happens when the skills directory does not exist? The system still loads built-in skills (including `better-spec`) without errors.
- What happens when the user navigates away from the feature while a skill is running? The skill continues executing in the background, and the user can return to see results in the conversation.
- What happens when a project skill definition has the same identifier as a built-in skill? The project skill overrides the built-in definition for that ID.
- What happens when two project skill files share the same identifier? The first loaded project skill is kept and duplicates are skipped with warnings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a skill registry that automatically discovers and loads project skill definitions from `skills/` and always includes built-in skills.
- **FR-002**: Each skill definition MUST include: unique identifier, display name, description, icon identifier, document prerequisites (list of required file patterns), and an agent prompt template.
- **FR-003**: The features panel MUST display available skill actions on each feature card alongside existing cascade actions (Clarify, Plan, Tasks, Run, Analyze, Chat).
- **FR-004**: Skill actions MUST be visually disabled when the feature lacks the documents specified in the skill's prerequisites, with a tooltip indicating what is missing.
- **FR-005**: When a user triggers a skill, the system MUST create or reuse a conversation linked to the target feature, following existing cascade conversation-reuse logic.
- **FR-006**: Skill execution MUST send the skill's agent prompt template to Claude, injected with feature context variables (`{{featureId}}`, `{{specsDir}}`, `{{availableDocuments}}`).
- **FR-006a**: `{{specsDir}}` MUST be rendered as an absolute filesystem path.
- **FR-006b**: `{{availableDocuments}}` MUST be rendered as a comma-separated filename list.
- **FR-006c**: `availableDocuments` MUST include only primary feature markdown documents and exclude nested support folders (for example `checklists/` and `contracts/`).
- **FR-007**: Skill execution results MUST stream back in real-time within the chat panel, following the same streaming behavior as existing cascade commands.
- **FR-008**: The system MUST ship with the "better-spec" skill as the first built-in skill, which validates spec/plan/tasks documents against the What/How/Track separation principle.
- **FR-009**: The "better-spec" skill MUST analyze available documents (spec.md, plan.md, tasks.md) and produce a structured validation report covering: document role compliance, content violations, cross-document consistency, and actionable remediation suggestions.
- **FR-010**: Skill actions MUST show a visual running/active state indicator while the skill is executing.
- **FR-010a**: When the feature's linked conversation is streaming, all skill buttons for that feature MUST be disabled to prevent concurrent skill triggers.
- **FR-011**: Shift+click on a skill action MUST force creation of a new conversation instead of reusing an existing one (consistent with existing cascade behavior).
- **FR-012**: Skill execution MUST integrate with the existing permission system, respecting the user's selected permission mode (plan/ask/auto/bypass).
- **FR-013**: The skill definition format MUST be a markdown file with YAML frontmatter for metadata and markdown body for the agent prompt template.
- **FR-014**: When a skill definition file is malformed or missing required fields, the system MUST skip it with a warning logged to the console and continue loading other valid skills.
- **FR-015**: The system MUST provide a server API endpoint to list all registered skills with their metadata.
- **FR-016**: Skill actions MUST be visually distinguishable from cascade actions in the UI through a grouping separator or distinct visual treatment.
- **FR-017**: Project-level skill files MUST take precedence over built-in skills when IDs collide.

### Key Entities

- **Skill**: A reusable agent definition consisting of metadata (id, name, description, icon, prerequisites) and a prompt template. Represents a specific AI-driven capability that can be executed against any qualifying feature.
- **Skill Definition File**: A markdown file with YAML frontmatter stored in the skills directory. The source of truth for skill registration. Follows the same format convention as Claude Code agent files.
- **Skill Registry**: The runtime collection of all discovered and validated skills, serving both the server API and the features panel UI.
- **Skill Execution**: A single invocation of a skill against a specific feature, resulting in a conversation message exchange with Claude.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can trigger an embedded skill from the features panel in under 3 seconds (from click to first streaming response visible).
- **SC-002**: Adding a new skill requires only creating a single markdown definition file — no code changes needed.
- **SC-003**: The "better-spec" skill correctly identifies document role violations (implementation details in spec.md, duplicated requirements in plan.md, etc.) when tested against known non-compliant spec sets.
- **SC-004**: All existing cascade actions continue to work identically after embedded skills are added — zero regression in features panel functionality.
- **SC-005**: Users can discover and understand available skills within 10 seconds of viewing a feature card.

## Assumptions

- The skills directory will be located within the project structure, following the same filesystem-based discovery pattern used for specs.
- Skill prompt templates are compatible with the existing AI execution runtime used by the chat system.
- The existing cascade action infrastructure (conversation reuse, streaming, permission system, worktree isolation) is stable and can be extended for skill execution without structural modification.
- The "better-spec" agent prompt from the referenced file is the canonical first skill and its prompt content will be adapted into the skill definition format.
- Skill definitions use English for metadata fields (id, name) while prompt content can be in any language.
- The number of embedded skills will be small (under 20), so filesystem scanning on startup is sufficient — no database indexing is needed.
