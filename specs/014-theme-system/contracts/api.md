# API Contracts: Theme System (014-theme-system)

**Date**: 2026-02-08

## No Server-Side APIs

The theme system is entirely client-side. No server API endpoints are needed — theme preference is stored in localStorage and applied via CSS variables on the client.

---

## Client-Side Contracts

### Settings Store (Extended)

**Location**: `stores/settings.ts`

**New Type**:
```typescript
type Theme = 'dark' | 'light'
```

**Extended State**:
```typescript
interface SettingsStoreState {
  claudeModel: ClaudeModel
  autoModeConcurrency: number
  theme: Theme                    // NEW — default: 'dark'
  _hydrated: boolean
}
```

**New Action**:
```typescript
setTheme(theme: Theme): boolean
```

**Behavior**:
- Sets `this.theme` to the given value
- Persists to localStorage via `_saveToStorage()`
- Returns `true` on success, `false` on storage failure

---

### useTheme() Composable

**Location**: `composables/useTheme.ts`

**Interface**:
```typescript
function useTheme(): {
  theme: ComputedRef<Theme>
  isDark: ComputedRef<boolean>
  toggleTheme: () => void
}
```

**`theme`**: Reactive computed ref reflecting `settingsStore.theme`.

**`isDark`**: Convenience computed: `theme.value === 'dark'`.

**`toggleTheme()`**: Switches between dark and light:
```typescript
function toggleTheme() {
  const next = settingsStore.theme === 'dark' ? 'light' : 'dark'
  settingsStore.setTheme(next)
  applyThemeClass(next)
}
```

**`applyThemeClass(theme)`** (internal):
```typescript
function applyThemeClass(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
```

**Side effects**:
- Watches `settingsStore.theme` and calls `applyThemeClass()` on change
- On composable initialization, syncs `<html>` class to match store state

---

### localStorage Contract

**Key**: `spec-cat-settings` (existing — shared with other settings)

**Extended Schema**:
```typescript
{
  claudeModel: string
  autoModeConcurrency: number
  theme: 'dark' | 'light'          // NEW
}
```

**Behavior**:
- `claudeModel` is the global default model used for all server-side AI requests

**Backwards compatibility**: If `theme` field is missing (existing data), defaults to `'dark'`.

---

### Head Script Contract

**Location**: `app.vue` via `useHead()`

**Script** (runs synchronously before first paint):
```javascript
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('spec-cat-settings') || '{}');
    if (s.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})()
```

**Behavior**:
- Reads `spec-cat-settings` from localStorage
- If `theme === 'light'` → ensure no `dark` class (light is CSS default via `:root`)
- Otherwise (dark, missing, or error) → add `dark` class
- Executes before any rendering → zero flash

---

### CSS Variable Contract

**Location**: `assets/css/tailwind.css`

**13 CSS custom properties** defined on `:root` (light) and `.dark` (dark):

```
--color-retro-black
--color-retro-dark
--color-retro-panel
--color-retro-border
--color-retro-cyan
--color-retro-green
--color-retro-yellow
--color-retro-orange
--color-retro-red
--color-retro-magenta
--color-retro-pink
--color-retro-text
--color-retro-muted
--color-retro-subtle
```

**Format**: Space-separated RGB values (e.g., `13 17 23`) to support Tailwind opacity modifiers.

**Consumer**: Tailwind config maps `retro.*` to `rgb(var(--color-*) / <alpha-value>)`.

---

### Component Integration

**No component API changes needed.** All existing components continue using:
- `bg-retro-black`, `bg-retro-dark`, `bg-retro-panel`
- `text-retro-text`, `text-retro-muted`, `text-retro-subtle`
- `border-retro-border`
- `text-retro-cyan`, `text-retro-green`, `text-retro-red`, etc.
- `bg-retro-cyan/20`, `bg-retro-green/30`, etc. (opacity modifiers)

These classes resolve to CSS variables, which change values when `.dark` is toggled on `<html>`.
