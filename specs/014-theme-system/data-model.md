# Data Model: Theme System (014-theme-system)

**Date**: 2026-02-08
**Phase**: 1 — Design & Contracts

## Entities

### 1. Theme (Type)

**Location**: `stores/settings.ts` (inline type, no separate file needed)
**Change**: New type definition

```typescript
type Theme = 'dark' | 'light'
```

**Validation rules**:
- Only two valid values: `'dark'` and `'light'`
- Default: `'dark'`
- Invalid values fall back to `'dark'`

---

### 2. SettingsStoreState (Extended)

**Location**: `stores/settings.ts`
**Change**: Add `theme` field to existing entity

```typescript
interface SettingsStoreState {
  claudeModel: ClaudeModel
  autoModeConcurrency: number
  theme: Theme                  // NEW — active theme (FR-002, FR-003)
  _hydrated: boolean
}
```

**Default state**:
```typescript
{
  claudeModel: 'sonnet',
  autoModeConcurrency: 3,
  theme: 'dark',               // FR-002: dark is default
  _hydrated: false,
}
```

**New actions**:
```typescript
setTheme(theme: Theme): boolean {
  this.theme = theme
  return this._saveToStorage()
}
```

**Modified actions**:
- `hydrate()`: Add theme loading from localStorage
  ```typescript
  if (parsed.theme === 'dark' || parsed.theme === 'light') {
    this.theme = parsed.theme
  }
  ```
- `resetToDefaults()`: Reset theme to `'dark'`
- `_saveToStorage()`: Include `theme` in persisted data

**Persistence**: `spec-cat-settings` localStorage key (existing mechanism)
**Usage**: `claudeModel` is the global default model used by all server-side AI requests

**Backwards-compatible**: Existing `spec-cat-settings` data without `theme` field works — defaults to `'dark'`.

---

### 3. CSS Theme Variables (Design Tokens)

**Location**: `assets/css/tailwind.css`
**Change**: New CSS variable definitions

```css
:root {
  /* Light theme (default in CSS, overridden by .dark) */
  --color-retro-black: #ffffff;
  --color-retro-dark: #f6f8fa;
  --color-retro-panel: #eaeef2;
  --color-retro-border: #d0d7de;
  --color-retro-cyan: #0969da;
  --color-retro-green: #1a7f37;
  --color-retro-yellow: #9a6700;
  --color-retro-orange: #bc4c00;
  --color-retro-red: #cf222e;
  --color-retro-magenta: #8250df;
  --color-retro-pink: #bf3989;
  --color-retro-text: #1f2328;
  --color-retro-muted: #656d76;
  --color-retro-subtle: #6e7681;
}

.dark {
  --color-retro-black: #0d1117;
  --color-retro-dark: #161b22;
  --color-retro-panel: #21262d;
  --color-retro-border: #30363d;
  --color-retro-cyan: #58a6ff;
  --color-retro-green: #3fb950;
  --color-retro-yellow: #d29922;
  --color-retro-orange: #db6d28;
  --color-retro-red: #f85149;
  --color-retro-magenta: #bc8cff;
  --color-retro-pink: #f778ba;
  --color-retro-text: #e6edf3;
  --color-retro-muted: #8b949e;
  --color-retro-subtle: #6e7681;
}
```

**Mapping in Tailwind config**:
```typescript
// tailwind.config.ts
colors: {
  retro: {
    black: "var(--color-retro-black)",
    dark: "var(--color-retro-dark)",
    panel: "var(--color-retro-panel)",
    // ... all 13 tokens mapped to CSS variables
  }
}
```

---

### 4. Tailwind Config Color Tokens (Modified)

**Location**: `tailwind.config.ts`
**Change**: Replace hardcoded hex values with CSS variable references

**Before**:
```typescript
retro: {
  black: "#0d1117",
  dark: "#161b22",
  // ...
}
```

**After**:
```typescript
retro: {
  black: "var(--color-retro-black)",
  dark: "var(--color-retro-dark)",
  panel: "var(--color-retro-panel)",
  border: "var(--color-retro-border)",
  cyan: "var(--color-retro-cyan)",
  green: "var(--color-retro-green)",
  yellow: "var(--color-retro-yellow)",
  orange: "var(--color-retro-orange)",
  red: "var(--color-retro-red)",
  magenta: "var(--color-retro-magenta)",
  pink: "var(--color-retro-pink)",
  text: "var(--color-retro-text)",
  muted: "var(--color-retro-muted)",
  subtle: "var(--color-retro-subtle)",
}
```

**Impact**: All existing `bg-retro-*`, `text-retro-*`, `border-retro-*` classes automatically resolve to the correct theme color via CSS variable inheritance.

**Note on opacity modifiers**: Tailwind opacity modifiers like `bg-retro-cyan/20` require color values in a format that supports alpha channel. CSS variables with hex values don't directly support Tailwind's opacity syntax. To handle this, colors will be defined using the `rgb()` format in CSS variables:

```css
.dark {
  --color-retro-cyan: 88 166 255;  /* RGB components */
}
```

And in Tailwind config:
```typescript
retro: {
  cyan: "rgb(var(--color-retro-cyan) / <alpha-value>)",
}
```

This enables `bg-retro-cyan/20` to work correctly as `background-color: rgb(88 166 255 / 0.2)`.

---

## Relationships

```
┌─────────────────┐     reads on mount     ┌─────────────────┐
│  localStorage   │◄──────────────────────│  SettingsStore   │
│  (spec-cat-settings│  persists on change   │  (.theme field)  │
│   .theme)       │──────────────────────►│                  │
└─────────────────┘                        └────────┬────────┘
                                                    │
                                                    │ watched by
                                                    ▼
                                           ┌─────────────────┐
                                           │  useTheme()      │
                                           │  composable      │
                                           │                  │
                                           │  Applies .dark   │
                                           │  class to <html> │
                                           └────────┬────────┘
                                                    │
                                                    │ triggers
                                                    ▼
                                           ┌─────────────────┐
                                           │  CSS Variables   │
                                           │  :root vs .dark  │
                                           │                  │
                                           │  All components  │
                                           │  auto-update     │
                                           └─────────────────┘
```

## Key Design Decisions

1. **No separate type file**: `Theme` is a simple union type (`'dark' | 'light'`), defined inline in `stores/settings.ts`. No need for a dedicated `types/theme.ts` file.

2. **Settings store extension is minimal**: One new field (`theme`), one new action (`setTheme`). Follows the exact same pattern as `autoModeConcurrency`.

3. **CSS variables enable zero-component-change theming**: By making Tailwind tokens resolve to CSS variables, all 30+ components automatically respond to theme changes without any file modifications.

4. **RGB format for opacity support**: Using `rgb(var(--color) / <alpha>)` pattern ensures Tailwind's opacity modifiers (`/20`, `/30`, etc.) continue working with CSS variables.

5. **Dark class on `<html>`**: Following the Tailwind `darkMode: 'class'` convention. The `dark` class on `<html>` is the single source of truth for the current visual theme.
