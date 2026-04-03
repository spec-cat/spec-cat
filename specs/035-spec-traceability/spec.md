# Feature Specification: Spec Traceability

**Feature Branch**: `035-spec-traceability`
**Created**: 2026-03-21
**Status**: Implemented
**Dependencies**: 016-embedded-skills, 008-spec-search

## User Scenarios & Testing *(mandatory)*

### User Story 1 - FR Traceability Analysis (Priority: P1)

As a developer, I want to see which functional requirements are fully traced through spec → plan → tasks so that I can identify gaps before implementation.

**Acceptance Scenarios**:

1. **Given** a feature with spec.md, plan.md, and tasks.md, **When** I view the feature card, **Then** I see a coverage indicator showing FR traceability status.
2. **Given** I open the spec viewer modal, **When** I view the traceability panel, **Then** I see each FR with its plan/task coverage status and alert badges for gaps.
3. **Given** a feature is missing spec.md, **When** traceability is analyzed, **Then** a critical alert is raised.
4. **Given** tasks.md references an FR not in spec.md, **When** traceability is analyzed, **Then** a major alert identifies the orphan FR.

### User Story 2 - Automated Traceability Repair via Better-Spec (Priority: P1)

As a developer, I want the better-spec skill to automatically detect and fix traceability gaps so that I don't have to manually audit FR coverage.

**Acceptance Scenarios**:

1. **Given** I trigger the better-spec skill on a feature, **When** traceability issues exist, **Then** the detected issues are injected into the skill prompt as a `{{traceabilityIssues}}` context block.
2. **Given** the skill prompt includes traceability issues, **When** the AI processes it, **Then** it directly edits spec/plan/tasks to close gaps instead of just reporting.
3. **Given** the conversation has a worktree, **When** the skill prompt is rendered, **Then** spec files are read from the worktree path (not main workspace).

---

### Edge Cases

- Feature directory missing → API returns 400 with descriptive message
- spec.md empty → Alert `no-fr` (major) raised; analysis continues with zero FRs
- tasks.md has FRs not in spec.md → Alert `task-extra-{FR}` (major) raised
- Worktree path doesn't contain feature specs → Falls back to main project path

## Requirements *(mandatory)*

### Functional Requirements

#### Traceability Analysis API
- **FR-001**: System MUST provide `GET /api/specs/traceability/{featureId}` that analyzes FR traceability across spec.md, plan.md, and tasks.md
- **FR-002**: System MUST extract FR identifiers from spec.md using pattern `/\bFR-\d{3}[a-z]?\b/gi`
- **FR-003**: System MUST check each FR's presence in plan.md (literal FR token match) and determine coverage status
- **FR-004**: System MUST check each FR's mapping to checkbox task lines in tasks.md (`- [ ]` or `- [x]` lines containing FR tokens) and track completed/total counts
- **FR-005**: System MUST classify each FR as `covered` (in both plan and tasks), `partial` (in one), or `missing` (in neither)
- **FR-006**: System MUST generate typed alerts with severity levels:
  - `critical`: missing spec.md, FR with no task mapping
  - `major`: FR not in plan, no FRs found in spec, orphan FR in tasks not defined in spec
- **FR-007**: System MUST return `TraceabilityResponse` containing: `featureId`, `summary` (counts), `requirements[]` (per-FR detail with line locations), `alerts[]` (classified gaps)

#### Traceability Types
- **FR-008**: System MUST define `TraceabilityAlert` with fields: `id`, `severity`, `message`, `requirementId?`, `sourceFile?`, `sourceLine?`, `expectedLink?`, `whyFailed?`
- **FR-009**: System MUST define `TraceabilityRequirement` with fields: `id`, `inPlan`, `inTasks`, `taskTotal`, `taskCompleted`, `status`, `locations` (specLine, planLine, taskLines)
- **FR-010**: System MUST define `TraceabilitySummary` with fields: `frTotal`, `frWithPlan`, `frWithTasks`, `frFullyCovered`, `taskTotal`, `taskCompleted`

#### Better-Spec Skill Integration
- **FR-011**: System MUST provide a built-in `better-spec` skill that enforces What/How/Track separation and repairs FR traceability with direct edits
- **FR-012**: When `better-spec` skill prompt is rendered, System MUST run `buildTraceabilityResponse()` for the target feature and inject results as `{{detectedTraceabilityIssues}}` template variable
- **FR-013**: The `better-spec` prompt MUST instruct the AI to satisfy the checker compatibility contract: FR IDs must match `FR-XXX`/`FR-XXXa`, plan coverage requires literal tokens, task coverage requires checkbox lines with FR tokens
- **FR-014**: System MUST NOT ask for permission to proceed with obvious fixes; the skill prompt instructs autonomous remediation

#### Worktree-Scoped Skill Prompts
- **FR-015**: When a conversation has a `worktreePath` (via request body `cwd`), the skill prompt endpoint MUST read spec files from the worktree path instead of the main workspace
- **FR-016**: If the worktree path does not contain the feature's specs directory, System MUST fall back to the main project path

#### Skill Registry
- **FR-017**: System MUST support skill definitions from both project-level `skills/*.md` files (YAML frontmatter + prompt body) and built-in skills
- **FR-018**: Project-level skills with matching IDs MUST override built-in skills
- **FR-019**: System MUST provide `GET /api/skills` to list available skills and `POST /api/skills/{skillId}/prompt` to render skill prompts with feature context

#### UI Integration
- **FR-020**: `FeatureCard` component MUST display a traceability coverage indicator
- **FR-021**: `SpecViewerModal` MUST include a traceability panel showing per-FR coverage status and alert badges

### Key Entities

- **TraceabilityResponse**: Complete analysis result for a feature (summary, requirements, alerts)
- **TraceabilityRequirement**: Per-FR coverage status with line locations across spec/plan/tasks
- **TraceabilityAlert**: Classified gap with severity, source file, and explanation
- **SkillDefinition**: Registered skill with id, name, description, icon, prerequisites, promptTemplate

## Success Criteria *(mandatory)*

### Measurable Outcomes

- [x] `GET /api/specs/traceability/{featureId}` returns correct FR coverage analysis
- [x] Traceability alerts correctly classify critical/major gaps
- [x] Better-spec skill receives detected traceability issues in its prompt
- [x] Worktree-scoped skill prompts read from conversation worktree path
- [x] Feature card shows coverage indicator
- [x] Spec viewer modal shows traceability panel

## Assumptions

- Feature directories follow `specs/{featureId}/` convention with optional spec.md, plan.md, tasks.md
- FR identifiers follow `FR-NNN` or `FR-NNNa` format
- Task lines use standard markdown checkbox format (`- [ ]` / `- [x]`)

## Out of Scope

- Cross-feature traceability (FR references between different features)
- Automated code-level verification (checking if implementation matches FR)
- Real-time traceability monitoring (runs on-demand via API)
