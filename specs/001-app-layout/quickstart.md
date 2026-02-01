# Quickstart: App Layout System

**Feature**: 001-app-layout
**Date**: 2026-02-08

## Prerequisites

- Node.js 18+
- pnpm
- Existing Nuxt 3 project with Tailwind CSS configured

## Quick Implementation Checklist

### 1. Update Type Definitions

Update `types/layout.ts` to add `PanelDefinition` interface and panel constants. Remove old sidebar-related types (`LayoutConfiguration`, `NavigationItem`, `LayoutState`, `SIDEBAR_CONSTRAINTS`, `DEFAULT_LAYOUT_CONFIG`).

### 2. Simplify Layout Store

Update `stores/layout.ts` to remove sidebar state (`sidebarWidth`, `sidebarCollapsed`, `isMobileMenuOpen`). Keep only viewport detection (`currentViewport`, `updateViewport`).

### 3. Create FeaturesPanel Component

Create `components/features/FeaturesPanel.vue`:
- Header with "Features" label
- Feature list extracted from existing `pages/index.vue` logic
- Status badges and kanban integration
- Click to view feature details

### 4. Create ConversationsPanel Component

Create `components/conversations/ConversationsPanel.vue`:
- Header with "Conversations" label
- Extract conversation list logic from existing `ConversationList.vue`
- Search/filter input
- Rename/delete actions
- Click to load conversation in chat panel

### 5. Modify ChatPanel to Be Always Visible

Update `components/chat/ChatPanel.vue`:
- Remove toggle/open/close logic
- Remove slide-in transition
- Use `flex: 3` sizing instead of fixed pixel width
- Keep all existing functionality (messages, input, streaming, permissions)

### 6. Restructure Default Layout

Rewrite `layouts/default.vue` to be a 4-column flex container:

```vue
<template>
  <div class="flex h-screen bg-retro-black">
    <!-- Git Tree Panel (30%) -->
    <div class="flex flex-col" style="flex: 3">
      <div class="h-14 flex items-center px-4 border-b border-retro-border">
        <span class="text-retro-text font-bold">Git Tree</span>
      </div>
      <div class="flex-1 overflow-y-auto">
        <GitGraph />
      </div>
    </div>

    <!-- Features Panel (20%) -->
    <div class="flex flex-col border-l border-retro-border" style="flex: 2">
      <FeaturesPanel />
    </div>

    <!-- Conversations Panel (20%) -->
    <div class="flex flex-col border-l border-retro-border" style="flex: 2">
      <ConversationsPanel />
    </div>

    <!-- Chat Panel (30%) -->
    <div class="flex flex-col border-l border-retro-border" style="flex: 3">
      <ChatPanel />
    </div>

    <!-- Settings Modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>
```

### 7. Remove Unused Components

Remove or archive components no longer needed:
- `components/layout/AppSidebar.vue`
- `components/layout/SidebarResizer.vue`
- `components/layout/MobileNavToggle.vue`
- `components/layout/SidebarPipelines.vue`
- `components/chat/ChatPanelToggle.vue`
- `composables/useLayoutPreferences.ts` (if sidebar-specific)

### 8. Update Header

Update or inline `components/layout/AppHeader.vue`:
- "SPEC CAT v0.1.0" title
- Settings gear icon (Cog6ToothIcon) on the right
- Either as a spanning bar above all columns or embedded in a panel header

### 9. Simplify pages/index.vue

Since all content is now rendered in layout columns, `pages/index.vue` becomes minimal or empty. The layout drives all panel rendering.

## Verification Steps

1. **Layout renders**: Open app, see 4 columns: Git Tree | Features | Conversations | Chat
2. **Proportions correct**: Git Tree and Chat are wider (30%), Features and Conversations narrower (20%)
3. **Independent scrolling**: Each panel scrolls independently when content overflows
4. **Git Tree works**: Git graph visualization renders in leftmost column
5. **Features list**: Specs/features appear in second column
6. **Conversations list**: All conversations show with search in third column
7. **Chat active**: Chat panel displays messages and accepts input in rightmost column
8. **Settings modal**: Click gear icon, modal opens over layout; ESC/backdrop closes
9. **Single screen**: No route-based navigation; everything on one page

## Key Files Summary

| File | Purpose | FR Coverage |
|------|---------|-------------|
| types/layout.ts | Type definitions (PanelDefinition, ViewportSize) | - |
| stores/layout.ts | Viewport detection | NFR-001 |
| layouts/default.vue | 4-column flex layout container | FR-001, FR-007 |
| components/git/GitGraph.vue | Git tree visualization (existing) | FR-002 |
| components/features/FeaturesPanel.vue | Features/spec list panel (new) | FR-003 |
| components/conversations/ConversationsPanel.vue | Conversations list panel (new) | FR-004 |
| components/chat/ChatPanel.vue | Chat interface (modified) | FR-005 |
| components/settings/SettingsModal.vue | Settings modal (existing) | FR-006 |

## Common Issues

**Hydration mismatch with viewport detection**: Read viewport size in `onMounted`, not during SSR.

**Panel content overflow**: Ensure each panel has `overflow-y-auto` on its content area and `overflow-hidden` on the parent flex container to prevent layout blowout.

**GitGraph height**: GitGraph needs explicit height constraints within its flex column to prevent it from expanding beyond the viewport.

**Chat panel resize handle removal**: The existing ChatPanel has a drag-to-resize left edge — remove this since widths are now fixed flex proportions.
