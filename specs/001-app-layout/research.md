# Research: App Layout System

**Feature**: 001-app-layout
**Date**: 2026-02-08

## Overview

This document captures research decisions for the App Layout System feature — a single-screen 4-column layout (Git Tree | Features | Conversations | Chat) with a settings modal overlay. All technical choices are pre-determined by the project constitution, so this research focuses on implementation patterns and best practices within those constraints.

## Research Topics

### 1. Nuxt 3 Layout Pattern

**Decision**: Use Nuxt 3's built-in `layouts/` directory with a `default.vue` layout.

**Rationale**:
- Native Nuxt 3 pattern requiring no additional dependencies
- Automatic layout wrapping via `<NuxtLayout>` in app.vue
- Constitution principle VI (Simplicity) - use framework defaults
- Already established in the codebase

**Alternatives Considered**:
- Custom layout component imported in each page - rejected (boilerplate, error-prone)
- App.vue as layout - rejected (less flexible, harder to swap layouts)

### 2. 4-Column Fixed-Proportion Layout

**Decision**: Use CSS Flexbox with fixed flex ratios (30% | 20% | 20% | 30%) in `layouts/default.vue`.

**Rationale**:
- Spec requires a single-screen layout with no route-based navigation
- 4 columns with fixed proportions: Git Tree (30%), Features (20%), Conversations (20%), Chat (30%)
- Flexbox is simpler than CSS Grid for this use case (no complex row/column spanning)
- Each column is a self-contained panel with independent scrolling
- Constitution principle VI (Simplicity) - flex ratios are the simplest approach

**Alternatives Considered**:
- CSS Grid with `grid-template-columns` - viable but more verbose for simple 4-column split
- Percentage widths with `width: 30%` - less flexible than flex, doesn't adapt as cleanly
- Resizable columns with drag handles - rejected (spec says fixed proportions, add later if needed)

### 3. Panel Architecture

**Decision**: Each column is a dedicated Vue component wrapping its child feature component.

**Rationale**:
- Clean separation: panel component handles layout (header, scroll container), child handles feature logic
- Git Tree panel wraps existing `GitGraph` component
- Features panel wraps feature list + kanban (new `FeaturesPanel.vue`)
- Conversations panel wraps existing `ConversationList` (new `ConversationsPanel.vue`)
- Chat panel uses existing `ChatPanel.vue` (made always-visible instead of toggleable)
- Each panel provides a consistent header pattern

**Alternatives Considered**:
- All panels inline in default.vue - rejected (too much code in one file)
- Generic `ColumnPanel` wrapper - rejected (over-abstraction for 4 panels with different behaviors)

### 4. No Route-Based Navigation

**Decision**: Eliminate page routing. All 4 panels render on a single page (`pages/index.vue` or directly in `layouts/default.vue`).

**Rationale**:
- Spec explicitly states "single-screen layout with no route-based navigation"
- All features are visible simultaneously in their respective columns
- No need for sidebar navigation items or route-based active states
- Settings accessed via modal overlay, not a separate route

**Alternatives Considered**:
- Keep `/settings` route with conditional rendering - rejected (adds routing complexity for modal content)
- Tab-based navigation within panels - rejected (spec doesn't call for it)

### 5. Settings Modal Pattern

**Decision**: Use a modal overlay triggered by a gear icon in the header area.

**Rationale**:
- Spec FR-006 requires settings as modal (ESC/backdrop to close)
- Existing `SettingsModal.vue` component can be reused
- Modal overlays the 4-column layout without disrupting it
- Gear icon (`Cog6ToothIcon`) placement in header area

**Alternatives Considered**:
- Settings as a separate route - rejected (breaks single-screen requirement)
- Settings as a slide-out panel - rejected (spec says modal)

### 6. Independent Panel Scrolling

**Decision**: Each panel uses `overflow-y-auto` with `h-full` to create independent scroll regions.

**Rationale**:
- NFR-004 requires each panel to scroll independently
- Standard CSS overflow pattern, no dependencies needed
- Each panel's header stays fixed while content scrolls beneath it
- Prevents one panel's content from pushing other panels

**Alternatives Considered**:
- Full panel-level custom virtualization - rejected (layout-level optimization not required; feature-level virtualization may still be applied where needed, e.g. chat message lists)
- Position sticky headers with body scroll - rejected (doesn't give independent column scrolling)

### 7. Chat Panel Always Visible

**Decision**: Remove toggle behavior. Chat panel is always visible as the rightmost column.

**Rationale**:
- Spec FR-005e explicitly states "Always visible (not toggleable)"
- Simplifies state management — no `isPanelOpen` toggle needed
- Chat panel is a first-class column, not an overlay or slide-in
- `ChatPanelToggle.vue` can be removed or repurposed

**Alternatives Considered**:
- Keep toggle but default to open - rejected (spec says not toggleable)
- Collapsible panel - rejected (spec says fixed proportions)

### 8. Responsive Behavior (Small Viewports)

**Decision**: Use viewport detection from existing `stores/layout.ts` to handle minimum 320px viewport. On mobile/tablet, consider horizontal scroll or stacked layout.

**Rationale**:
- FR-001e requires 320px minimum viewport support
- 4 columns don't fit in 320px — need a responsive strategy
- Desktop: full 4-column layout
- Mobile/tablet: horizontal scroll or collapse to 1-2 visible columns with swipe

**Alternatives Considered**:
- Hide columns on mobile - rejected (all panels should remain accessible)
- Accordion panels - rejected (doesn't match the 4-column mental model)

### 9. Header Strategy

**Decision**: Each panel has its own header row. Application title "SPEC CAT v0.1.0" and settings gear icon are placed in one panel's header (e.g., the leftmost Git Tree panel header or a spanning top bar).

**Rationale**:
- FR-007 says header with "SPEC CAT v0.1.0" title and settings button
- Per-panel headers are simpler than a spanning header that must align with column widths
- Settings gear can be in the Chat panel header (rightmost) or in a top-level bar
- Consistent panel header height across all 4 columns

**Alternatives Considered**:
- Single spanning header above all columns - viable, depends on design preference
- No panel headers, just content - rejected (spec requires headers with labels)

## Summary

All decisions align with constitution constraints. The key architectural change is moving from a sidebar-based navigation layout to a 4-column single-screen layout. No new external dependencies are needed. Existing components (GitGraph, ConversationList, ChatPanel) are reused within the new column structure. Two new panel wrapper components are needed (FeaturesPanel, ConversationsPanel).
