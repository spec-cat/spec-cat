# Implementation Plan: Embedded Skills System

**Branch**: `016-embedded-skills` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-embedded-skills/spec.md`

## Summary

Spec Cat integrates specific AI agents as built-in skills executable from the features panel. Skills are markdown files with YAML frontmatter stored in a `skills/` directory, auto-discovered by the server, and surfaced as action buttons on feature cards alongside existing cascade actions. The first skill ("better-spec") validates spec documents against the What/How/Track separation principle. Skill execution reuses the existing conversation/WebSocket/PTY streaming infrastructure — no new runtime is needed.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), @heroicons/vue (v2.2+), yaml (v2.8.2), marked (v15.0.12), dompurify (v3.2.0), Tailwind CSS (v3.4+)
**Storage**: Filesystem (`skills/` directory — read-only skill definitions); no database
**Testing**: Manual (per CLAUDE.md — user will test manually)
**Target Platform**: Nuxt 3 SSR + client (Node.js server, modern browser client)
**Project Type**: Web application (Nuxt 3 full-stack)
**Performance Goals**: Skill actions visible within 3 seconds of click (SC-001); skill list loads with features panel
**Constraints**: <20 skills expected (filesystem scan sufficient), no new npm dependencies needed
**Scale/Scope**: Small addition — 2 new API endpoints, 1 new utility, 1 new type file, 2 modified components, 1 new skill definition

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file exists (`.speckit/memory/constitution.md` not found). Gate passes by default — no constraints to check.

**Post-Phase 1 re-check**: Design follows all existing project patterns:
- Nuxt 3 server API convention (`server/api/`)
- Vue 3 Composition API with `<script setup>`
- Existing type patterns in `types/`
- pnpm (no npm/yarn)
- No new dependencies required (yaml already available)
- No server execution in AI session (per CLAUDE.md)

## Project Structure

### Documentation (this feature)

```text
specs/016-embedded-skills/
├── plan.md              # This file
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Implementation quickstart
├── contracts/
│   └── api.yaml         # Phase 1: OpenAPI contract
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
skills/                                    # NEW: Skill definitions directory
└── better-spec.md                         # NEW: First built-in skill [FR-008]

types/
└── skill.ts                               # NEW: Skill TypeScript interfaces

server/
├── api/
│   └── skills/
│       ├── index.get.ts                   # NEW: GET /api/skills [FR-015]
│       └── [skillId]/
│           └── prompt.post.ts             # NEW: POST /api/skills/{id}/prompt [FR-006]
└── utils/
    └── skillRegistry.ts                   # NEW: Skill loading, validation, rendering

components/features/
├── FeatureCard.vue                        # MODIFIED: Add skill action buttons [FR-003, FR-004, FR-010, FR-016]
└── FeaturesPanel.vue                      # MODIFIED: Fetch skills, handle skill execution [FR-005, FR-007, FR-011]
```

**Structure Decision**: This feature extends the existing Nuxt 3 web application structure. New files follow established conventions: server endpoints in `server/api/`, utilities in `server/utils/`, types in `types/`, and the new `skills/` directory at project root mirrors the `specs/` directory pattern for filesystem-based discovery.

## FR Coverage Matrix

| FR | Plan Section | Implementation Target |
|----|-------------|----------------------|
| FR-001 | Skill registry auto-discovery | `server/utils/skillRegistry.ts` — `loadSkills()` scans `skills/` dir |
| FR-002 | Skill definition format | `types/skill.ts` — `SkillDefinition` interface; `skills/better-spec.md` — example |
| FR-003 | Skills in features panel | `FeatureCard.vue` — skill action buttons alongside cascade actions |
| FR-004 | Disabled when prerequisites unmet | `FeatureCard.vue` — client-side prerequisite check, disabled+tooltip |
| FR-005 | Conversation create/reuse | `FeaturesPanel.vue` — `handleSkill()` reuses `handleCascade` pattern |
| FR-006 | Prompt template rendering | `server/utils/skillRegistry.ts` — `renderPrompt()` + `prompt.post.ts` endpoint |
| FR-007 | Real-time streaming | `FeaturesPanel.vue` — uses existing `useChatStream.sendMessage()` |
| FR-008 | Better-spec built-in skill | `skills/better-spec.md` — skill definition file |
| FR-009 | Better-spec validation report | `skills/better-spec.md` — prompt template content |
| FR-010 | Running state indicator | `FeatureCard.vue` — streaming state check via `chatStore.isConversationStreaming()` |
| FR-011 | Shift+click new conversation | `FeaturesPanel.vue` — `event.shiftKey` check (same as cascade) |
| FR-012 | Permission system integration | Inherited — existing WebSocket/PTY handles permission modes |
| FR-013 | Markdown+YAML frontmatter format | `server/utils/skillRegistry.ts` — YAML frontmatter parser |
| FR-014 | Malformed file handling | `server/utils/skillRegistry.ts` — validation with console warning |
| FR-015 | Server API endpoint | `server/api/skills/index.get.ts` — GET /api/skills |
| FR-016 | Visual distinction from cascade | `FeatureCard.vue` — separator + distinct color (retro-purple) |
| FR-017 | Project skills override built-ins on ID collision | `server/utils/skillRegistry.ts` — merge order/override rules favor project definitions |

## Complexity Tracking

No complexity violations. The design:
- Adds no new dependencies
- Creates 6 new files (small footprint)
- Modifies 2 existing files (additive changes only)
- Reuses all existing infrastructure (conversations, streaming, permissions, worktrees)
- No new state stores, no database, no new WebSocket events

## FR Coverage Addendum (2026-02-14)

| FR | Plan Section | Implementation Target |
|----|-------------|----------------------|
| FR-006a | Prompt rendering variable substitution completeness | `server/utils/skillRegistry.ts` |
| FR-006b | Prompt rendering missing-variable handling | `server/utils/skillRegistry.ts` |
| FR-006c | Prompt rendering output stability | `server/api/skills/[skillId]/prompt.post.ts` |
| FR-010a | Running indicator while skill stream active per conversation | `components/features/FeatureCard.vue` |
