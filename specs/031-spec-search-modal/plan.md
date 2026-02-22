# Implementation Plan: Command Palette Spec Search

**Branch**: `031-spec-search-modal` | **Date**: 2026-02-22 | **Spec**: [/home/khan/src/brick2/specs/031-spec-search-modal/spec.md](/home/khan/src/brick2/specs/031-spec-search-modal/spec.md)
**Input**: Feature specification from `/home/khan/src/brick2/specs/031-spec-search-modal/spec.md`

## Summary

Add a command palette modal opened by `Ctrl+K` / `Cmd+K` from any focus context, execute debounced spec search (400ms) across all features by default, and allow pointer/keyboard result selection that syncs feature panel selection.

## Scope Guardrails *(mandatory)*

### Owned Files

- `/home/khan/src/brick2/components/features/FeaturesPanel.vue` - shortcut handling and modal integration
- `/home/khan/src/brick2/components/features/FeatureSearchModal.vue` - modal UI, search behavior, result states
- `/home/khan/src/brick2/types/specSearch.ts` - optional UI-facing type refinements for result rendering
- `/home/khan/src/brick2/specs/031-spec-search-modal/*` - planning/design artifacts for this feature

### Do Not Edit

- `/home/khan/src/brick2/specs/018-codex-provider-integration/` - separate active lane
- `/home/khan/src/brick2/server/utils/specSearch/*` - no indexing/engine changes in this feature
- `/home/khan/src/brick2/components/git/*` - unrelated git graph feature lane

### Parallelization Notes

- `FeatureSearchModal.vue` implementation can proceed in parallel with docs/contracts updates.
- `FeaturesPanel.vue` wiring should follow modal event contract finalization.
- No backend endpoint changes expected; contracts document existing endpoint consumption.

## Technical Context

**Language/Version**: TypeScript 5.6+, Vue 3.5+, Nuxt 3.16+  
**Primary Dependencies**: Nuxt/Nitro runtime, Pinia, Tailwind CSS, `@heroicons/vue`  
**Storage**: Existing filesystem-backed spec index/cache (no new persistence)  
**Testing**: Manual UI testing + `pnpm typecheck` + targeted Vitest coverage if component tests are added  
**Target Platform**: Browser-based Nuxt app (desktop keyboard-first interaction)  
**Project Type**: web (Nuxt full-stack)  
**Performance Goals**: Modal opens in under 100ms; debounced search results render within 2 seconds for 90% of queries  
**Constraints**: 400ms debounce; shortcut must open regardless of focus target; global cross-feature search default; dismissal must preserve selection unless a result is chosen  
**Scale/Scope**: Single modal flow in feature panel with result list capped to a practical command-palette size (default 20)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Modal behavior is explicit and reversible; dismissal is non-destructive. |
| Streaming-Native Architecture | N/A | Feature uses request/response search endpoint, not stream pipeline. |
| CLI Parity | N/A | UI feature only; no CLI behavior divergence introduced. |
| Multi-Project & History Support | PASS | Uses existing project-scoped `/api/specs/*` endpoints only. |
| Keyboard-Driven Experience | PASS | Introduces high-value keyboard shortcut and navigation. |
| Simplicity Over Complexity | PASS | Reuses current search endpoint and existing panel selection flow. |
| Type Safety | PASS | Reuses typed `SearchResponse` contracts and typed component emits. |
| Stack Constraints (Nuxt/Vue/Pinia/Tailwind) | PASS | No off-stack technology or forbidden dependencies. |

## Project Structure

### Documentation (this feature)

```text
/home/khan/src/brick2/specs/031-spec-search-modal/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── spec-search-modal-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
/home/khan/src/brick2/components/features/
├── FeaturesPanel.vue
└── FeatureSearchModal.vue

/home/khan/src/brick2/server/api/specs/
└── search.get.ts

/home/khan/src/brick2/types/
└── specSearch.ts

/home/khan/src/brick2/tests/components/features/
```

**Structure Decision**: Web application structure with existing Nuxt component/API/type directories; no new top-level architecture.

## Phase 0: Research Plan

### Research Tasks

- Research keyboard shortcut precedence patterns for forcing modal-open regardless of focused element.
- Research command palette UX patterns for debounced search (400ms) with keyboard-first navigation.
- Research stale-result handling patterns that preserve context and recoverability (inline error, modal remains open).
- Research feature-panel integration pattern to ensure one selection path updates panel and git graph state.

### Phase 0 Output

- `/home/khan/src/brick2/specs/031-spec-search-modal/research.md`

## Phase 1: Design & Contracts

### Data Model Deliverable

- `/home/khan/src/brick2/specs/031-spec-search-modal/data-model.md`

### Contracts Deliverable

- `/home/khan/src/brick2/specs/031-spec-search-modal/contracts/spec-search-modal-api.yaml`

### Quickstart Deliverable

- `/home/khan/src/brick2/specs/031-spec-search-modal/quickstart.md`

### Agent Context Update

- Run `/home/khan/src/brick2/.specify/scripts/bash/update-agent-context.sh codex`

## FR Coverage Matrix

| FR | Requirement Summary | Planned Coverage |
|----|---------------------|------------------|
| FR-001 | Open modal from shortcut | `FeaturesPanel.vue`, `FeatureSearchModal.vue` |
| FR-002 | Focus search input on open | `FeatureSearchModal.vue` |
| FR-003 | Debounced query trigger (400ms) | `FeatureSearchModal.vue` |
| FR-004 | Search all features by default | `FeatureSearchModal.vue` + `/api/specs/search` usage |
| FR-005 | Render selectable result links | `FeatureSearchModal.vue` |
| FR-006 | Show identifying result details | `FeatureSearchModal.vue`, `types/specSearch.ts` |
| FR-007 | Sync selected result to feature panel | `FeaturesPanel.vue` via existing selection function |
| FR-008 | Pointer + ArrowUp/ArrowDown + Enter behavior | `FeatureSearchModal.vue` |
| FR-009 | Empty/no-result/error feedback states | `FeatureSearchModal.vue` |
| FR-010 | Dismiss without selection preserves current selection | `FeaturesPanel.vue`, `FeatureSearchModal.vue` |
| FR-011 | Unavailable feature selection error, keep modal open | `FeatureSearchModal.vue`, `FeaturesPanel.vue` |
| FR-012 | Escape closes modal and preserves selection if no pick | `FeatureSearchModal.vue`, `FeaturesPanel.vue` |
| FR-013 | Shortcut opens regardless of focus target | `FeaturesPanel.vue` shortcut handler |

## Post-Design Constitution Re-Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | Users can open/close/select explicitly; no hidden destructive actions. |
| Keyboard-Driven Experience | PASS | Full shortcut and keyboard result navigation defined. |
| Simplicity Over Complexity | PASS | Existing endpoint and panel state path reused; no new backend engine. |
| Type Safety | PASS | Type-safe search response handling and event contracts retained. |
| Stack Constraints | PASS | No new frameworks/services introduced. |

## Complexity Tracking

No constitution violations identified.
