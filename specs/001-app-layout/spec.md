# Feature: App Layout System

## Overview
Spec Cat application's core layout system. A single-screen 4-column layout consisting of Git Tree, Features, Conversations, and Chat panels. Settings are accessed via modal.

## Status
**In Progress** - Layout restructure to 4-column

## Layout Structure

```
┌──────────────┬────────────┬──────────────┬──────────────────┐
│  Git Tree    │  Features  │ Conversations│      Chat        │
│   (30%)      │   (20%)    │    (20%)     │     (30%)        │
│              │            │              │                  │
│ - Git graph  │ - Spec list│ - Conv list  │ - Chat messages  │
│ - Branches   │ - Kanban   │ - Search     │ - Input          │
│ - Commits    │ - Pipeline │ - Rename/Del │ - Streaming      │
│              │            │              │                  │
└──────────────┴────────────┴──────────────┴──────────────────┘
```

## Functional Requirements

### FR-001: Single-Screen 4-Column Layout
A single-screen layout with no route-based navigation. All features are accessible from one screen with 4 fixed-proportion columns.
- **FR-001a**: Git Tree panel (30% width, leftmost)
- **FR-001b**: Features panel (20% width)
- **FR-001c**: Conversations panel (20% width)
- **FR-001d**: Chat panel (30% width, rightmost)
- **FR-001e**: Minimum viewport width 320px support

### FR-002: Git Tree Panel (30%)
Left-most panel displaying Git history at all times.
- **FR-002a**: Header with "Git Tree" label
- **FR-002b**: Embeds GitGraph component for git history visualization
- **FR-002c**: Working directory fetched from `/api/cwd`

### FR-003: Features Panel (20%)
Second column displaying feature/spec management.
- **FR-003a**: Header with "Features" label
- **FR-003b**: Lists available specs/features from `specs/` directory
- **FR-003c**: Shows kanban-style task status per feature
- **FR-003d**: Click to view/manage feature details

### FR-004: Conversations Panel (20%)
Third column showing conversation list for the chat.
- **FR-004a**: Header with "Conversations" label
- **FR-004b**: Lists all conversations with search/filter
- **FR-004c**: Supports rename and delete operations
- **FR-004d**: Click to load conversation in Chat panel

### FR-005: Chat Panel (30%)
Right-most panel for AI provider chat interaction.
- **FR-005a**: Header with conversation title or "New Chat"
- **FR-005b**: Chat message display with streaming support
- **FR-005c**: Input area for sending messages
- **FR-005d**: Permission mode indicator
- **FR-005e**: Always visible (not toggleable — replaces the old toggle behavior)

### FR-006: Settings Modal
Settings are provided as a modal overlay.
- **FR-006a**: Gear icon (Cog6ToothIcon) in header area opens modal
- **FR-006b**: ESC key or backdrop click closes modal
- **FR-006c**: Includes AI provider/model selection UI

### FR-007: Header Display
Application header with "SPEC CAT / {project-name}" title. The project name is the last segment of the current working directory path (fetched from `/api/cwd`). Settings button on the right side. The header spans across all 4 columns or is embedded per-panel as panel headers.

## Non-Functional Requirements

### NFR-001: Viewport Detection
Supports responsive behavior via viewport size change detection.

### NFR-002: Smooth Transitions
Smooth CSS transitions for panel interactions.

### NFR-003: Minimum Viewport
Supports minimum viewport width down to 320px.

### NFR-004: Independent Scrolling
Each of the 4 panels has its own independent scroll area.

## Technical Implementation

### Components
- `layouts/default.vue` - Overall layout container (4-column flex)
- `components/layout/AppHeader.vue` - Header bar (title + action slot)
- `components/layout/AppMain.vue` - Main content area (may be repurposed or removed)
- `components/settings/SettingsModal.vue` - Settings modal (AI provider/model selection)
- `components/chat/ChatPanel.vue` - Chat panel (rightmost column)
- `components/features/FeaturesPanel.vue` - Features/spec list panel (new)
- `components/conversations/ConversationsPanel.vue` - Conversations list panel (new or extracted)

### Store
- `stores/layout.ts` - Layout state management (currentViewport, panel widths)

### Types
- `types/layout.ts` - Viewport breakpoints, ViewportSize type

## Success Criteria
- [ ] 4-column layout rendered: Git Tree (30%) | Features (20%) | Conversations (20%) | Chat (30%)
- [ ] Each panel has independent scrolling
- [ ] Git Tree panel shows git graph
- [ ] Features panel lists specs
- [ ] Conversations panel lists conversations with search
- [ ] Chat panel shows active conversation with streaming
- [ ] Settings modal accessible via gear icon
- [ ] Single-screen layout (no route navigation)
