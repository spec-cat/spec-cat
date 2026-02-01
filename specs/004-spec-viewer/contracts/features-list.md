# API Contract: Features List

## GET /api/specs/features

Lists all features found in the `specs/` directory with their available spec files.

### Request

No parameters.

### Response 200

```json
{
  "features": [
    {
      "id": "001-app-layout",
      "name": "App Layout",
      "files": [
        { "filename": "spec.md", "label": "Spec" },
        { "filename": "plan.md", "label": "Plan" },
        { "filename": "tasks.md", "label": "Tasks" },
        { "filename": "data-model.md", "label": "Data Model" },
        { "filename": "quickstart.md", "label": "Quickstart" },
        { "filename": "checklists/requirements.md", "label": "Checklist: requirements" }
      ],
      "hasSpec": true,
      "hasPlan": true,
      "hasTasks": true
    },
    {
      "id": "004-spec-viewer",
      "name": "Spec Viewer",
      "files": [
        { "filename": "spec.md", "label": "Spec" }
      ],
      "hasSpec": true,
      "hasPlan": false,
      "hasTasks": false
    }
  ]
}
```

### Response 500

```json
{
  "error": "Failed to read specs directory"
}
```

### Implementation Notes

- Scan `specs/` directory for subdirectories matching pattern `NNN-feature-name`
- For each feature directory, scan for `.md` files (including subdirectories like `checklists/`, `contracts/`)
- Extract feature display name from spec.md `# Feature Specification: {name}` heading if available
- Fallback name: strip numeric prefix + hyphens → title case (e.g., "001-app-layout" → "App Layout")
- Sort features by ID (alphabetical, which is also numeric order)
