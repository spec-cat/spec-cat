# API Contract: Spec File Content

**Endpoint**: `GET /api/specs/:featureId/:filename`
**File**: `server/api/specs/[featureId]/[...filename].get.ts`

## Request

### URL Parameters

| Parameter   | Type     | Required | Description                                     |
|-------------|----------|----------|-------------------------------------------------|
| featureId   | `string` | Yes      | Feature directory name (e.g., `015-features-panel`) |
| filename    | `string` | Yes      | Relative file path (e.g., `spec.md`, `checklists/requirements.md`) |

### Validation Rules

- `featureId` must not contain `..`
- `filename` must not contain `..`
- `filename` must end with `.md`

## Response

### 200 OK

```typescript
{
  content: string    // Raw markdown file content
  filename: string   // Echoed filename parameter
  featureId: string  // Echoed featureId parameter
}
```

### 400 Bad Request

Path traversal attempt or non-markdown file:

```json
{
  "statusCode": 400,
  "statusMessage": "Invalid path: must not contain path traversal"
}
```

Or:

```json
{
  "statusCode": 400,
  "statusMessage": "Only .md files are supported"
}
```

### 404 Not Found

File does not exist:

```json
{
  "statusCode": 404,
  "statusMessage": "Spec file not found",
  "data": {
    "featureId": "015-features-panel",
    "filename": "nonexistent.md"
  }
}
```

### 500 Internal Server Error

File read failure (permissions, I/O error):

```json
{
  "statusCode": 500,
  "statusMessage": "Failed to read spec file"
}
```

## Security

- **FR-016**: Path traversal protection — rejects `..` in both `featureId` and `filename`
- **FR-017**: File type restriction — only `.md` files served
- Files are constrained to `{projectDir}/specs/{featureId}/{filename}`

## Examples

### Successful read

```
GET /api/specs/015-features-panel/spec.md
```

```json
{
  "content": "# Feature Specification: Features Panel\n\n...",
  "filename": "spec.md",
  "featureId": "015-features-panel"
}
```

### Subdirectory file

```
GET /api/specs/015-features-panel/checklists/requirements.md
```

```json
{
  "content": "# Requirements Checklist\n\n...",
  "filename": "checklists/requirements.md",
  "featureId": "015-features-panel"
}
```

### Path traversal blocked

```
GET /api/specs/../etc/passwd/ignored.md
```

```json
{
  "statusCode": 400,
  "statusMessage": "Invalid path: must not contain path traversal"
}
```
