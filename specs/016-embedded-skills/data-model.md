# Data Model: Embedded Skills System

**Feature**: 016-embedded-skills
**Date**: 2026-02-08

## Entities

### SkillDefinition

Represents a parsed and validated skill loaded from a definition file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique skill identifier (e.g., `"better-spec"`). Used in URLs, events, and deduplication. |
| `name` | `string` | Yes | Human-readable display name (e.g., `"Better Spec"`). |
| `description` | `string` | Yes | Short description shown in tooltips and skill listings. |
| `icon` | `string` | Yes | @heroicons/vue icon component name (e.g., `"DocumentCheckIcon"`). |
| `prerequisites` | `string[]` | Yes | List of required document filenames (e.g., `["spec.md"]`). Empty array means no prerequisites. |
| `promptTemplate` | `string` | Yes | Markdown prompt template body with `{{variable}}` placeholders. |

**Validation rules**:
- `id`: non-empty string, unique across all loaded skills
- `name`: non-empty string
- `description`: non-empty string
- `icon`: non-empty string (falls back to default icon if component not found)
- `prerequisites`: array of strings (can be empty)
- `promptTemplate`: non-empty string

**Source**: Parsed from `skills/{id}.md` files with YAML frontmatter.

### SkillMetadata

The subset of SkillDefinition sent to the client via the API (excludes prompt template for security/size reasons — prompts can be large and should not be exposed to the browser).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Skill identifier |
| `name` | `string` | Display name |
| `description` | `string` | Short description |
| `icon` | `string` | Icon component name |
| `prerequisites` | `string[]` | Required document filenames |

### RenderedPrompt

The result of rendering a skill's prompt template with feature-specific context.

| Field | Type | Description |
|-------|------|-------------|
| `skillId` | `string` | Which skill was rendered |
| `featureId` | `string` | Target feature |
| `prompt` | `string` | The fully rendered prompt text |

**Template variables** (injected during rendering):
- `{{featureId}}` → feature identifier string
- `{{specsDir}}` → absolute path to `specs/{featureId}/`
- `{{availableDocuments}}` → comma-separated list of existing document filenames

## Relationships

```
SkillDefinition (1) ──parsed-from──> Skill Definition File (1)
    skills/{id}.md → SkillDefinition

SkillDefinition (1) ──produces──> SkillMetadata (1)
    Server strips promptTemplate for client API response

SkillDefinition (1) + Feature (1) ──renders──> RenderedPrompt (1)
    Template variables filled with feature context

RenderedPrompt (1) ──sent-as──> ChatMessage (1)
    Prompt sent as user message in conversation

Feature (1) ──checked-against──> SkillDefinition.prerequisites (*)
    Feature.files matched against skill prerequisites
```

## State Transitions

### Skill Loading State

```
[Filesystem Scan] → [Parse YAML frontmatter] → [Validate fields]
                                                     ↓
                                               [Valid?]
                                              /        \
                                         Yes /          \ No
                                            ↓            ↓
                                    [Register in         [Log warning,
                                     registry]            skip skill]
```

### Skill Execution State (per feature card button)

```
[idle] → (user clicks) → [executing] → (stream complete) → [idle]
                               ↓
                          (error/abort)
                               ↓
                            [idle]
```

**UI states for skill button**:
- **idle + prerequisites met**: Clickable, normal color
- **idle + prerequisites NOT met**: Disabled, muted color, tooltip with missing files
- **executing**: Shows spinner/pulse animation, non-clickable (conversation is streaming)

## Storage

### Server-side
- **Skill definitions**: Filesystem at `skills/*.md` (read-only, scanned on API request)
- **No persistent state**: Skills are stateless — no database, no cache file

### Client-side
- **Skill list**: `ref<SkillMetadata[]>` in FeaturesPanel.vue (fetched once on mount)
- **No localStorage**: Skill metadata is transient; refetched on page load

### Existing stores (unchanged)
- **Conversations**: `spec-cat-conversations` in localStorage (used by skill execution, but not modified by this feature)
- **Chat stream state**: In-memory via `useChatStream` composable (used by skill execution, not modified)

## Type Definitions (TypeScript)

```typescript
// types/skill.ts

/** Skill definition as loaded from filesystem */
export interface SkillDefinition {
  id: string
  name: string
  description: string
  icon: string
  prerequisites: string[]
  promptTemplate: string
}

/** Skill metadata sent to client (no prompt template) */
export interface SkillMetadata {
  id: string
  name: string
  description: string
  icon: string
  prerequisites: string[]
}

/** API response for listing skills */
export interface SkillsListResponse {
  skills: SkillMetadata[]
}

/** API response for rendering a skill prompt */
export interface SkillPromptResponse {
  prompt: string
  featureId: string
  skillId: string
}
```
