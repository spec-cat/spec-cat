# Data Model: Features Panel (015)

**Date**: 2026-02-08
**Source**: `types/spec-viewer.ts`, `types/chat.ts`, server API responses

## Entities

### Feature

Represents a spec directory discovered from `specs/`. Defined in `types/spec-viewer.ts`.

| Field    | Type        | Description                                              | Source                                              |
|----------|-------------|----------------------------------------------------------|-----------------------------------------------------|
| id       | `string`    | Directory name (e.g., `015-features-panel`)              | Filesystem: directory name under `specs/`           |
| name     | `string`    | Display name extracted from spec.md or derived from ID   | `spec.md` heading or title-cased directory name     |
| files    | `SpecFile[]`| All `.md` files found in the feature directory           | Recursive filesystem scan of feature directory      |
| hasSpec  | `boolean`   | Whether `spec.md` exists                                 | `files.some(f => f.filename === 'spec.md')`         |
| hasPlan  | `boolean`   | Whether `plan.md` exists                                 | `files.some(f => f.filename === 'plan.md')`         |
| hasTasks | `boolean`   | Whether `tasks.md` exists                                | `files.some(f => f.filename === 'tasks.md')`        |

**Validation Rules**:
- `id` must not contain `..` or path separators beyond the directory name
- `name` falls back to title-cased directory name if `spec.md` heading is missing
- `files` only includes `.md` extension files

**Sort Order**: Natural alphanumeric by `id` (numeric prefix first: `001-` < `002-` < `015-`)

### SpecFile

Represents a markdown file within a feature directory. Defined in `types/spec-viewer.ts`.

| Field    | Type     | Description                                          | Source                                |
|----------|----------|------------------------------------------------------|---------------------------------------|
| filename | `string` | Relative path from feature directory (e.g., `spec.md`, `checklists/requirements.md`) | Filesystem scan |
| label    | `string` | Human-readable display label                         | Mapping function (see below)          |

**Label Mapping** (server-side in `features.get.ts`):

| Filename Pattern               | Label                     |
|--------------------------------|---------------------------|
| `spec.md`                      | "Spec"                    |
| `plan.md`                      | "Plan"                    |
| `tasks.md`                     | "Tasks"                   |
| `data-model.md`                | "Data Model"              |
| `research.md`                  | "Research"                |
| `quickstart.md`                | "Quickstart"              |
| `checklists/{name}.md`         | "Checklist: {name}"       |
| `contracts/{name}.md`          | "Contract: {name}"        |
| Other                          | Filename without `.md`    |

### Conversation (Feature-Linked)

Extends the existing `Conversation` interface from `types/chat.ts`. The `featureId` field links a conversation to a feature for cascade operations and reuse.

| Field     | Type              | Description                                    |
|-----------|-------------------|------------------------------------------------|
| featureId | `string \| undefined` | Associated feature ID (for cascade reuse)  |

**State Transitions**:
- Created via action button → `featureId` set, title set to `{command}: {featureId}`
- Created via chat icon → `featureId` set, title set to `spec: {featureId}`
- Reused → same `featureId`, new messages appended

### CascadeState (Runtime Only)

Per-conversation cascade pipeline state, stored in `useChatStream` composable's `cascadeStates` Map. Not persisted.

| Field     | Type       | Description                                 |
|-----------|------------|---------------------------------------------|
| featureId | `string`   | Feature being processed                     |
| queue     | `string[]` | Remaining speckit commands to execute       |

**Valid Queue Values**: `['tasks', 'implement']`, `['implement']`, `[]`

## State Machine: Panel Navigation

```
┌──────────────┐  click card   ┌──────────────┐  click file   ┌──────────────┐
│   features   │ ────────────→ │    files      │ ────────────→ │   content    │
│    list      │               │    list       │               │   viewer     │
│              │ ←──────────── │              │ ←──────────── │              │
└──────────────┘    back       └──────────────┘    back       └──────────────┘
```

**State Variable**: `currentView: ref<'features' | 'files' | 'content'>`

**Context Variables**:
- `selectedFeatureId: ref<string | null>` — set when transitioning to 'files'
- `selectedFileName: ref<string | null>` — set when transitioning to 'content'

## Entity Relationships

```
Feature (1) ──── (*) SpecFile           (a feature contains many spec files)
Feature (1) ──── (*) Conversation       (a feature can have many conversations)
Conversation (1) ── (0..1) CascadeState (a conversation may have an active cascade)
```

## Response Types

### FeaturesListResponse

```typescript
interface FeaturesListResponse {
  features: Feature[]
}
```

### SpecFileContentResponse

```typescript
interface SpecFileContentResponse {
  content: string      // Raw markdown content
  filename: string     // Requested filename
  featureId: string    // Requested feature ID
}
```
