# Tasks: Spec Viewer

## Phase 1: Server Infrastructure [FR-017, FR-018, FR-022]

- [X] T001: Create `server/api/specs/features.get.ts` endpoint [FR-017]
  - Scan `specs/` directory for feature directories
  - Extract display names from spec.md titles or directory names
  - Return Feature[] with id, name, and file availability flags

- [X] T002: Create `server/api/specs/[featureId]/[...filename].get.ts` endpoint [FR-018]
  - Read requested markdown file content
  - Validate path to prevent directory traversal
  - Return raw markdown content

- [X] T003: Create `server/api/specs/[featureId]/[...filename].put.ts` endpoint [FR-020, FR-022]
  - Accept markdown content in request body
  - Validate path security (no traversal outside specs/)
  - Write content to disk
  - Return success/error status

## Phase 2: Core Components [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-015, FR-016]

- [X] T004: Create `types/spec-viewer.ts` with Feature and SpecFile types [FR-001, FR-002]

- [X] T005: Create `composables/useMarkdown.ts` for client-side markdown rendering [FR-005]
  - Use marked library for parsing
  - Use dompurify for sanitization
  - Export renderMarkdown function

- [X] T006: Create `components/features/FeatureCard.vue` [FR-002, FR-015, FR-016]
  - Display feature name and ID
  - Show file availability badges (spec, plan, tasks)
  - Placeholder for cascade buttons (Phase 3)
  - Placeholder for chat icon (Phase 4)
  - Apply retro-terminal theme classes [FR-015]

- [X] T007: Create `components/features/SpecFileViewer.vue` [FR-004, FR-005]
  - Fetch file content from server endpoint
  - Render markdown using useMarkdown composable
  - Display loading and error states
  - Include view/edit mode toggle button

- [X] T008: Create `components/features/FeaturesPanel.vue` main container [FR-001, FR-003, FR-006, FR-014]
  - Implement view state machine (features → files → content)
  - Fetch and display features list
  - Handle feature card clicks to show file list [FR-003]
  - Handle file clicks to show content [FR-004]
  - Implement back navigation [FR-006]
  - Add refresh button [FR-014]

## Phase 3: Cascade Integration [FR-007, FR-008, FR-009, FR-010, FR-011]

- [X] T009: Add cascade buttons to FeatureCard.vue [FR-007]
  - Show Clarify button when spec.md exists
  - Show Plan button when spec.md exists
  - Show Tasks button when plan.md exists
  - Show Run button when tasks.md exists

- [X] T010: Implement cascade button click handlers [FR-008, FR-009, FR-010]
  - Use chatStore.findConversationByFeature
  - Create conversation if not found (with featureId)
  - Handle Shift+click for new conversation [FR-010]
  - Send appropriate speckit command

- [X] T011: Implement Plan cascade chaining [FR-009]
  - Enable cascade mode for Plan → Tasks → Implement
  - Use chatStream.enableCascade with proper params

- [X] T012: Add chat icon to FeatureCard.vue [FR-011]
  - Display chat bubble icon when spec.md exists
  - Create new spec-linked conversation on click
  - Set conversation title to "spec: {feature-id}"

## Phase 4: Active Feature Highlighting [FR-012, FR-013]

- [X] T013: Implement active feature highlighting in FeatureCard.vue [FR-012]
  - Add computed property checking activeConversation.featureId
  - Apply highlight styles when matched
  - Use distinct border/background color

- [X] T014: Implement auto-scroll to active feature [FR-013]
  - Watch activeConversationId in FeaturesPanel.vue
  - Find matching feature card element
  - Call scrollIntoView when feature changes

## Phase 5: Edit Mode [FR-019, FR-020, FR-021]

- [X] T015: Add edit mode UI to SpecFileViewer.vue [FR-019]
  - Add Edit button in view mode
  - Switch to textarea with raw markdown on click
  - Add Save and Cancel buttons in edit mode

- [X] T016: Implement save functionality [FR-020]
  - Call PUT endpoint with modified content
  - Show loading state during save
  - Switch back to view mode on success
  - Show error toast on failure

- [X] T017: Implement cancel functionality [FR-021]
  - Discard textarea changes
  - Restore original content
  - Switch back to view mode

## Phase 6: Integration & Polish

- [X] T018: Replace placeholder in `layouts/default.vue` Column 2
  - Remove "Spec viewer coming soon" text
  - Mount new FeaturesPanel component

- [X] T19: Test full user flows
  - Feature list → file list → content view → back navigation
  - All cascade buttons with conversation creation
  - Edit mode save/cancel flows
  - Active feature highlighting

## Checkpoints

**CP1**: After Phase 1 - Server endpoints return correct data
**CP2**: After Phase 2 - Basic spec viewing works (list → files → content)
**CP3**: After Phase 3 - Cascade buttons create conversations and send commands
**CP4**: After Phase 5 - Edit mode allows modifying spec files
**CP5**: After Phase 6 - Full feature complete and integrated

## Notes

- Child spec references (028, 029, 030) contain implementation details for UI components that can be consulted during development
- Path traversal protection is critical for security in GET/PUT endpoints
- Markdown rendering must sanitize content to prevent XSS
