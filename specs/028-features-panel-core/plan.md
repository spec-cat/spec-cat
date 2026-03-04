# Implementation Plan: Features Panel Core

**Branch**: `028-features-panel-core` | **Date**: 2026-02-16 | **Spec**: `specs/028-features-panel-core/spec.md`

## Summary

Build a single, stable core panel baseline after consolidating `004` and `015`.

## Scope Guardrails

### Owned Files

- `components/features/FeaturesPanel.vue` (core sections)
- `components/features/FeatureCard.vue` (display sections)
- `components/features/SpecFileViewer.vue`
- `server/api/specs/features.get.ts`
- `server/api/specs/[featureId]/[...filename].get.ts`

### Do Not Edit

- Action-trigger sections owned by `029-features-panel-actions`
- Active-linking sections owned by `030-features-panel-active-linking`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Feature discovery/listing - Implement server endpoint to scan `specs/` directory and return feature metadata using filesystem APIs |
| FR-002 | File viewer + markdown rendering - Create Vue component with loading/error states using `useMarkdown` composable for rendering |
| FR-003 | Safe server path handling - Validate file paths server-side to prevent directory traversal, enforce `.md` extension filtering |
| FR-004 | Task checkbox progress extraction + card metadata display placement - Parse markdown AST to count `- [ ]` and `- [x]` patterns, display counts in FeatureCard component |

## Technical Approach

### Architecture Decisions
- Use Nitro server endpoints for filesystem access (Node.js fs APIs)
- Vue 3 composition API for reactive state management
- Tailwind CSS for consistent styling
- TypeScript for type safety across client/server boundary

### Key Components
1. **FeaturesPanel.vue**: Main container managing feature list state
2. **FeatureCard.vue**: Individual feature display with task progress metadata
3. **SpecFileViewer.vue**: Markdown file viewer with load/error/retry states
4. **useMarkdown.ts**: Shared composable for markdown parsing/rendering

### Data Flow
1. Client requests feature list → Server scans `specs/` directory
2. Server returns feature metadata → Client displays in panel
3. User selects file → Server validates path and reads file
4. Server returns markdown content → Client renders with error handling
