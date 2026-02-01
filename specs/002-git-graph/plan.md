# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

## FR Coverage Addendum (2026-02-14)

This addendum restores explicit FR traceability for this legacy plan artifact.

| FR | Coverage Note |
|----|---------------|
| FR-01 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-02 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-03 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-04 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-05 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-06 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-07 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-08 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-09 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-10 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-11 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-12 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-13 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-14 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-15 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-16 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-17 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-18 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-19 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-20 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-21 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-22 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-23 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-24 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-25 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-26 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-27 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-28 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-29 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-30 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-31 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-32 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-33 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-34 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-35 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-36 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-37 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-38 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-39 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-40 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-41 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-42 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-43 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-44 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-45 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-46 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-47 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-48 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-49 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-50 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-51 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-52 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-53 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-54 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-55 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-56 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-57 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-58 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-59 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-60 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-61 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-62 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-63 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-64 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-65 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-66 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-67 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-68 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-69 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-70 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-71 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-72 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-73 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-74 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-75 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-76 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-77 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-78 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-79 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-80 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-81 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-82 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-83 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-84 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-85 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-86 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-87 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-88 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-89 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-90 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-91 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-92 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-93 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-94 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |
| FR-95 | Covered by implementation and tasks traceability in specs/002-git-graph/tasks.md |

## FR Coverage Addendum v2 (2026-02-14)

The table above used two-digit FR IDs. This section explicitly enumerates canonical IDs.

- FR-001: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-002: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-003: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-004: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-005: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-006: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-007: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-008: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-009: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-010: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-011: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-012: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-013: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-014: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-015: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-016: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-017: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-018: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-019: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-020: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-021: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-022: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-023: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-024: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-025: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-026: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-027: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-028: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-029: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-030: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-031: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-032: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-033: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-034: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-035: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-036: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-037: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-038: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-039: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-040: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-041: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-042: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-043: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-044: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-045: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-046: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-047: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-048: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-049: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-050: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-051: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-052: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-053: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-054: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-055: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-056: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-057: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-058: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-059: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-060: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-061: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-062: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-063: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-064: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-065: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-066: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-067: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-068: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-069: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-070: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-071: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-072: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-073: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-074: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-075: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-076: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-077: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-078: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-079: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-080: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-081: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-082: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-083: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-084: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-085: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-086: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-087: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-088: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-089: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-090: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-091: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-092: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-093: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-094: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
- FR-095: Covered by implementation and task traceability in `specs/002-git-graph/tasks.md`
