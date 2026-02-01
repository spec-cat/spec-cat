# Research: Spec Viewer

## R-001: View State Management Approach

**Decision**: Use local component refs (`currentView`, `selectedFeatureId`, `selectedFileName`) in FeaturesPanel.vue rather than a dedicated Pinia store.

**Rationale**: The view state is panel-local and doesn't need to be shared across components or persisted. Existing patterns (ConversationsPanel search state, ChatPanel view state) use local refs for panel-specific UI state. A store would add unnecessary complexity.

**Alternatives considered**:
- Pinia store for spec viewer state — rejected because no cross-component access needed
- URL-based routing (query params) — rejected because Column 2 is a panel, not a routed page

## R-002: Markdown Rendering Strategy

**Decision**: Use `marked` (v15.0.12) for parsing + `dompurify` (v3.2.0) for sanitization. Create a client-only composable `useMarkdown()` that returns a `renderMarkdown(content: string): string` function.

**Rationale**: Both libraries are already in package.json (from 007-claude-code-chat spec). The marked library handles all required markdown features (headings, lists, tables, code blocks, bold/italic, links) out of the box. DOMPurify prevents XSS from user-controlled spec content.

**Alternatives considered**:
- Server-side rendering of markdown — rejected because it adds latency and the client has the libraries already
- Using the existing regex-based rendering from ChatMessage.vue — rejected because it doesn't support tables, nested lists, or full markdown spec

## R-003: Server API Design for Spec Files

**Decision**: Two endpoints: `GET /api/specs/features` for the list, `GET /api/specs/[featureId]/[...filename]` for file content. Use Nuxt catch-all route parameter `[...filename]` to support nested paths like `checklists/requirements.md`.

**Rationale**: Clean separation — list endpoint scans directory once, content endpoint reads a single file. Catch-all parameter handles subdirectory files naturally. Follows existing Nuxt server API patterns (e.g., `server/api/chat/worktree.post.ts`).

**Alternatives considered**:
- Single endpoint returning everything — rejected because loading all file contents upfront is wasteful
- WebSocket-based file watching — rejected because spec files change infrequently; manual refresh button (FR-014) is sufficient

## R-004: Feature Name Extraction

**Decision**: Extract feature display name from the `# Feature Specification: {name}` heading in spec.md if available. Fall back to converting directory name: strip numeric prefix, replace hyphens with spaces, title-case.

**Rationale**: Spec.md titles provide human-readable names ("Spec Viewer" vs "spec-viewer"). The fallback ensures features without spec.md still have readable names.

**Alternatives considered**:
- Only use directory names — rejected because spec titles are more readable
- Read a manifest/config file — rejected because no such convention exists

## R-005: Component Decomposition

**Decision**: Three components: `FeaturesPanel.vue` (container with view state machine), `FeatureCard.vue` (individual card with cascade/chat), `SpecFileViewer.vue` (markdown renderer).

**Rationale**: Matches existing codebase pattern of panel + child components. FeatureCard isolates cascade logic complexity. SpecFileViewer is reusable and can be tested independently for markdown rendering quality.

**Alternatives considered**:
- Single monolithic component — rejected because the old FeaturesPanel was 338 lines and hard to maintain
- More granular decomposition (FileList, FileBadges, CascadeButtons) — rejected as over-engineering for this scope

## R-006: Cascade Button File-Availability Logic

**Decision**: Reuse the exact same conditional logic from the old FeaturesPanel:
- "Clarify" — visible when feature has spec.md
- "Plan" — visible when feature has spec.md
- "Tasks" — visible when feature has plan.md
- "Run" — visible when feature has tasks.md

**Rationale**: This is the existing behavior users expect (FR-007). Cascade chaining (Plan → Tasks → Implement) uses the existing `enableCascade()` from useChatStream.ts — no new logic needed.

**Alternatives considered**: None — this is a restoration of existing behavior, not a new design decision.
