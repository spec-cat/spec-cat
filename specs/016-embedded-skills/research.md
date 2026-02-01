# Research: Embedded Skills System

**Feature**: 016-embedded-skills
**Date**: 2026-02-08

## R-001: Skills Directory Location and Discovery Pattern

**Question**: Where should skill definition files live, and how should they be discovered?

**Decision**: Skill definitions live in `skills/` directory at project root.

**Rationale**: The project already uses filesystem-based discovery for specs (`specs/` directory). The `yaml` package (v2.8.2) is already a dependency for parsing YAML. Using a top-level `skills/` directory mirrors the `specs/` pattern and keeps skill definitions version-controlled alongside the project.

**Alternatives considered**:
- `.spec-cat/skills/` — rejected because skills are project-level configuration, not tool-specific metadata. They should be visible and version-controlled.
- `lib/skills/` — rejected because `lib/` is reserved for speckit internal templates.
- Inside `specs/` — rejected because skills are cross-feature, not feature-specific.

## R-002: Skill Definition File Format

**Question**: What format should skill definition files use?

**Decision**: Markdown files with YAML frontmatter (`.md` extension). Frontmatter contains metadata; markdown body is the agent prompt template.

**Rationale**: FR-013 explicitly requires "a markdown file with YAML frontmatter for metadata and markdown body for the agent prompt template." This mirrors the Claude Code agent file convention already familiar to the codebase (`.claude/commands/*.md`). The `yaml` package is already available for parsing.

**Format specification**:
```markdown
---
id: better-spec
name: Better Spec
description: Validates spec documents against What/How/Track separation
icon: DocumentCheckIcon
prerequisites:
  - spec.md
---

# Agent prompt template content here...

The prompt body uses `{{featureId}}`, `{{specsDir}}`, and `{{availableDocuments}}` as template variables.
```

**Template variables**:
- `{{featureId}}` — the target feature identifier (e.g., "016-embedded-skills")
- `{{specsDir}}` — absolute path to the feature's spec directory
- `{{availableDocuments}}` — comma-separated list of available document filenames

**Alternatives considered**:
- Pure YAML — rejected because agent prompts are best authored as markdown, and FR-013 requires markdown+frontmatter.
- JSON — rejected because it's harder to author long prompt templates.
- TypeScript modules — rejected because FR requirements state no code changes for new skills (SC-002).

## R-003: Integration with Existing Cascade System

**Question**: How should skill execution integrate with the existing cascade/conversation infrastructure?

**Decision**: Reuse the existing `handleCascade` pattern in FeaturesPanel.vue. Skills use the same conversation creation/reuse logic, WebSocket streaming, permission system, and worktree isolation. The skill prompt is sent as a user message just like cascade `/speckit.*` commands.

**Rationale**: FR-005, FR-007, FR-011, FR-012 all require consistency with existing cascade behavior. The `handleCascade` function in `FeaturesPanel.vue` already handles:
- Conversation find-or-create via `findConversationByFeature(featureId)`
- Shift+click for forced new conversation
- Message streaming via `useChatStream`
- Worktree context propagation

The only difference: instead of sending `/speckit.{command} {featureId}`, skill execution sends the rendered prompt template directly as the user message.

**Key integration points**:
1. `chatStore.createConversation({ featureId })` — unchanged
2. `chatStore.findConversationByFeature(featureId)` — unchanged
3. `useChatStream.sendMessage()` — unchanged (prompt is just longer)
4. Permission mode — inherited from existing system
5. Worktree isolation — inherited from existing system

**Alternatives considered**:
- Custom skill execution endpoint — rejected because it would duplicate all the existing WebSocket/PTY infrastructure.
- Separate skill execution composable — rejected because the flow is identical to cascade; only the prompt content differs.

## R-004: Skill Action UI in Feature Cards

**Question**: How should skill actions be displayed alongside existing cascade actions?

**Decision**: Add a visual separator (thin border/divider) after the existing cascade action buttons, then render skill action buttons with a distinct color scheme (`retro-purple` or similar). Skill buttons follow the same icon-button pattern as cascade actions.

**Rationale**: FR-003 requires skills alongside cascade actions. FR-016 requires visual distinction via "grouping separator or distinct visual treatment." The existing FeatureCard.vue uses a consistent pattern of icon buttons with color-coded backgrounds. Adding a separator + different color maintains the pattern while making skills visually distinct.

**UI pattern**:
```
[Chat][Clarify][Plan][Tasks][Run][Analyze] | [BetterSpec][...]
                cascade actions                  skills
```

**Icon resolution**: Skills reference @heroicons/vue icon names in their definition. The FeatureCard.vue component maps icon identifiers to imported components.

**Alternatives considered**:
- Dropdown menu for skills — rejected because it adds a click to discover skills, violating SC-005 (discover within 10 seconds).
- Separate skills section below the card — rejected because it breaks the compact card layout.

## R-005: Skill Prerequisite Checking

**Question**: How should the system determine if a skill's prerequisites are met for a given feature?

**Decision**: The skill definition lists prerequisite file patterns (e.g., `spec.md`, `plan.md`). The features API already returns `hasSpec`, `hasPlan`, `hasTasks` booleans. Extend the Feature type to include the full file list, then check prerequisites client-side against feature files.

**Rationale**: The `features.get.ts` endpoint already scans and returns `SpecFile[]` per feature. Prerequisite checking is a simple array intersection — does the feature's files list include all patterns from the skill's prerequisites? This avoids extra server calls.

**Approach**:
- Feature already has `files: SpecFile[]` with filenames like `"spec.md"`, `"plan.md"`, `"tasks.md"`
- Skill prerequisite is a list like `["spec.md"]`
- Client checks: `skill.prerequisites.every(p => feature.files.some(f => f.filename === p))`
- If not met: button is disabled + tooltip shows missing files

**Alternatives considered**:
- Server-side prerequisite check per feature per skill — rejected as unnecessary; the data is already available client-side.

## R-006: Skill Registry Architecture

**Question**: Should the skill registry be client-side, server-side, or both?

**Decision**: Server-side registry with a GET API endpoint. Client fetches skills once on features panel mount, alongside features.

**Rationale**: FR-001 requires "automatic discovery from a skills directory" — this is a filesystem operation best done server-side. FR-015 requires a server API endpoint. The client caches the skill list in a reactive ref (not a Pinia store, since skills are static and don't change during a session).

**Flow**:
1. Server scans `skills/` directory on API request
2. Parses each `.md` file: extract YAML frontmatter + markdown body
3. Validates required fields (FR-014: skip malformed, log warning)
4. Returns skill metadata (without full prompt body — that's fetched on execution)
5. Client stores in `ref<Skill[]>` within FeaturesPanel.vue

**Why not a Pinia store**: Skills are static metadata that doesn't change during runtime. A simple `ref` in the panel component (or a composable) is sufficient. No cross-component state sharing is needed for the skill list.

**Alternatives considered**:
- Startup-time registration with in-memory cache — rejected as premature optimization; filesystem scan is fast for <20 files.
- Client-side discovery via file listing API — rejected because it would expose filesystem internals to the client.

## R-007: Better-Spec Skill Prompt Design

**Question**: What should the "better-spec" skill's agent prompt contain?

**Decision**: The prompt instructs Claude to read the feature's spec documents and analyze them against the What/How/Track separation principle. It produces a structured validation report.

**Rationale**: FR-008 and FR-009 define the better-spec skill's requirements. The prompt should:
1. Read available documents (spec.md, plan.md, tasks.md) from the feature's spec directory
2. Apply the What/How/Track framework:
   - **spec.md** (What): Requirements only, no implementation details
   - **plan.md** (How): Technical design, no requirements duplication
   - **tasks.md** (Track): Actionable tasks with FR traceability
3. Produce a structured report: pass/fail items per document, cross-document consistency, remediation suggestions

**Template variables used**: `{{featureId}}`, `{{specsDir}}`, `{{availableDocuments}}`

The prompt will be authored as the markdown body of `skills/better-spec.md`.

## R-008: Icon Mapping Strategy

**Question**: How to resolve icon identifiers from skill definitions to actual Vue components?

**Decision**: Use a static icon registry map in the FeatureCard component. Skill definitions reference Heroicon names (e.g., `DocumentCheckIcon`). The component maps these to imported components at build time.

**Rationale**: Dynamic imports of @heroicons/vue would require async component loading and complicate the template. Since the number of skills is small (<20) and icons come from the same library, a static map of commonly-used icons (10-15 entries) is sufficient. Unknown icons fall back to a default `PuzzlePieceIcon`.

**Alternatives considered**:
- Dynamic `import()` for icons — rejected as over-engineering for <20 skills.
- Icon URLs/SVG strings — rejected because it breaks the existing Heroicon pattern.
- No icons for skills — rejected because FR-002 requires icon identifiers.

## R-009: Concurrent Skill Execution

**Question**: What happens when multiple skills run simultaneously for the same feature?

**Decision**: Skills reuse the same conversation per feature (like cascade actions). Running a second skill while one is active will be blocked by the `isConversationStreaming` check — the user sees the existing conversation is busy. Shift+click creates a new conversation for parallel execution.

**Rationale**: The edge case spec says "queue them or use separate conversations." The existing infrastructure already handles this: `findConversationByFeature` returns the active conversation, and `isConversationStreaming` prevents sending new messages. Shift+click already creates new conversations. This is the simplest approach with zero new code for concurrency management.

**Alternatives considered**:
- Automatic queueing system — rejected as over-engineering; the existing UX pattern (busy indicator + shift-click escape hatch) is sufficient.
