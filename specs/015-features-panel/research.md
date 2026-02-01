# Research: Features Panel (015)

**Date**: 2026-02-08
**Status**: Complete — all items resolved from codebase analysis

## R-001: Markdown Rendering Pipeline

**Question**: Which markdown library and XSS sanitization approach to use?

**Decision**: Use `marked@15.0.12` for parsing + `dompurify@3.2.0` for sanitization.

**Rationale**: Both libraries are already dependencies in the project (`package.json`). The `useMarkdown` composable (`composables/useMarkdown.ts`) wraps them in a clean API: `marked.parse()` → `DOMPurify.sanitize()`. This pipeline handles all standard markdown elements (headings, code blocks, tables, lists, blockquotes, checkboxes) and prevents XSS by stripping dangerous HTML before DOM insertion.

**Alternatives Considered**:
- `markdown-it`: More plugin-friendly but would add a new dependency. `marked` is already established in the project.
- Raw `v-html` without sanitization: Unacceptable — XSS risk (FR-006, SC-007).

---

## R-002: State Management for Feature Discovery

**Question**: Should features have their own Pinia store, or use local component state?

**Decision**: Use local component state (`ref<Feature[]>`) within `FeaturesPanel.vue`.

**Rationale**: Feature data is ephemeral (fetched fresh from the API on mount and refresh). There is no cross-component state sharing needed — the features list is only consumed by the FeaturesPanel and its child components (FeatureCard, SpecFileViewer). This follows the existing pattern where self-contained panels manage their own data (e.g., `GitGraph.vue` manages git state locally before the store was introduced).

**Alternatives Considered**:
- Dedicated Pinia `features` store: Would add unnecessary indirection. The data lifecycle is simple (fetch → display → discard on unmount). No other component needs to read features state.
- Shared composable: Unnecessary — only one consumer.

---

## R-003: Cascade Pipeline Integration

**Question**: How does the cascade pipeline (Plan → Tasks → Implement) integrate with the chat streaming system?

**Decision**: Use the existing `enableCascade()` function from `useChatStream` composable to queue remaining steps. The cascade state is stored per-conversation in a `Map<conversationId, { featureId, queue }>`.

**Rationale**: The cascade infrastructure already exists in `composables/useChatStream.ts` (line 604). When a speckit command completes, the stream handler checks for queued cascade steps and auto-triggers the next one. This is used directly from `FeaturesPanel.vue`'s `handleCascade()` method.

**Alternatives Considered**:
- Server-side orchestration: Would require maintaining pipeline state on the server and add complexity. Client-side queue is simpler and sufficient since the user can observe progress in real-time.
- Separate cascade composable: Unnecessary — the cascade logic is tightly coupled with stream lifecycle and belongs in `useChatStream`.

---

## R-004: Conversation Reuse and Feature Linking

**Question**: How should conversations be linked to features, and how does reuse work?

**Decision**: The `Conversation` interface already has a `featureId?: string` field. The chat store provides `findConversationByFeature(featureId)` to find existing conversations linked to a feature. The `isConversationStreaming(id)` check prevents reusing a conversation that is actively streaming.

**Rationale**: The conversation-feature linkage is already a first-class concept in the data model (`types/chat.ts`, line 186). The reuse logic in `FeaturesPanel.vue`'s `handleCascade()` method checks:
1. Is Shift held? → Force new conversation
2. Does a conversation exist for this feature? → Reuse it (unless streaming)
3. Otherwise → Create new conversation with `featureId` set

**Alternatives Considered**:
- Multiple conversations per feature with selection UI: Over-engineering for the current use case. Single reuse is sufficient.

---

## R-005: 3-View Navigation State Machine

**Question**: What pattern should the features → files → content navigation use?

**Decision**: Simple `ref<'features' | 'files' | 'content'>` state machine with `selectedFeatureId` and `selectedFileName` tracking the current selection context.

**Rationale**: The navigation is strictly linear (features → files → content) with single back steps. A simple ref-based state machine is sufficient and avoids over-engineering with a router or complex state management. This is already implemented in `FeaturesPanel.vue`.

**Alternatives Considered**:
- Vue Router with nested routes: Overkill — this is panel-internal navigation, not page-level routing.
- Stack-based navigation: More complex than needed for a 3-level depth.

---

## R-006: Server-Side Security (Path Traversal)

**Question**: How to protect against path traversal and unauthorized file access?

**Decision**: The server API route (`server/api/specs/[featureId]/[...filename].get.ts`) validates both `featureId` and `filename` parameters:
1. Reject if either contains `..` (path traversal)
2. Reject if filename doesn't end with `.md`
3. Construct path using `join(projectDir, 'specs', featureId, filename)` — constrained to specs directory

**Rationale**: These three checks cover the main attack vectors. The `node:path.join` resolves paths cleanly, and the `..` check prevents escaping the specs directory. The `.md` extension check prevents serving arbitrary files.

**Alternatives Considered**:
- `realpath` resolution and prefix check: More robust but adds filesystem I/O. The current approach is sufficient for the threat model (local development tool).
- Allowlist of feature IDs: Too restrictive — would require updating the list as features are added.

---

## R-007: Active Feature Highlighting and Auto-Scroll

**Question**: How to highlight and auto-scroll to the active feature card?

**Decision**: Use a `watch` on `chatStore.activeConversationId` that resolves the feature ID from the active conversation's `featureId` field. Template refs (`featureRefs`) map feature IDs to DOM elements for `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.

**Rationale**: The active conversation always has a `featureId` if it was created from the features panel. The watch triggers on conversation switch, and `nextTick` ensures the DOM is ready before scrolling. This is already implemented in `FeaturesPanel.vue`.

**Alternatives Considered**:
- IntersectionObserver: Unnecessary — we need to scroll *to* an element, not detect when one is visible.
- CSS-only highlighting: Would work for styling but not for auto-scrolling.

---

## R-008: Feature Name Extraction

**Question**: How to extract the feature display name from spec files?

**Decision**: Parse the `spec.md` file for a `# Feature Specification: {name}` heading pattern. Fall back to converting the directory name to title case (strip numeric prefix, convert hyphens to spaces, capitalize first letters).

**Rationale**: Most spec files follow the standard template with this heading. The fallback ensures features without spec files or with non-standard headings still have readable names. This is implemented in `server/api/specs/features.get.ts`'s `extractFeatureName()` function.

**Alternatives Considered**:
- YAML frontmatter: Would require all specs to have frontmatter. The heading approach works with the existing template.
- Separate metadata file: Adds maintenance burden for no benefit.
