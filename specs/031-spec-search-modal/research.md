# Research: Command Palette Spec Search

**Date**: 2026-02-22  
**Feature**: `/home/khan/src/brick2/specs/031-spec-search-modal/spec.md`

## Decision: Shortcut Activation Scope

**Decision**: Always open the modal on `Ctrl+K`/`Cmd+K`, regardless of focused element.

**Rationale**: This is explicitly clarified in the spec and ensures consistent keyboard-driven behavior with no context-dependent surprises.

**Alternatives considered**:
- Suppress in editable fields (rejected by clarification).
- Allow only in non-input contexts (insufficient for requested behavior).

## Decision: Search Trigger Strategy

**Decision**: Execute search while typing with a fixed 400ms debounce.

**Rationale**: Delivers responsive discovery while reducing excessive request frequency; aligns with clarified FR-003.

**Alternatives considered**:
- Submit-only search (slower interaction loop).
- Hybrid submit + live search (more complexity without added requirement value).

## Decision: Default Search Scope

**Decision**: Run searches across all features by default (no feature filter unless explicitly added later).

**Rationale**: Matches command-palette “jump anywhere” expectations and clarified requirement scope.

**Alternatives considered**:
- Active-feature-only default.
- Dual-mode toggle at initial release.

## Decision: Unavailable Selection Recovery

**Decision**: If a selected result cannot be resolved, keep modal open and show an inline “feature unavailable” message.

**Rationale**: Preserves user context and enables immediate retry/refinement without resetting the search workflow.

**Alternatives considered**:
- Close modal with toast-only error.
- Auto-refresh then auto-retry selection.

## Decision: Keyboard Result Navigation Model

**Decision**: Use `ArrowUp`/`ArrowDown` for focus movement, `Enter` to select, and `Escape` to close.

**Rationale**: Standard command palette interaction model with clear accessibility and testability.

**Alternatives considered**:
- Enter-only keyboard handling.
- Tab-only navigation.

## Clarification Resolution Summary

All clarification-driven behavior decisions are resolved and reflected in this feature’s design artifacts. No `NEEDS CLARIFICATION` entries remain.
