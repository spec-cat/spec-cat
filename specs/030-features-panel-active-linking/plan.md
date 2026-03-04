# Implementation Plan: Features Panel Active Linking

**Branch**: `030-features-panel-active-linking` | **Date**: 2026-02-16 | **Spec**: `specs/030-features-panel-active-linking/spec.md`

## Summary

Isolate active-link context behavior into a dedicated lane to avoid `FeaturesPanel.vue` contention. This feature enables automatic visual synchronization between the active conversation and its associated feature card in the features panel.

## Technical Context

### Dependencies
- Vue 3.5+ (reactive state management)
- Pinia stores (`chat.ts`, `gitGraph.ts`)
- Tailwind CSS (active state styling)
- IntersectionObserver API (scroll behavior)

### Constraints
- Must not conflict with parallel work on `029-features-panel-actions`
- Active state must be deterministic and immediate
- No server round-trips for highlight state

## Project Structure

```
components/features/
├── FeaturesPanel.vue      # Container with scroll logic and active mapping
└── FeatureCard.vue        # Individual card with active styling
stores/
├── chat.ts                # Source of activeConversationId and featureId
└── gitGraph.ts            # Feature selection state sync target
```

## Implementation Approach

### FR-001: Active Conversation Highlight
- Use computed property in `FeaturesPanel.vue` to derive active feature from chat store
- Pass `isActive` prop to `FeatureCard.vue` based on featureId match
- Apply conditional CSS classes for highlight (border, background, shadow)

### FR-002: Auto-Scroll Behavior
- Implement `scrollIntoView` with smooth behavior when active feature changes
- Use Vue's `watch` on computed active feature ID
- Add scroll margin to ensure card is fully visible with padding

### FR-003: Git Graph Synchronization
- Create bidirectional sync between features panel and git graph selection
- Listen to git graph store's `selectedFeatureId` changes
- Update git graph when feature card is clicked in panel

## Key Design Decisions

1. **State Source of Truth**: Chat store remains authoritative for active conversation
2. **Styling Strategy**: Use Tailwind's state variants (e.g., `data-[active=true]:`)
3. **Scroll Timing**: Defer scroll until after DOM update using `nextTick`
4. **Performance**: Use `shallowRef` for feature list to avoid deep reactivity

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Active highlight mapping via computed prop and conditional styling |
| FR-002 | Auto-scroll behavior with smooth animation and proper margins |
| FR-003 | Git Graph sync behavior through store watchers and event handlers |
