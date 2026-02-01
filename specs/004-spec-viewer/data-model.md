# Data Model: Spec Viewer

## Entities

### Feature

Represents a project feature identified by a directory under `specs/`.

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Directory name (e.g., "004-spec-viewer") |
| name | `string` | Display name extracted from spec.md title or derived from directory name |
| files | `SpecFile[]` | List of available spec files in this feature directory |
| hasSpec | `boolean` | Whether spec.md exists |
| hasPlan | `boolean` | Whether plan.md exists |
| hasTasks | `boolean` | Whether tasks.md exists |

### SpecFile

A markdown file within a feature directory.

| Field | Type | Description |
|-------|------|-------------|
| filename | `string` | File path relative to feature dir (e.g., "spec.md", "checklists/requirements.md") |
| label | `string` | Display label (e.g., "Spec", "Plan", "Tasks", "Data Model") |

### FeaturesListResponse

API response for `GET /api/specs/features`.

| Field | Type | Description |
|-------|------|-------------|
| features | `Feature[]` | All features sorted by ID |

### SpecFileContentResponse

API response for `GET /api/specs/:featureId/:filename`.

| Field | Type | Description |
|-------|------|-------------|
| content | `string` | Raw markdown content of the file |
| filename | `string` | The requested filename |
| featureId | `string` | The requested feature ID |

## Relationships

```
Feature 1──* SpecFile
  └── id matches directory under specs/
      └── files discovered by scanning directory contents
```

## File Label Mapping

| Filename | Label |
|----------|-------|
| spec.md | Spec |
| plan.md | Plan |
| tasks.md | Tasks |
| data-model.md | Data Model |
| research.md | Research |
| quickstart.md | Quickstart |
| checklists/*.md | Checklist: {name} |
| contracts/*.md | Contract: {name} |
| *.md (other) | {filename without extension} |

## State (Client-side, local refs)

| State | Type | Description |
|-------|------|-------------|
| currentView | `'features' \| 'files' \| 'content'` | Current panel view |
| selectedFeatureId | `string \| null` | Currently selected feature for file list |
| selectedFileName | `string \| null` | Currently selected file for content view |
| features | `Feature[]` | Cached feature list from API |
| fileContent | `string` | Current file's raw markdown content |
| loading | `boolean` | Loading state for API calls |
