# Implementation Tasks: Features Panel

**Branch**: `015-features-panel` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Summary

Implementation tasks for the Features Panel component that discovers feature specs from the `specs/` directory, displays them as interactive cards with status badges, provides 3-view navigation (features → files → content), and integrates with the cascade pipeline system for speckit commands.

## Dependencies

All tasks can be executed in parallel as they work on separate files. The only dependency is that Phase 1 should be completed before Phase 2, and Phase 2 before Phase 3.

## Phase 1: Foundation & API Layer

### T001: Create type definitions
- [ ] Create `types/spec-viewer.ts` with Feature, SpecFile, and response interfaces [FR-001, FR-002, FR-003, FR-005]
- [ ] Define Feature interface with id, name, files[], hasSpec, hasPlan, hasTasks properties [FR-001, FR-002, FR-003]
- [ ] Define SpecFile interface with filename and label properties [FR-005]
- [ ] Add response types for FeaturesListResponse and SpecFileContentResponse [FR-001]
- [ ] Export all types for use in components and API routes

### T002: Implement feature discovery API endpoint
- [ ] Create `server/api/specs/features.get.ts` endpoint [FR-001]
- [ ] Scan `specs/` directory for feature subdirectories [FR-001]
- [ ] Extract feature name from spec.md heading or derive from directory name [FR-002]
- [ ] Recursively find all .md files and map to SpecFile objects with labels [FR-005]
- [ ] Sort features by directory name in natural alphanumeric order [FR-001]
- [ ] Return FeaturesListResponse with computed hasSpec/hasPlan/hasTasks flags [FR-003]

### T003: Implement file content API endpoint
- [ ] Create `server/api/specs/[featureId]/[...filename].get.ts` endpoint [FR-016, FR-017]
- [ ] Validate featureId and filename parameters for path traversal (`..`) [FR-016]
- [ ] Verify filename ends with `.md` extension [FR-017]
- [ ] Read file content from filesystem using safe path construction [FR-016, FR-017]
- [ ] Return 400 for validation failures, 404 for missing files [FR-016]
- [ ] Include proper error messages for client error handling [FR-018]

### T004: Create markdown rendering composable
- [ ] Create `composables/useMarkdown.ts` wrapping marked and dompurify [FR-006]
- [ ] Configure marked options for standard markdown elements [FR-006]
- [ ] Configure DOMPurify for safe HTML output [FR-006]
- [ ] Export renderMarkdown function that returns sanitized HTML [FR-006]
- [ ] Add TypeScript types for function signature

## Phase 2: Core Components

### T005: Create SpecFileViewer component
- [ ] Create `components/features/SpecFileViewer.vue` with props for featureId and filename [FR-005]
- [ ] Implement loading state while fetching content [FR-018]
- [ ] Implement error state with retry button for failed loads [FR-018]
- [ ] Render markdown content using useMarkdown composable [FR-006]
- [ ] Add edit mode toggle with textarea, Save, and Cancel buttons [FR-018A]
- [ ] Implement save functionality via PUT request to specs API [FR-018A]
- [ ] Show success/error feedback after save attempts [FR-018, FR-018A]

### T006: Create FeatureCard component
- [ ] Create `components/features/FeatureCard.vue` with Feature prop [FR-002]
- [ ] Display feature name and ID in card header [FR-002]
- [ ] Show color-coded status badges (green spec, cyan plan, yellow tasks) [FR-003]
- [ ] Add action buttons (Clarify, Plan, Tasks, Run, Analyze) with conditional visibility [FR-007, FR-008]
- [ ] Implement button visibility rules based on spec/plan/tasks existence [FR-008]
- [ ] Add chat icon button that emits openChat event [FR-012]
- [ ] Emit cascade events with action type and feature ID [FR-007]
- [ ] Apply highlighted styling when isActive prop is true [FR-013]

### T007: Create FeaturesPanel component - structure
- [ ] Create `components/features/FeaturesPanel.vue` with 3-view state machine [FR-004]
- [ ] Set up reactive state for currentView, selectedFeatureId, selectedFileName [FR-004]
- [ ] Implement features list view with refresh button [FR-001, FR-015]
- [ ] Add search input for filtering features by name or ID [FR-019]
- [ ] Implement files list view showing .md files for selected feature [FR-005]
- [ ] Implement content view integrating SpecFileViewer component [FR-004, FR-006]
- [ ] Add back navigation between views [FR-004]

### T008: Integrate cascade pipeline logic
- [ ] Add handleCascade method to process action button clicks [FR-009]
- [ ] Check for existing conversation with matching featureId [FR-010]
- [ ] Support Shift+click to force new conversation creation [FR-011]
- [ ] Map action types to cascade queues (plan→[tasks,implement], tasks→[implement]) [FR-009]
- [ ] Special handling for analyze action with better-spec prerequisite [FR-009A]
- [ ] Integrate with useChatStream to enable cascade and send messages [FR-009]
- [ ] Handle conversation selection and renaming [FR-010]

## Phase 3: Active Feature Integration

### T009: Implement active feature highlighting
- [ ] Watch chatStore.activeConversationId for changes [FR-013]
- [ ] Resolve active feature ID from conversation's featureId property [FR-013]
- [ ] Pass isActive prop to relevant FeatureCard component [FR-013]
- [ ] Set up template refs for feature cards keyed by feature ID [FR-014]
- [ ] Implement auto-scroll to active card using scrollIntoView [FR-014]
- [ ] Handle edge case when active conversation has no featureId [FR-013]

### T010: Add chat icon functionality
- [ ] Handle openChat event from FeatureCard in FeaturesPanel [FR-012]
- [ ] Create new conversation with featureId association [FR-012]
- [ ] Set conversation title to "spec: {featureId}" format [FR-012]
- [ ] Select the new conversation in chat store [FR-012]
- [ ] Ensure chat icon only shows when spec file exists [FR-012]

### T011: Implement feature selection sync
- [ ] Emit feature selection events when a feature card is clicked [FR-020]
- [ ] Integrate with Git Graph store to sync selected feature [FR-020]
- [ ] Clear Git Graph selection when feature selection is cleared [FR-020]
- [ ] Handle bidirectional sync (Git Graph selection updates Features Panel) [FR-020]

### T012: Create PUT endpoint for file updates
- [ ] Create `server/api/specs/[featureId]/[...filename].put.ts` endpoint [FR-018A]
- [ ] Validate featureId and filename for security (same as GET) [FR-016, FR-017]
- [ ] Accept content in request body [FR-018A]
- [ ] Write updated content to filesystem [FR-018A]
- [ ] Return success response or appropriate error codes [FR-018A]
- [ ] Ensure atomic writes to prevent corruption [FR-018A]

## Testing Checkpoints

### Checkpoint 1 (After Phase 1)
- API endpoints return correct feature data
- Path traversal attempts are rejected
- Type definitions compile without errors

### Checkpoint 2 (After Phase 2)
- Feature cards display with correct badges
- Action buttons show/hide based on file existence
- Markdown renders with proper styling
- Edit/save flow works end-to-end

### Checkpoint 3 (After Phase 3)
- Active feature highlights and scrolls correctly
- Chat conversations link to features properly
- Feature selection syncs with Git Graph
- All FRs are satisfied with no regressions

## Child Spec Coordination

Note: While this parent spec defines the complete feature, active execution has been split into child specs:
- `028-features-panel-core`: Core panel, discovery, navigation (T001-T007)
- `029-features-panel-actions`: Cascade actions and chat integration (T008, T010)
- `030-features-panel-active-linking`: Active highlighting and Git Graph sync (T009, T011)
