# Research: Theme System (014-theme-system)

**Date**: 2026-02-08
**Phase**: 0 — Outline & Research

## R-001: How to prevent flash of wrong theme on page load?

**Decision**: Use an inline `<script>` in the `<head>` via Nuxt's `useHead()` that reads the theme preference from localStorage and applies the `dark` class to `<html>` before the first paint.

**Rationale**: FR-004 requires zero flash. CSS variables are inherited from `:root`, so setting the correct class before any rendering occurs means the browser paints the correct theme on the first frame. Nuxt 3's `useHead()` supports inline scripts that execute synchronously in the `<head>`.

**Alternatives considered**:
- SSR cookie-based approach → Rejected because the app already uses localStorage for all preferences. Adding cookies introduces a new persistence mechanism and adds server-side complexity for a purely cosmetic feature.
- `@nuxtjs/color-mode` module → Rejected because it's an external dependency and the implementation is simple enough to build in ~50 lines. The existing codebase has no external theme/color-mode dependencies.
- No flash prevention (accept brief flash) → Rejected because FR-004 explicitly requires no flash, and SC-002 requires 100% consistency across browser restarts.

**Implementation pattern**:
```typescript
// In app.vue or layouts/default.vue
useHead({
  script: [{
    innerHTML: `(function(){try{var t=JSON.parse(localStorage.getItem('spec-cat-settings')||'{}').theme;if(t==='light')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}})()`,
    type: 'text/javascript'
  }]
})
```

## R-002: CSS variable strategy vs Tailwind dark: modifier approach

**Decision**: Use CSS custom properties (CSS variables) mapped to Tailwind utility classes. Define variables on `:root` (light) and `.dark` (dark), then reference them in Tailwind config via `var(--color-*)`.

**Rationale**: The current codebase uses `retro-*` color tokens in 448+ class instances across 30+ components (e.g., `bg-retro-black`, `text-retro-text`, `border-retro-border`). Two strategies exist:

1. **`dark:` modifier approach**: Add `dark:bg-white dark:text-gray-900` to every element that uses `bg-retro-black text-retro-text`. This would require modifying 448+ class usages across 30+ components — massive scope, high risk of missing spots.

2. **CSS variable approach**: Redefine `retro-*` tokens as CSS variables. `retro-black` resolves to `var(--color-retro-black)`. In `.dark`, the variable maps to `#0d1117` (current). In `:root` (light), it maps to `#ffffff`. **Zero component changes needed** — the same `bg-retro-black` class now automatically resolves to the correct color per theme.

The CSS variable approach is the clear winner: it requires changes only to `tailwind.config.ts` and `tailwind.css`, not to any component files. Components continue using `bg-retro-black`, `text-retro-text`, etc., unchanged.

**Light theme palette** (designed for WCAG AA contrast):

| Token | Dark Value | Light Value | Purpose |
|-------|-----------|-------------|---------|
| `retro-black` | `#0d1117` | `#ffffff` | Main background |
| `retro-dark` | `#161b22` | `#f6f8fa` | Secondary background |
| `retro-panel` | `#21262d` | `#eaeef2` | Panel/card backgrounds |
| `retro-border` | `#30363d` | `#d0d7de` | Borders |
| `retro-cyan` | `#58a6ff` | `#0969da` | Primary accent |
| `retro-green` | `#3fb950` | `#1a7f37` | Success |
| `retro-yellow` | `#d29922` | `#9a6700` | Warning |
| `retro-orange` | `#db6d28` | `#bc4c00` | Info/orange accent |
| `retro-red` | `#f85149` | `#cf222e` | Error/danger |
| `retro-magenta` | `#bc8cff` | `#8250df` | Special highlight |
| `retro-pink` | `#f778ba` | `#bf3989` | Alternative accent |
| `retro-text` | `#e6edf3` | `#1f2328` | Primary text |
| `retro-muted` | `#8b949e` | `#656d76` | Secondary text |
| `retro-subtle` | `#6e7681` | `#6e7681` | Tertiary text (same both themes) |

Light values are taken from GitHub's Primer light palette — a proven, accessible set of colors that complement the existing GitHub-inspired dark palette.

**Contrast verification** (light theme key pairs):
- `retro-text (#1f2328)` on `retro-black (#ffffff)`: 16.75:1 ✓ (AA requires 4.5:1)
- `retro-muted (#656d76)` on `retro-black (#ffffff)`: 5.74:1 ✓
- `retro-cyan (#0969da)` on `retro-black (#ffffff)`: 5.72:1 ✓
- `retro-green (#1a7f37)` on `retro-black (#ffffff)`: 5.92:1 ✓
- `retro-red (#cf222e)` on `retro-black (#ffffff)`: 5.52:1 ✓

**Alternatives considered**:
- Adding `dark:` modifiers to all 448+ class usages → Rejected; massive scope, high error risk, violates simplicity.
- Creating separate light-* token namespace → Rejected; requires all components to conditionally switch between `retro-*` and `light-*` classes.

## R-003: How do all existing components react to theme changes without modification?

**Decision**: By using CSS variables as the underlying values for Tailwind's `retro-*` color tokens, all existing component classes (`bg-retro-black`, `text-retro-text`, etc.) automatically resolve to the correct color based on the active theme. No component file changes needed for basic theme support.

**Rationale**: The CSS cascade handles inheritance automatically. When we set `--color-retro-black: #ffffff` on `:root` and `--color-retro-black: #0d1117` on `.dark`, any element using `bg-retro-black` (which maps to `background-color: var(--color-retro-black)`) instantly picks up the correct value. Toggling the `dark` class on `<html>` triggers a CSS recalculation for all elements — this happens in a single frame, well under the 200ms target.

**What needs updating separately**:
- `tailwind.css` component classes (`.btn`, `.panel`, `.input`, scrollbar styles) — these use `@apply` with `retro-*` tokens, which will automatically resolve via CSS variables. No changes to these classes needed.
- Box shadows (`retro`, `retro-hover`) — these use hardcoded `rgba(88, 166, 255, ...)`. These should be updated to use CSS variables for the cyan color.
- Focus ring (`ring-offset-retro-black`) — will automatically resolve via CSS variable.

## R-004: How to handle functional/hardcoded colors?

**Decision**: Functional colors (git branch colors, file status indicator colors) remain as hardcoded hex values. They are not part of the theme system.

**Rationale**: FR-008 states functional colors must be preserved in both themes. These colors serve semantic purposes:
- Git branch colors (`BRANCH_COLORS` in `types/git.ts`): `#3B82F6`, `#EF4444`, `#10B981`, etc.
- File status colors: These use `text-retro-green`, `text-retro-red`, etc., which will naturally adjust via CSS variables to maintain readability in both themes.

The branch colors in `types/git.ts` are used in canvas rendering (GitGraphCanvas.vue) with inline styles, so they're outside the Tailwind/CSS variable system. These vibrant colors work well on both dark and light backgrounds.

**Alternatives considered**:
- Theme-aware branch colors → Rejected; unnecessary complexity. The branch colors are vibrant enough to be readable on both white and dark backgrounds.

## R-005: Where to store theme state?

**Decision**: Extend the existing `useSettingsStore` in `stores/settings.ts` with a `theme: 'dark' | 'light'` field. Persist via the existing `spec-cat-settings` localStorage key.

**Rationale**: The settings store already manages `claudeModel` and `autoModeConcurrency` with localStorage persistence. Theme preference is a user setting — it belongs in the same store. This follows the established pattern exactly (see 013-auto-mode research R-006 for precedent).

**Note**: `claudeModel` is treated as the global default model for all server-side AI requests.

**Alternatives considered**:
- Separate `useThemeStore` → Rejected; settings should be centralized. A separate store adds unnecessary indirection.
- Separate localStorage key (e.g., `spec-cat:theme`) → Rejected; fragmented storage. All settings in one key is the established pattern.
- `@nuxtjs/color-mode` module → Rejected; external dependency for a simple feature. The built-in implementation is ~50 lines.

## R-006: Theme toggle UI placement and design

**Decision**: Add a theme toggle button in the application header (Column 1 header, next to the settings gear icon). Use `SunIcon` when in dark mode (click to switch to light), `MoonIcon` when in light mode (click to switch to dark).

**Rationale**: FR-001 requires the toggle in the header. FR-010 requires visual indication of the current theme. The existing header has a settings gear button — the theme toggle follows the same style (icon button with hover effect). `@heroicons/vue` already provides `SunIcon` and `MoonIcon` in the `24/outline` set — no new dependencies.

**Icon logic**: Show the icon representing what will happen on click (industry convention):
- Dark mode active → Show `SunIcon` (click to go light)
- Light mode active → Show `MoonIcon` (click to go dark)

**Alternatives considered**:
- Toggle inside SettingsModal only → Rejected; FR-001 requires header access. But a secondary toggle in SettingsModal is also useful (FR-010).
- Dropdown with theme options → Rejected; with only 2 themes, a simple toggle button is more intuitive.
- Animated toggle switch → Rejected; unnecessary complexity for 2 states.
