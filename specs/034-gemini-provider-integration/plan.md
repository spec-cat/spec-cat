# Implementation Plan: Gemini Provider Integration

**Branch**: `[034-gemini-provider-integration]` | **Date**: 2026-03-02 | **Spec**: [034-gemini-provider-integration/spec.md]

## Summary

Implement the `AIProvider` abstraction for the Gemini CLI, allowing users to leverage Gemini models within the Spec Cat workspace using a streaming JSON interface similar to the existing Claude Code integration.

## Technical Context

**Language/Version**: TypeScript 5.6+, Node.js  
**Primary Dependencies**: `node:child_process`, `AIProvider` interface  
**Project Type**: Web Application Backend (Nitro)  

## Constitution Check

*GATE: Passed. Integration adheres to existing abstraction patterns without introducing new dependencies or storage paradigms.*

## Functional Requirements Coverage

This plan addresses all functional requirements from spec.md:

- **FR-001** (AIProvider interface): Implemented via `geminiProvider.ts` following existing patterns
- **FR-002** (CLI location): Handled by `gemini.ts` utility with PATH and common directory search
- **FR-003** (CLI spawn with stream-json): Core functionality in `geminiProvider.ts` spawn configuration
- **FR-004** (JSON parsing to UIStreamEvent): Stream parsing logic in `geminiProvider.ts`
- **FR-005** (Three model support): Model definitions in `types/gemini.ts` (Flash, Pro, Experimental)
- **FR-006** (Registry integration): Registration in `aiProviderRegistry.ts`

## Project Structure

### Documentation (this feature)

```text
specs/034-gemini-provider-integration/
├── plan.md
├── spec.md
├── tasks.md
└── checklist.md
```

### Source Code

```text
types/
└── gemini.ts               # Gemini model types and configurations

server/
└── utils/
    ├── gemini.ts           # Utility to locate the Gemini CLI
    ├── geminiProvider.ts   # Core AIProvider implementation for Gemini
    └── aiProviderRegistry.ts # Modified to register geminiProvider
```

**Structure Decision**: The implementation will mirror the existing `claudeProvider.ts` structure, creating dedicated type definitions and utility files for Gemini to maintain a clean abstraction.
