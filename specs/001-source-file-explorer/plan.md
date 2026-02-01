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
**Performance Goals**: Initial tree load < 500ms for medium projects, file open feedback < 200ms for small files  
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

## FR Coverage Matrix

| FR | Description | Planned Files |
|----|-------------|---------------|
| FR-001 | Open/close source explorer modal | `stores/layout.ts`, `components/project/SourceExplorerModal.vue` |
| FR-002 | Show project hierarchy in left pane | `server/api/project/tree.get.ts`, `components/project/SourceTree.vue` |
| FR-003 | Expand/collapse folders | `composables/useSourceExplorer.ts`, `components/project/SourceTree.vue` |
| FR-004 | Select file and view content | `server/api/project/file.get.ts`, `components/project/SourceViewer.vue` |
| FR-005 | Read-only content rendering | `components/project/SourceViewer.vue` |
| FR-006 | Unsupported/oversized/unavailable file messaging | `server/api/project/file.get.ts`, `components/project/SourceViewer.vue` |
| FR-007 | Loading + error states for tree/content fetch | `composables/useSourceExplorer.ts`, `components/project/SourceExplorerModal.vue` |

## Complexity Tracking

No constitution violations identified.
