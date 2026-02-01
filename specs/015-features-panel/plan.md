# Implementation Plan: Features Panel

**Branch**: `015-features-panel` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-features-panel/spec.md`

## Summary

The Features Panel is a Nuxt 3 panel component that discovers feature specifications from the `specs/` directory, displays them as interactive cards with status badges, provides a 3-view navigation state machine (features → files → content), and integrates with the cascade pipeline system to trigger speckit commands (clarify, plan, tasks, implement) via the chat system.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Vue 3.5+ (Composition API, `<script setup>`)
**Framework**: Nuxt 3.16+ (SSR/SPA, auto-imports, file-based API routes)
**Primary Dependencies**: Vue 3.5+, Pinia 2.2+ (state), Tailwind CSS 3.4+ (styling), @heroicons/vue 2.2+ (icons), marked 15.0.12 (markdown), dompurify 3.2.0 (XSS protection)
**Storage**: Filesystem (`specs/` directory — read-only, server-scanned); localStorage (conversations via chat store)
**Testing**: Vitest 4.0+ with @vue/test-utils 2.4+ and happy-dom/jsdom
**Target Platform**: Web browser (desktop-first, 4-column layout)
**Project Type**: Web application (Nuxt 3 full-stack)
**Performance Goals**: Feature list loads within 2 seconds (SC-001); navigation response within 100ms
**Constraints**: Panel width constrained to flex:2 (20% of viewport); all file access read-only; XSS prevention mandatory
**Scale/Scope**: Handles 50+ feature directories; files up to 100KB markdown content

## Constitution Check

*No `.speckit/memory/constitution.md` found — no constitution gates to evaluate.*

## Project Structure

### Documentation (this feature)

```text
specs/015-features-panel/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/
│   ├── features-list.md   # GET /api/specs/features contract
│   └── spec-file-content.md # GET /api/specs/:id/:file contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
components/features/
├── FeaturesPanel.vue      # Main panel: 3-view state machine, cascade logic [FR-001,004,009-011,013-015]
├── FeatureCard.vue        # Card component: badges, action buttons [FR-002,003,007,008,012]
└── SpecFileViewer.vue     # Markdown viewer: loading/error/retry [FR-005,006,018]

composables/
├── useMarkdown.ts         # marked + dompurify wrapper [FR-006]
├── useChatStream.ts       # WebSocket streaming + cascade pipeline [FR-009]
└── useToast.ts            # Error notifications

stores/
└── chat.ts                # Conversation management, feature linking [FR-010,011,012]

server/api/specs/
├── features.get.ts                       # Feature discovery endpoint [FR-001,002,003,016,017]
└── [featureId]/[...filename].get.ts      # File content endpoint [FR-016,017]

types/
└── spec-viewer.ts         # Feature, SpecFile, response interfaces

layouts/
└── default.vue            # 4-column layout: Features in Column 2
```

**Structure Decision**: Web application using Nuxt 3 conventions. Components in `components/features/`, server API in `server/api/specs/`, types in `types/spec-viewer.ts`. No separate backend/frontend split — Nuxt handles both.

## FR Coverage Matrix

| FR | Description | Component(s) |
|----|-------------|---------------|
| FR-001 | Discover features, display as sorted cards | `features.get.ts`, `FeaturesPanel.vue` |
| FR-002 | Display feature name and ID | `features.get.ts`, `FeatureCard.vue` |
| FR-003 | Color-coded status badges (spec/plan/tasks) | `FeatureCard.vue` |
| FR-004 | 3-view navigation state machine | `FeaturesPanel.vue` |
| FR-005 | File list with human-readable labels | `FeaturesPanel.vue`, `features.get.ts` |
| FR-006 | Markdown rendering with XSS protection | `SpecFileViewer.vue`, `useMarkdown.ts` |
| FR-007 | Action buttons trigger speckit commands | `FeatureCard.vue`, `FeaturesPanel.vue` |
| FR-008 | Conditional button visibility (spec/plan/tasks) | `FeatureCard.vue` |
| FR-009 | Cascade pipeline (Plan→Tasks→Implement) | `FeaturesPanel.vue`, `useChatStream.ts` |
| FR-009a | Analyze prerequisite step before analyze command | `FeaturesPanel.vue`, `useChatStream.ts` |
| FR-010 | Conversation reuse for same feature | `FeaturesPanel.vue`, `chat.ts` |
| FR-011 | Shift+click forces new conversation | `FeaturesPanel.vue` |
| FR-012 | Chat icon creates linked conversation | `FeatureCard.vue`, `FeaturesPanel.vue` |
| FR-013 | Active feature card highlighting | `FeaturesPanel.vue`, `FeatureCard.vue` |
| FR-014 | Auto-scroll to active feature card | `FeaturesPanel.vue` |
| FR-015 | Refresh button to re-fetch features | `FeaturesPanel.vue` |
| FR-016 | Path traversal protection | `[...filename].get.ts` |
| FR-017 | Only serve .md files | `[...filename].get.ts` |
| FR-018 | Loading, error, retry states | `SpecFileViewer.vue`, `FeaturesPanel.vue` |
| FR-018a | In-app editing and save flow | `SpecFileViewer.vue`, `server/api/specs/[featureId]/[...filename].put.ts` |
| FR-019 | Feature search filtering | `FeaturesPanel.vue` |
| FR-020 | Feature selection sync with Git Graph | `FeaturesPanel.vue`, `stores` integration |
## Key Design Decisions (Documented in research.md)

- Local component state over Pinia store for features data (ephemeral, single consumer)
- Client-side cascade queue over server-side orchestration (simpler, observable)
- marked + dompurify for markdown (existing dependencies, proven pipeline)
- Simple ref-based state machine for 3-view navigation (linear depth, no router needed)
- String-based path traversal check over realpath validation (sufficient for local dev tool)

## Complexity Tracking

No constitution violations — no complexity justifications needed.
