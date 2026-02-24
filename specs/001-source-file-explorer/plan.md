# Implementation Plan: Project Source File Explorer Modal

**Branch**: `001-source-file-explorer` | **Date**: 2026-02-14 | **Spec**: [specs/001-source-file-explorer/spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-source-file-explorer/spec.md`
**Status**: Draft (not yet implemented)

## Summary

Add a project source file explorer modal with a split layout: navigable file tree on the left and read-only file content viewer on the right. The feature requires safe server APIs for directory listing and file reads scoped to the project root, plus client UI state for expand/collapse, selection, loading, and display errors for unsupported/oversized/missing files.

## Technical Context

**Language/Version**: TypeScript 5.6+, Nuxt 3.16+, Vue 3.5+  
**Primary Dependencies**: Nuxt server routes, Pinia store patterns, existing markdown/highlight utilities  
**Storage**: N/A (ephemeral UI state only)  
**Testing**: Manual QA + existing typecheck (`pnpm typecheck`)  
**Target Platform**: Browser UI + Nitro server  
**Project Type**: Web app (Nuxt full-stack)  
**Performance Goals**: Feature must satisfy FR-009 (explicit success/error state within 2 seconds); internal stretch target is < 500ms tree load and < 200ms file-open feedback for small files  
**Constraints**: Read-only access, project-root scoped paths only, size guard for large files, no binary rendering  
**Scale/Scope**: Typical dev repo trees (`specs/`, `components/`, `server/`, etc.)

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| User Control First | PASS | User explicitly opens/closes modal and selects files |
| Simplicity Over Complexity | PASS | Read-only explorer, no editing features in this scope |
| Type Safety | PASS | Tree/file payloads are typed end-to-end |
| Nuxt 3 + Pinia | PASS | Uses existing app architecture and route conventions |

## Project Structure

### Documentation (this feature)

```text
specs/001-source-file-explorer/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
# API
server/api/project/tree.get.ts              # Read directory tree (project-root scoped)
server/api/project/file.get.ts              # Read file content with safety checks

# Server Utils
server/utils/projectDir.ts                  # Canonical path resolution and root-scope guards

# Types
types/sourceExplorer.ts                     # FileNode, file content response, errors

# Store / Composable
stores/layout.ts                            # Modal open/close state integration
composables/useSourceExplorer.ts            # Tree, selection, loading, expand/collapse state

# UI
components/project/SourceExplorerModal.vue  # Modal container + split pane layout
components/project/SourceTree.vue           # Recursive tree view
components/project/SourceViewer.vue         # Read-only content pane + empty/error states
```

## Implementation Approach

1. Add shared server-side path guard utilities to ensure all tree/file reads remain scoped to the active project root.
2. Implement read-only API endpoints for tree and file content retrieval with explicit unsupported/oversized/missing-file error contracts.
3. Build modal, tree, and viewer UI components backed by a dedicated source-explorer composable handling selection, expansion state, loading, and errors.
4. Validate the feature against all acceptance scenarios, edge cases, and performance targets defined in the spec.

## FR Coverage Matrix

| Requirement | Planned Files |
|-------------|---------------|
| FR-001 | `stores/layout.ts`, `components/project/SourceExplorerModal.vue` |
| FR-002 | `server/api/project/tree.get.ts`, `components/project/SourceTree.vue`, `composables/useSourceExplorer.ts` |
| FR-003 | `composables/useSourceExplorer.ts`, `components/project/SourceTree.vue` |
| FR-004 | `server/api/project/file.get.ts`, `composables/useSourceExplorer.ts`, `components/project/SourceViewer.vue` |
| FR-005 | `components/project/SourceViewer.vue` |
| FR-006 | `server/api/project/file.get.ts`, `components/project/SourceViewer.vue` |
| FR-007 | `composables/useSourceExplorer.ts`, `components/project/SourceExplorerModal.vue`, `components/project/SourceViewer.vue` |
| FR-008 | `server/utils/projectDir.ts`, `server/api/project/tree.get.ts`, `server/api/project/file.get.ts` |
| FR-009 | `server/api/project/tree.get.ts`, `server/api/project/file.get.ts`, `components/project/SourceExplorerModal.vue` |

## Design Artifacts

- `specs/001-source-file-explorer/spec.md` is the authoritative definition of user stories, acceptance scenarios, and requirements for this feature.
- No additional generated artifacts (`research.md`, `data-model.md`, or `contracts/`) are required for this scope.

## Complexity Tracking

No constitution violations identified.
