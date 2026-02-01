# Implementation Plan: Spec Viewer

**Branch**: `004-spec-viewer` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-spec-viewer/spec.md`

## Summary

Replace the placeholder "Spec viewer coming soon" FeaturesPanel with a fully functional spec viewer that restores the original feature list (with cascade buttons, chat icons, active highlighting) and adds the ability to click a feature → see available spec files → view rendered markdown content inline. Two new server endpoints provide feature listing and spec file content from the `specs/` directory.

## Technical Context

**Language/Version**: TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+)
**Primary Dependencies**: Pinia (v2.2+), marked (v15.0.12), dompurify (v3.2.0), @heroicons/vue, Tailwind CSS
**Storage**: Filesystem (`specs/` directory, read-only)
**Testing**: Manual testing per CLAUDE.md
**Target Platform**: Browser (Nuxt SSR/SPA)
**Project Type**: Web application (Nuxt 3 full-stack)
**Performance Goals**: Feature list loads within 2s, markdown renders within 1s (SC-002, SC-004)
**Constraints**: 2 clicks max to reach spec content (SC-001), single-click back (SC-005)
**Scale/Scope**: ~15 features in specs/ directory, files up to 500+ lines

## Constitution Check

*No constitution file exists. Proceeding with spec requirements and CLAUDE.md guidelines.*

**CLAUDE.md Constraints Applied:**
- Use pnpm (never npm/yarn)
- Manual testing only (no server runs in AI session)
- Retro-terminal visual theme consistency
- Follow existing patterns from the codebase

## Project Structure

### Documentation (this feature)

```text
specs/004-spec-viewer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── features-list.md
│   └── spec-file-content.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
components/features/
├── FeaturesPanel.vue       # Main panel component (restore + extend)
├── FeatureCard.vue         # Individual feature card with cascade/chat buttons
└── SpecFileViewer.vue      # Markdown viewer for spec file content

server/api/specs/
├── features.get.ts         # GET /api/specs/features - list all features
└── [featureId]/
    └── [...filename].get.ts  # GET /api/specs/:featureId/:filename - file content

types/
└── spec-viewer.ts          # TypeScript types for Feature, SpecFile
```

**Structure Decision**: Nuxt 3 convention — components in `components/features/`, server API routes in `server/api/specs/`, shared types in `types/`. No new stores needed; existing `useChatStore` and `useChatStream` provide all conversation/cascade functionality.

## FR Coverage Matrix

| FR | Description | Component | Implementation |
|----|-------------|-----------|----------------|
| FR-001 | List all features from specs/ | FeaturesPanel.vue + features.get.ts | Fetch from API, render list |
| FR-002 | Feature card with name, ID, file badges | FeatureCard.vue | Props-driven display |
| FR-003 | Click feature to see spec files | FeaturesPanel.vue | View state transition features→files |
| FR-004 | Click file to view rendered markdown | SpecFileViewer.vue | Fetch content + marked parse |
| FR-005 | Full markdown rendering | SpecFileViewer.vue | marked + dompurify |
| FR-006 | Navigate back to feature list | FeaturesPanel.vue | Back button, view state reset |
| FR-007 | Cascade buttons (Clarify/Plan/Tasks/Run) | FeatureCard.vue | Conditional buttons based on file availability |
| FR-008 | Cascade creates/reuses conversation | FeatureCard.vue | useChatStore.findConversationByFeature + createConversation |
| FR-009 | Plan chains Tasks→Implement | FeatureCard.vue | useChatStream.enableCascade |
| FR-010 | Shift+click forces new conversation | FeatureCard.vue | Event.shiftKey check |
| FR-011 | Chat icon for spec conversation | FeatureCard.vue | Chat button with createConversation({ featureId }) |
| FR-012 | Active feature highlighting | FeatureCard.vue | Computed from activeConversation.featureId |
| FR-013 | Auto-scroll to highlighted card | FeaturesPanel.vue | Watch activeConversationId, scrollIntoView |
| FR-014 | Refresh button | FeaturesPanel.vue | Re-fetch features API |
| FR-015 | Retro-terminal theme | All components | Tailwind retro-* classes |
| FR-016 | Features with no spec files shown | FeatureCard.vue | Empty badges state |
| FR-017 | Server endpoint: features list | features.get.ts | Scan specs/ directory |
| FR-018 | Server endpoint: spec file content | [...filename].get.ts | Read file, return raw content |

## Architecture

### View State Machine

```
┌──────────────┐   click feature   ┌───────────────┐   click file   ┌──────────────┐
│  FEATURE_LIST │ ───────────────→ │   FILE_LIST    │ ─────────────→ │  FILE_VIEWER  │
│              │ ←─────────────── │               │ ←───────────── │              │
└──────────────┘   back button     └───────────────┘   back button   └──────────────┘
```

The panel manages three views using a `currentView` ref: `'features' | 'files' | 'content'`. Navigation is stack-based — each level has a back button returning to the previous level.

### Data Flow

```
Browser                          Server
┌─────────────┐   GET /api/specs/features    ┌──────────────┐
│ FeaturesPanel│ ──────────────────────────→  │ features.get │ → readdir(specs/)
│             │ ←──────────────────────────  │              │ → stat each file
└─────────────┘   { features: Feature[] }    └──────────────┘

┌──────────────┐   GET /api/specs/:id/:file  ┌──────────────────┐
│SpecFileViewer│ ──────────────────────────→  │ [...filename].get │ → readFile()
│              │ ←──────────────────────────  │                  │
└──────────────┘   { content: string }       └──────────────────┘
```

### Cascade Integration (reuses existing infrastructure)

```
FeatureCard "Plan" click
  → chatStore.findConversationByFeature(featureId)
  → chatStore.createConversation({ featureId }) if not found
  → enableCascade(featureId, conversationId, ['tasks', 'implement'])
  → chatStore.addUserMessage('/speckit.plan 004-spec-viewer')
  → streamMessage(prompt, msgId, conversationId, { featureId })
```

## Complexity Tracking

No complexity violations. Feature uses existing patterns and infrastructure:
- Existing cascade/conversation infrastructure from useChatStream + useChatStore
- Existing markdown libraries (marked + dompurify) already in package.json
- Standard Nuxt server routes pattern
- Simple view state machine (3 states, no concurrent states)

## FR Coverage Addendum (2026-02-14)

| FR | Description | Component | Implementation |
|----|-------------|-----------|----------------|
| FR-019 | Keyboard navigation across commits in detail view | GitCommitDetail.vue | Covered by task traceability addendum |
| FR-020 | Detail view positioning toggle | GitCommitDetail.vue + store | Covered by task traceability addendum |
| FR-021 | Commit detail mode switching behavior | GitCommitDetail.vue | Covered by task traceability addendum |
| FR-022 | Persisted detail display preferences | store + UI bindings | Covered by task traceability addendum |
