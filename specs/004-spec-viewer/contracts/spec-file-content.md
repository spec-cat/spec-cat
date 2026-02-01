# API Contract: Spec File Content

## GET /api/specs/:featureId/:filename

Returns the raw markdown content of a specific spec file for a given feature.

### Request

**URL Parameters:**
- `featureId` (string, required) — Feature directory name (e.g., "004-spec-viewer")
- `filename` (string, required, catch-all) — File path relative to feature dir (e.g., "spec.md", "checklists/requirements.md")

### Response 200

```json
{
  "content": "# Feature Specification: Spec Viewer\n\n**Feature Branch**: ...",
  "filename": "spec.md",
  "featureId": "004-spec-viewer"
}
```

### Response 404

```json
{
  "error": "Spec file not found",
  "featureId": "004-spec-viewer",
  "filename": "spec.md"
}
```

### Response 400

```json
{
  "error": "Invalid path: must not contain path traversal"
}
```

### Response 500

```json
{
  "error": "Failed to read spec file"
}
```

### Implementation Notes

- Validate that `featureId` and `filename` do not contain `..` (path traversal protection)
- Construct path: `join(projectRoot, 'specs', featureId, filename)`
- Read file as UTF-8 string
- Return raw content (client handles markdown rendering)
- Only serve `.md` files — reject requests for other extensions
