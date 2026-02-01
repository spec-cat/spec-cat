# Tasks: Theme System (Light & Dark)

**Feature**: `014-theme-system`
**Generated**: 2026-02-08
**Source**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

---

## Phase 1: Setup

> Goal: No project initialization needed — this feature modifies an existing Nuxt 3 application. Phase 1 verifies the existing codebase is ready and establishes foundational understanding.

- [x] T001 Verify existing `darkMode: "class"` configuration in `tailwind.config.ts` and confirm current `retro-*` color token names match the 14 tokens listed in data-model.md

---

## Phase 2: Foundational — CSS Variables + Tailwind Token Migration

> Goal: Convert the hardcoded hex color system to CSS custom properties. This is the blocking prerequisite for all theme functionality — until colors are variable-based, no theme switching is possible.
>
> **Independent Test**: After this phase, the app should look exactly the same as before (dark theme preserved). No visual change = success. Any visual regression = failure.

- [x] T002 [FR-005] Define CSS custom properties for all 14 `retro-*` tokens in `:root` (light values) and `.dark` (dark values) using space-separated RGB format in `assets/css/tailwind.css`
- [x] T003 [FR-005] Replace all hardcoded hex color values in `tailwind.config.ts` `colors.retro` with `rgb(var(--color-retro-*) / <alpha-value>)` references
- [x] T004 [FR-005] Update box shadow definitions in `tailwind.config.ts` to use CSS variable references instead of hardcoded `rgba(88, 166, 255, ...)` values
- [x] T005 [FR-005] Update any hardcoded color references in component styles within `assets/css/tailwind.css` (scrollbar colors, selection colors) to use CSS variable-based tokens

---

## Phase 3: User Story 1 — Switch from Dark to Light Theme (P1)

> Goal: User can click a toggle button in the header to switch between dark and light themes. All UI elements transition instantly.
>
> **Independent Test**: Click the theme toggle button in the header. All panels, text, borders, buttons, and inputs should transition to the light color scheme. Click again to return to dark. Visual consistency across all four layout columns.

### Store Extension

- [x] T006 [US1] [FR-002] [FR-003] Add `Theme` type (`'dark' | 'light'`) and `theme` field with default `'dark'` to settings store state in `stores/settings.ts`
- [x] T007 [US1] [FR-003] Add `setTheme(theme: Theme)` action to settings store that persists to localStorage in `stores/settings.ts`
- [x] T008 [US1] [FR-002] Update `hydrate()`, `resetToDefaults()`, and `_saveToStorage()` methods to include `theme` field in `stores/settings.ts`

### Theme Composable

- [x] T009 [US1] [FR-006] Create `composables/useTheme.ts` with `useTheme()` composable that exposes `theme`, `isDark`, and `toggleTheme()`, watches store and applies `.dark` class to `document.documentElement`

### Theme Toggle UI

- [x] T010 [US1] [FR-001] [FR-010] Add theme toggle button with `SunIcon`/`MoonIcon` next to the settings gear button in header of `layouts/default.vue`
- [x] T011 [US1] [FR-001] Add theme selection radio buttons (Dark / Light) as a new section in `components/settings/SettingsModal.vue`

---

## Phase 4: User Story 2 — Theme Preference Persists Across Sessions (P2)

> Goal: Theme preference survives browser restarts. Page loads with the correct theme immediately, no flash.
>
> **Independent Test**: Select light theme → close browser tab → reopen app. Light theme should appear immediately on first paint with zero flash of dark theme. Clear localStorage → reload → dark theme appears as default.

- [x] T012 [US2] [FR-004] Add inline `<script>` in `<head>` via `useHead()` in `app.vue` that reads `spec-cat-settings` from localStorage and applies/removes `.dark` class on `<html>` before first paint
- [x] T013 [US2] [FR-004] Ensure the head script handles edge cases: missing localStorage key, malformed JSON, missing `theme` field — all defaulting to dark theme in `app.vue`

---

## Phase 5: User Story 3 — All Components React to Theme Changes (P1)

> Goal: Every component type — modals, toasts, scrollbars, buttons, inputs, status indicators, dropdowns — correctly reflects the active theme without page reload.
>
> **Independent Test**: Toggle theme while modal is open. Check all inputs, buttons, scrollbars, toast notifications, and status indicators in both themes. No component should display stale or mixed-theme styling.

- [x] T014 [US3] [FR-006] [FR-007] Verify and fix any component styles that use hardcoded hex colors (not `retro-*` tokens) to use CSS variable-based tokens — audit all Vue components under `components/`
- [x] T015 [US3] [FR-006] Verify scrollbar thumb/track colors in `assets/css/tailwind.css` use `retro-*` tokens (via CSS variables) so they update on theme change
- [x] T016 [US3] [FR-008] Verify git branch colors in `types/git.ts` (BRANCH_COLORS) remain as hardcoded hex values and are legible in both dark and light themes
- [x] T017 [US3] [FR-009] Verify WCAG AA contrast ratios (4.5:1 normal text, 3:1 large text) for all key text/background color pairs in the light theme palette defined in `assets/css/tailwind.css`

---

## Phase 6: Polish & Cross-Cutting Concerns

> Goal: Final quality pass — edge cases, accessibility, and consistency.

- [x] T018 [FR-006] Ensure no inline styles in Vue components use hardcoded background/text colors that bypass the CSS variable system — audit `components/**/*.vue` and `layouts/**/*.vue`
- [x] T019 [FR-002] Verify that existing `spec-cat-settings` localStorage data (without `theme` field) gracefully defaults to dark theme on hydration in `stores/settings.ts`
- [x] T020 [FR-009] [FR-007] Verify semantic status colors (success=green, error=red, warning=yellow, info=cyan) maintain their meaning in both themes across toast, button, and badge components

---

## Dependencies

```
Phase 1 (T001)
  │
  ▼
Phase 2 (T002 → T003 → T004, T005)     ← All later phases depend on this
  │
  ├──► Phase 3 (T006-T008 → T009 → T010, T011)   [US1: P1]
  │       │
  │       ▼
  │    Phase 4 (T012, T013)                         [US2: P2]
  │       │
  │       ▼
  │    Phase 5 (T014, T015, T016, T017)             [US3: P1]
  │
  └──► Phase 6 (T018, T019, T020)                   [Polish]
```

### Detailed Dependencies

| Task | Depends On | Reason |
|------|-----------|--------|
| T002 | T001 | Must verify existing tokens before defining CSS variables |
| T003 | T002 | Tailwind config must reference CSS variables already defined |
| T004 | T002 | Shadow variables depend on CSS variable definitions |
| T005 | T002 | Scrollbar/selection colors depend on CSS variable definitions |
| T006 | T003 | Store needs to exist before composable can use it |
| T007 | T006 | `setTheme` depends on `theme` field existing |
| T008 | T006 | Hydration depends on `theme` field existing |
| T009 | T008 | Composable watches store, which must be fully extended |
| T010 | T009 | Toggle UI calls `useTheme().toggleTheme()` |
| T011 | T009 | Settings radio buttons use `useTheme()` |
| T012 | T007 | Head script reads the same localStorage key as the store |
| T013 | T012 | Edge case handling extends the head script |
| T014 | T003 | Component audit requires CSS variable system in place |
| T015 | T002 | Scrollbar verification requires CSS variables |
| T016 | T003 | Branch color legibility check requires light theme active |
| T017 | T002 | Contrast verification requires light palette defined |
| T018 | T003 | Inline style audit requires full CSS variable system |
| T019 | T008 | Backward compat verification requires hydration logic |
| T020 | T014 | Status color verification requires component audit complete |

---

## Parallel Execution Opportunities

### Within Phase 2
- T004 and T005 can run in parallel after T002 completes (both depend on CSS variables, modify different files)

### Within Phase 3
- T010 and T011 can run in parallel after T009 completes (both use `useTheme()`, modify different files)
- T006, T007, T008 are sequential (same file, cumulative changes)

### Within Phase 5
- T014, T015, T016, T017 can all run in parallel (independent verification tasks on different files/areas)

### Within Phase 6
- T018, T019, T020 can all run in parallel (independent verification tasks)

---

## Implementation Strategy

### MVP Scope (Recommended First Pass)
**Phases 1-3** (T001–T011): Delivers a working theme toggle with full dark/light switching. Users can switch themes and all components react via CSS variables. This is independently testable and delivers core value.

### Full Scope
**Phases 4-6** (T012–T020): Adds persistence across sessions (flash-free), edge case handling, and final verification. Builds on MVP to complete all FRs.

### Incremental Delivery Order
1. **CSS Foundation** (Phase 2): Zero visual change, but enables everything else
2. **Theme Toggle** (Phase 3): Core feature — user can switch themes
3. **Persistence** (Phase 4): Theme survives browser restart
4. **Verification** (Phases 5-6): Ensure completeness and quality

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 20 |
| **Phase 1 (Setup)** | 1 task |
| **Phase 2 (Foundation)** | 4 tasks |
| **Phase 3 / US1 (Toggle)** | 6 tasks |
| **Phase 4 / US2 (Persistence)** | 2 tasks |
| **Phase 5 / US3 (All Components)** | 4 tasks |
| **Phase 6 (Polish)** | 3 tasks |
| **Parallel Opportunities** | 4 groups (see above) |
| **MVP Scope** | T001–T011 (11 tasks, Phases 1-3) |
| **FR Coverage** | All 10 FRs covered (FR-001 through FR-010) |
