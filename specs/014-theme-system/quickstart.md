# Quickstart: Theme System (014-theme-system)

**Date**: 2026-02-08

## Overview

The theme system adds light/dark mode switching to the Spec Cat application. It uses CSS custom properties (CSS variables) to make all existing components automatically respond to theme changes. The dark theme preserves the current "retro terminal" aesthetic exactly. The light theme introduces a GitHub Primer-inspired palette. Theme preference persists in localStorage and loads flash-free.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Page Load (before first paint)                                       │
│                                                                      │
│  <head>                                                              │
│    <script> Read localStorage → apply .dark class to <html> </script>│
│  </head>                                                             │
│                                                                      │
│  Result: Correct theme painted on first frame (FR-004)               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ CSS Layer                                                            │
│                                                                      │
│  :root (light)              .dark (dark)                             │
│  ┌────────────────────┐     ┌────────────────────┐                  │
│  │--color-retro-black:│     │--color-retro-black:│                  │
│  │  255 255 255       │     │  13 17 23          │                  │
│  │--color-retro-text: │     │--color-retro-text: │                  │
│  │  31 35 40          │     │  230 237 243       │                  │
│  │... (13 tokens)     │     │... (13 tokens)     │                  │
│  └────────────────────┘     └────────────────────┘                  │
│                                                                      │
│  Tailwind tokens → var(--color-retro-*)                              │
│  bg-retro-black → background-color: rgb(var(--color-retro-black))    │
│  text-retro-text → color: rgb(var(--color-retro-text))               │
│                                                                      │
│  Result: All 30+ components auto-themed (FR-006)                     │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Client (Browser)                                                     │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Theme Toggle     │  │SettingsModal │  │ useTheme() composable  │ │
│  │ (header button)  │  │(theme radio) │  │                        │ │
│  │ SunIcon/MoonIcon │  │              │  │ - watch store.theme    │ │
│  └────────┬─────────┘  └──────┬───────┘  │ - apply .dark class   │ │
│           │                   │          │ - sync <html> element  │ │
│           │                   │          └────────────┬───────────┘ │
│           │                   │                       │             │
│  ┌────────▼───────────────────▼───────────────────────▼───────────┐ │
│  │                    Pinia: useSettingsStore                      │ │
│  │                                                                │ │
│  │  state: { theme: 'dark' | 'light', claudeModel, ... }         │ │
│  │  action: setTheme(theme) → persist to localStorage             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              │ persists                             │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  localStorage: spec-cat-settings                                  │ │
│  │  { claudeModel: "sonnet", autoModeConcurrency: 3, theme: "dark"}│
│  │  (claudeModel is global default for all AI requests)             │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Flows

### 1. Toggle Theme (Dark → Light)

```
User clicks theme toggle (SunIcon) in header
  │
  ├─ settingsStore.setTheme('light')
  │   ├─ this.theme = 'light'
  │   └─ _saveToStorage() → localStorage.setItem('spec-cat-settings', {..., theme: 'light'})
  │
  ├─ useTheme() composable watches store.theme
  │   └─ document.documentElement.classList.remove('dark')
  │
  ├─ CSS variables recalculate (single frame)
  │   ├─ :root variables activate (light palette)
  │   └─ All bg-retro-*, text-retro-*, border-retro-* classes update
  │
  └─ Toggle icon switches to MoonIcon

User sees:
  - Entire UI transitions to light theme instantly
  - All panels, text, borders, buttons update consistently
  - Status colors (green/red/yellow) remain semantically correct
  - Toggle shows MoonIcon (click to go dark)
```

### 2. Page Load (Returning User with Light Theme)

```
Browser navigates to Spec Cat
  │
  ├─ <head> script executes synchronously (before paint)
  │   ├─ Read localStorage('spec-cat-settings')
  │   ├─ Parse JSON → theme: 'light'
  │   └─ No .dark class on <html> (light is default CSS)
  │
  ├─ First paint occurs → light theme visible (no flash!)
  │
  ├─ Vue app mounts
  │   ├─ settingsStore.hydrate() → loads theme: 'light'
  │   └─ useTheme() confirms <html> class matches store
  │
  └─ App fully interactive with correct theme
```

### 3. Page Load (New User / Default Dark Theme)

```
Browser navigates to Spec Cat
  │
  ├─ <head> script executes
  │   ├─ Read localStorage('spec-cat-settings') → null
  │   └─ Add 'dark' class to <html> (default)
  │
  ├─ First paint → dark theme visible
  │
  ├─ Vue app mounts
  │   ├─ settingsStore.hydrate() → no saved theme → default 'dark'
  │   └─ useTheme() confirms .dark class present
  │
  └─ App fully interactive with dark theme
```

## Files to Create/Modify

### New Files
| File | Purpose | FR |
|------|---------|-----|
| `composables/useTheme.ts` | Watch store theme, sync `<html>` class | FR-001, FR-006 |

### Modified Files
| File | Change | FR |
|------|--------|-----|
| `tailwind.config.ts` | Replace hex colors with `rgb(var(--color-*) / <alpha-value>)` | FR-005, FR-006 |
| `assets/css/tailwind.css` | Add CSS variables for `:root` (light) and `.dark` (dark), update box shadows | FR-005, FR-007 |
| `stores/settings.ts` | Add `theme: Theme` field, `setTheme()` action | FR-002, FR-003 |
| `layouts/default.vue` | Add theme toggle button in header, call `useTheme()` | FR-001, FR-010 |
| `components/settings/SettingsModal.vue` | Add theme selection radio buttons | FR-001 |
| `app.vue` | Add inline head script for flash-free load | FR-004 |

## Development Order

1. **CSS variables + Tailwind config** (tailwind.config.ts, tailwind.css) — foundation
2. **Settings store extension** (stores/settings.ts) — state management
3. **Theme composable** (composables/useTheme.ts) — class application logic
4. **Flash-free head script** (app.vue) — page load handling
5. **Theme toggle UI** (layouts/default.vue, SettingsModal.vue) — user-facing controls

## Testing Strategy

Manual testing per CLAUDE.md:
1. Toggle dark → light → verify all panels, text, borders update
2. Toggle light → dark → verify exact original appearance restored
3. Close browser → reopen → verify theme persists without flash
4. Open SettingsModal → verify theme radio buttons reflect current theme
5. Check status colors (success/error/warning) in both themes
6. Check scrollbars in both themes
7. Check modals/toasts in both themes
8. Verify git branch colors remain visible in both themes
9. Clear localStorage → reload → verify dark theme default
