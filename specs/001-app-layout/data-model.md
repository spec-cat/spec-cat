# Data Model: App Layout System

**Feature**: 001-app-layout
**Date**: 2026-02-08

## Entities

### PanelDefinition

Defines a column panel in the 4-column layout.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique panel identifier ('git-tree', 'features', 'conversations', 'chat') |
| label | string | Yes | Header display text ("Git Tree", "Features", "Conversations", "Chat") |
| flex | number | Yes | Flex proportion (3, 2, 2, 3 → maps to 30%, 20%, 20%, 30%) |

**Panel Definitions**:

```typescript
const panels: PanelDefinition[] = [
  { id: 'git-tree', label: 'Git Tree', flex: 3 },
  { id: 'features', label: 'Features', flex: 2 },
  { id: 'conversations', label: 'Conversations', flex: 2 },
  { id: 'chat', label: 'Chat', flex: 3 }
]
```

### ViewportBreakpoint

Defines screen width thresholds for layout adaptations.

| Breakpoint | Min Width | Max Width | Layout Behavior |
|------------|-----------|-----------|-----------------|
| mobile | 320px | 767px | Horizontal scroll or stacked panels |
| tablet | 768px | 1023px | Reduced columns or horizontal scroll |
| desktop | 1024px | ∞ | Full 4-column layout |

**Tailwind Mapping**:
- mobile: default (no prefix)
- tablet: `md:` prefix
- desktop: `lg:` prefix

### SettingsModalState

Tracks whether the settings modal is open.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| isOpen | boolean | false | Whether settings modal is visible |

## State Transitions

### Settings Modal

```
┌─────────────┐   gear click    ┌─────────────┐
│   Closed    │ ──────────────► │    Open     │
│             │ ◄────────────── │             │
└─────────────┘  ESC/backdrop   └─────────────┘
```

**Triggers**:
- Gear icon click → opens modal
- ESC key press → closes modal
- Backdrop click → closes modal

## TypeScript Definitions

```typescript
// types/layout.ts

export type ViewportSize = 'mobile' | 'tablet' | 'desktop'

export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  tablet: 1024
} as const

export interface PanelDefinition {
  id: string
  label: string
  flex: number
}

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  { id: 'git-tree', label: 'Git Tree', flex: 3 },
  { id: 'features', label: 'Features', flex: 2 },
  { id: 'conversations', label: 'Conversations', flex: 2 },
  { id: 'chat', label: 'Chat', flex: 3 }
] as const
```

## localStorage Schema

**Key**: `spec-cat:layout-preferences`

**Value** (JSON):
```json
{
  "version": 1
}
```

**Note**: The 4-column layout uses fixed proportions (no user-configurable widths in v1). localStorage is reserved for future layout customization. The existing sidebar-related preferences (`sidebarWidth`, `sidebarCollapsed`) are no longer used.

## API Dependencies

### GET /api/cwd

Returns the current working directory for the Git Tree panel.

**Response**:
```json
{
  "cwd": "/path/to/project"
}
```

Already implemented — used by `GitGraph.vue`.
