# API Contract: Features List

**Endpoint**: `GET /api/specs/features`
**File**: `server/api/specs/features.get.ts`

## Request

No parameters required.

## Response

### 200 OK

```typescript
{
  features: Array<{
    id: string         // Feature directory name, e.g. "015-features-panel"
    name: string       // Display name, e.g. "Features Panel"
    files: Array<{
      filename: string // Relative path, e.g. "spec.md", "checklists/requirements.md"
      label: string    // Human-readable, e.g. "Spec", "Checklist: requirements"
    }>
    hasSpec: boolean    // spec.md exists in directory
    hasPlan: boolean    // plan.md exists in directory
    hasTasks: boolean   // tasks.md exists in directory
  }>
}
```

**Ordering**: Features are sorted by directory name using natural alphanumeric sort (numeric prefix first).

### 500 Internal Server Error

```json
{
  "statusCode": 500,
  "statusMessage": "Failed to read specs directory"
}
```

Returned when the `specs/` directory cannot be read (does not exist or permission error).

## Behavior

1. Reads all entries from `specs/` directory
2. For each entry that is a directory:
   a. Recursively scans for `.md` files
   b. Determines `hasSpec`, `hasPlan`, `hasTasks` from file list
   c. Extracts feature name from `spec.md` heading or falls back to title-cased directory name
3. Returns sorted array of Feature objects

## Examples

### Typical Response

```json
{
  "features": [
    {
      "id": "001-app-layout",
      "name": "App Layout",
      "files": [
        { "filename": "spec.md", "label": "Spec" },
        { "filename": "plan.md", "label": "Plan" },
        { "filename": "tasks.md", "label": "Tasks" }
      ],
      "hasSpec": true,
      "hasPlan": true,
      "hasTasks": true
    },
    {
      "id": "015-features-panel",
      "name": "Features Panel",
      "files": [
        { "filename": "spec.md", "label": "Spec" },
        { "filename": "plan.md", "label": "Plan" },
        { "filename": "research.md", "label": "Research" }
      ],
      "hasSpec": true,
      "hasPlan": true,
      "hasTasks": false
    }
  ]
}
```

### Empty specs directory

```json
{
  "features": []
}
```
