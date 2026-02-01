# Implementation Plan: Theme System (Light & Dark)

**Branch**: `014-theme-system` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-theme-system/spec.md`

## Summary

Add a two-theme system (dark + light) to the Spec Cat application. The current "retro terminal" dark aesthetic becomes the dark theme (unchanged). A new light theme is introduced with a complementary palette. The implementation uses CSS custom properties (CSS variables) mapped to Tailwind utility classes, a Pinia-based theme store with localStorage persistence, and a header toggle button with sun/moon icon. All 30+ existing components react to theme changes via CSS variable inheritance — no per-component `dark:` class swapping needed. An inline head script ensures flash-free page loads.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue (SunIcon/MoonIcon), Tailwind CSS (v3.4+)
**Storage**: localStorage (`spec-cat-settings` key — extends existing settings store)
**Testing**: Manual testing per CLAUDE.md
**Target Platform**: Web (Nuxt 3 SSR + client)
**Project Type**: web
**Performance Goals**: Theme toggle completes in under 200ms (SC-001), no flash on page load (SC-002)
**Constraints**: WCAG AA contrast (4.5:1 normal text, 3:1 large text), localStorage ~5MB
**Scale/Scope**: 14 color tokens × 2 themes, 30+ Vue components, 1 global CSS file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Constitution Principles Evaluated**:

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User Control First | PASS | Theme toggle is user-initiated; default unchanged |
| II. Streaming-Native | N/A | No streaming involved in theme feature |
| III. CLI Parity | N/A | Theme is a web-only visual feature |
| IV. Multi-Project & History | PASS | Theme stored in settings, not per-project |
| V. Keyboard-Driven | PASS | Toggle button is keyboard-accessible (focusable) |
| VI. Simplicity Over Complexity | PASS | CSS variables = zero component changes; no new dependencies |
| VII. Type Safety | PASS | `Theme = 'dark' | 'light'` strict union type |

**Technology Constraints** (from CLAUDE.md):
- Nuxt 3 + Vue 3 + TypeScript ✓
- Pinia for state ✓
- Tailwind CSS for styling ✓
- @heroicons/vue for icons ✓
- pnpm as package manager ✓
- No new external dependencies needed ✓

**GATE RESULT**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/014-theme-system/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: architecture overview
├── contracts/
│   └── api.md           # Phase 1: contracts (client-only, no server API)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
assets/
└── css/
    └── tailwind.css          # MODIFIED: CSS variables for theme tokens, component styles updated

composables/
└── useTheme.ts               # NEW: theme composable (apply class to <html>, sync with store)

stores/
└── settings.ts               # MODIFIED: add theme field + setTheme action

layouts/
└── default.vue               # MODIFIED: theme toggle button in header, initialize theme on mount

components/
└── settings/
    └── SettingsModal.vue      # MODIFIED: theme selection radio buttons

tailwind.config.ts             # MODIFIED: CSS variable-based color tokens replace hardcoded hex
app.vue                        # MODIFIED: inline head script for flash-free theme load
```

**Structure Decision**: Nuxt 3 web application. All changes modify existing files except one new composable (`composables/useTheme.ts`). The implementation follows established Nuxt 3 conventions.

## FR Coverage Matrix

| FR | Description | Plan Section | Design Artifact |
|----|-------------|--------------|-----------------|
| FR-001 | Theme toggle in header | layouts/default.vue — toggle button with SunIcon/MoonIcon | quickstart.md |
| FR-002 | Dark theme default | stores/settings.ts — default state `theme: 'dark'` | data-model.md |
| FR-003 | Persist theme in localStorage | stores/settings.ts — extends existing `spec-cat-settings` persistence | data-model.md |
| FR-004 | Flash-free page load | app.vue — inline head script reads localStorage before render | research.md R-001 |
| FR-005 | Light theme color palette | tailwind.config.ts + tailwind.css — CSS variables with light values | research.md R-002 |
| FR-006 | All components react to theme | CSS variables on `:root` — components inherit automatically | research.md R-003 |
| FR-007 | Semantic color meanings preserved | Light palette uses same hue families with adjusted lightness | research.md R-002 |
| FR-008 | Functional colors preserved | Git branch colors + file status colors remain hardcoded (no change) | research.md R-004 |
| FR-009 | WCAG AA contrast | Light palette designed with 4.5:1+ contrast ratios | research.md R-002 |
| FR-010 | Toggle shows active theme (icon) | SunIcon for dark mode, MoonIcon for light mode | quickstart.md |

## Post-Design Constitution Re-check

| Principle | Status | Notes |
|-----------|--------|-------|
| VI. Simplicity Over Complexity | PASS | Single composable, store extension, CSS variables — minimal surface area |
| VII. Type Safety | PASS | `Theme = 'dark' | 'light'` enforced in store and composable |

**GATE RESULT**: PASS

## Complexity Tracking

> No constitution violations to justify.

*All changes follow existing patterns. One new composable file. No new dependencies, no new architectural layers.*
