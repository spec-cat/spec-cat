# Implementation Plan: App Layout System

**Branch**: `001-app-layout` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-app-layout/spec.md`

## Summary

Restructure the Spec Cat application layout from a sidebar-based navigation system to a single-screen 4-column layout. The four columns — Git Tree (30%), Features (20%), Conversations (20%), Chat (30%) — are always visible with independent scrolling. Settings are accessed via a modal overlay. No route-based navigation is used.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+) for state, Tailwind CSS for styling, @heroicons/vue for icons
**Storage**: localStorage (`spec-cat:layout-preferences` key) for layout preferences (reserved for future use)
**Testing**: Manual testing for UI interactions; TypeScript type checking as first line of defense
**Target Platform**: Web browser (desktop, tablet, mobile), minimum 320px viewport
**Project Type**: Web application (Nuxt 3 fullstack)
**Performance Goals**: Smooth CSS transitions on layout interactions, independent panel scrolling
**Constraints**: No external drag/resize libraries; fixed column proportions; single-screen (no routing)
**Scale/Scope**: 4 panel components, 1 layout, 1 store (existing), 1 type file update, 1 settings modal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Nuxt 3 + Vue 3 + TypeScript 5.6+ | PASS | Framework matches constitution |
| Pinia for global state | PASS | `stores/layout.ts` exists, minimal updates needed |
| Tailwind CSS only (no custom CSS frameworks) | PASS | All styling via Tailwind utilities + existing retro theme |
| @heroicons/vue for icons | PASS | Cog6ToothIcon for settings gear |
| Retro-terminal theme | PASS | Uses `bg-retro-black`, `text-retro-text`, `border-retro-border`, etc. |
| Manual testing only | PASS | No automated tests |
| Simplicity over complexity | PASS | Fixed flex ratios, no resize handles, no drag libraries |
| No external dependencies beyond approved | PASS | Only Pinia, Tailwind, @heroicons/vue |

## Project Structure

### Documentation (this feature)

```text
specs/001-app-layout/
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Data model definitions
├── quickstart.md        # Implementation quickstart guide
└── tasks.md             # Task breakdown
```

### Source Code (repository root)

```text
# Layout system files
layouts/
└── default.vue                          # Main layout: 4-column flex container

components/layout/
├── AppHeader.vue                        # Header bar ("SPEC CAT / {project-name}" + settings gear)
└── AppMain.vue                          # (may be removed or repurposed)

components/features/
└── FeaturesPanel.vue                    # Features column: spec list, kanban, pipeline (NEW)

components/conversations/
└── ConversationsPanel.vue               # Conversations column: conversation list, search (NEW)

components/chat/
├── ChatPanel.vue                        # Chat column: messages, input, streaming (MODIFY)
└── ChatPanelToggle.vue                  # (REMOVE — chat is always visible)

components/git/
└── GitGraph.vue                         # Git tree column content (EXISTING, no changes)

components/settings/
└── SettingsModal.vue                    # Settings modal overlay (EXISTING, reuse)

stores/
└── layout.ts                            # Layout state (viewport detection) (EXISTING, simplify)

types/
└── layout.ts                            # ViewportSize, PanelDefinition (EXISTING, update)
```

**Structure Decision**: Nuxt 3 convention structure. Panel components are organized under their feature directories (`components/features/`, `components/conversations/`). The layout is defined in `layouts/default.vue` with 4 flex columns. Components removed: `AppSidebar.vue`, `SidebarResizer.vue`, `MobileNavToggle.vue`, `SidebarPipelines.vue`.

## FR Coverage Matrix

| FR | Description | Implementation Files |
|----|-------------|---------------------|
| FR-001 | Single-Screen 4-Column Layout | `layouts/default.vue` (flex container with 4 columns) |
| FR-001a | Git Tree panel (30% width, leftmost) | `layouts/default.vue` (flex: 3) |
| FR-001b | Features panel (20% width) | `layouts/default.vue` (flex: 2) |
| FR-001c | Conversations panel (20% width) | `layouts/default.vue` (flex: 2) |
| FR-001d | Chat panel (30% width, rightmost) | `layouts/default.vue` (flex: 3) |
| FR-002 | Git Tree Panel | `layouts/default.vue` (left column wrapping GitGraph) |
| FR-002a | Header with "Git Tree" label | `layouts/default.vue` (panel header element) |
| FR-002b | Embeds GitGraph component | `layouts/default.vue` imports `GitGraph.vue` |
| FR-002c | Working directory from /api/cwd | `components/git/GitGraph.vue` (existing, no changes) |
| FR-003 | Features Panel | `components/features/FeaturesPanel.vue` (NEW) |
| FR-003a | Header with "Features" label | `FeaturesPanel.vue` (header element) |
| FR-003b | Lists specs/features from specs/ | `FeaturesPanel.vue` (feature list from existing store/API) |
| FR-003c | Kanban-style task status per feature | `FeaturesPanel.vue` (status badges, existing kanban integration) |
| FR-003d | Click to view/manage feature details | `FeaturesPanel.vue` (click handler, kanban modal) |
| FR-004 | Conversations Panel | `components/conversations/ConversationsPanel.vue` (NEW) |
| FR-004a | Header with "Conversations" label | `ConversationsPanel.vue` (header element) |
| FR-004b | Lists conversations with search/filter | `ConversationsPanel.vue` (wraps existing ConversationList logic) |
| FR-004c | Supports rename and delete | `ConversationsPanel.vue` (existing conversation operations) |
| FR-004d | Click loads conversation in Chat panel | `ConversationsPanel.vue` (sets activeConversationId in chat store) |
| FR-005 | Chat Panel | `components/chat/ChatPanel.vue` (MODIFY) |
| FR-005a | Header with conversation title or "New Chat" | `ChatPanel.vue` (header shows active conversation title) |
| FR-005b | Chat message display with streaming | `ChatPanel.vue` (existing ChatMessages + streaming) |
| FR-005c | Input area for sending messages | `ChatPanel.vue` (existing ChatInput) |
| FR-005d | Permission mode indicator | `ChatPanel.vue` (existing permission mode display) |
| FR-005e | Always visible (not toggleable) | `layouts/default.vue` (chat column always rendered, no toggle) |
| FR-006 | Settings Modal | `components/settings/SettingsModal.vue` (EXISTING) |
| FR-006a | Gear icon opens modal | `layouts/default.vue` or `AppHeader.vue` (Cog6ToothIcon button) |
| FR-006b | ESC/backdrop closes modal | `SettingsModal.vue` (existing behavior) |
| FR-006c | AI provider/model selection UI | `SettingsModal.vue` (existing) |
| FR-007 | Header Display | `layouts/default.vue` or `components/layout/AppHeader.vue` |

## Post-Design Constitution Re-check

| Gate | Status | Notes |
|------|--------|-------|
| Nuxt 3 + Vue 3 + TypeScript 5.6+ | PASS | No changes to framework |
| Pinia for global state | PASS | Existing stores reused, layout store simplified |
| Tailwind CSS only | PASS | All new styling is Tailwind utilities |
| @heroicons/vue for icons | PASS | Cog6ToothIcon reused |
| Retro-terminal theme | PASS | Existing theme classes applied to new panels |
| Simplicity over complexity | PASS | Removed sidebar complexity (resize, collapse, mobile overlay) |
| No external dependencies | PASS | No new dependencies added |

## Complexity Tracking

No constitution violations. The refactor actually reduces complexity:
- Removes sidebar resize/collapse/mobile-overlay logic
- Removes SidebarResizer, MobileNavToggle, SidebarPipelines components
- Removes ChatPanelToggle (chat is always visible)
- Replaces navigation routing with single-screen column layout
