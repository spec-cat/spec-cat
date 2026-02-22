# Data Model: Command Palette Spec Search

**Date**: 2026-02-22  
**Source**: `/home/khan/src/brick2/specs/031-spec-search-modal/spec.md`, existing `types/specSearch.ts`, feature-panel selection flow

## Entities

### CommandPaletteState

Runtime UI state for modal visibility, query lifecycle, results, and feedback.

| Field | Type | Description |
|------|------|-------------|
| isOpen | `boolean` | Modal visibility state |
| query | `string` | Current user-entered search text |
| debounceMs | `400` | Fixed debounce duration for live search |
| isSearching | `boolean` | Active request state |
| results | `SearchResultView[]` | Renderable result list |
| highlightedIndex | `number` | Keyboard-highlighted result index (`-1` if none) |
| errorMessage | `string \| null` | Inline error text |
| feedbackState | `'idle' \| 'empty-query' \| 'no-results' \| 'error' \| 'results'` | Display state machine |

**Validation Rules**:
- `query.trim()` empty -> no request; set `feedbackState='empty-query'`.
- `highlightedIndex` must stay within `results` bounds.
- Search triggers only after 400ms typing inactivity.

### SearchRequestModel

Modal request contract projection for `/api/specs/search`.

| Field | Type | Description |
|------|------|-------------|
| q | `string` | Required query text |
| mode | `'keyword'` | Default mode for palette |
| limit | `number` | Result cap (default 20) |

**Validation Rules**:
- `q` must be non-empty after trim.
- `limit` must be positive and bounded to UI capacity.
- No `featureId` is sent by default to preserve global scope.

### SearchResultView

UI projection of backend search results used for rendering and selection.

| Field | Type | Description |
|------|------|-------------|
| featureId | `string` | Target feature ID for selection |
| sourcePath | `string` | Origin document/file path |
| headingHierarchy | `string[]` | Structural context for disambiguation |
| snippet | `string` | Display excerpt |
| matchType | `'keyword' \| 'semantic' \| 'hybrid'` | Backend match mode |
| score | `number` | Ranking signal |

**Validation Rules**:
- `featureId` must be present for selection actions.
- Unresolvable `featureId` triggers inline unavailable error and keeps modal open.

### FeaturePanelSelection

Existing panel selection state updated when a result is chosen.

| Field | Type | Description |
|------|------|-------------|
| selectedFeatureId | `string \| null` | Active feature in panel |
| currentView | `'features' \| 'files' \| 'content'` | Existing panel state machine |
| selectedFileName | `string \| null` | Reset when selecting a new feature |

**Validation Rules**:
- Result selection updates `selectedFeatureId` and drives existing selection behavior.
- Escape/close without selection preserves prior `selectedFeatureId`.

## State Transitions

### Modal State

1. `closed -> open`: `Ctrl+K`/`Cmd+K` pressed from any focus target.
2. `open -> searching`: non-empty query settles for 400ms.
3. `searching -> results`: response contains matches.
4. `searching -> no-results`: response is empty.
5. `searching -> error`: request fails.
6. `open -> closed`: escape/close action.

### Selection State

1. User highlights/clicks a result.
2. Enter/click confirms selection.
3. If feature exists: apply existing panel selection path and close modal.
4. If feature unavailable: remain open with inline unavailable error.

## Relationships

- `CommandPaletteState (1)` triggers `SearchRequestModel (0..n)`.
- `SearchRequestModel (1)` returns `SearchResultView (0..n)`.
- `SearchResultView (n)` maps to `FeaturePanelSelection (1)` on successful selection.
