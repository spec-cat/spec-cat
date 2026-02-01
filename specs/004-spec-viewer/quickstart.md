# Quickstart: Spec Viewer

## Prerequisites

- Spec Cat dev server running (`pnpm dev`)
- `specs/` directory with feature subdirectories containing `.md` files

## What Gets Built

1. **FeaturesPanel.vue** — Restores the feature list in Column 2 with three view states:
   - Feature list (default) — shows all features with cascade buttons
   - File list — shows available spec files when a feature is clicked
   - File viewer — renders markdown content when a file is clicked

2. **FeatureCard.vue** — Individual feature card with:
   - Feature name and ID
   - File availability badges (spec, plan, tasks)
   - Cascade buttons (Clarify, Plan, Tasks, Run)
   - Chat icon for spec-linked conversations
   - Active highlighting when conversation matches

3. **SpecFileViewer.vue** — Markdown viewer that:
   - Fetches raw content from server API
   - Renders via marked + dompurify
   - Styled with retro-terminal theme

4. **Server endpoints**:
   - `GET /api/specs/features` — Lists features with file metadata
   - `GET /api/specs/:featureId/:filename` — Returns raw markdown content

## Key Integration Points

- **Chat Store**: `findConversationByFeature()`, `createConversation({ featureId })`
- **Chat Stream**: `enableCascade()`, `sendMessage()` for cascade pipeline
- **Toast**: `useToast()` for error notifications
- **Layout**: Replaces existing `<FeaturesPanel />` in `layouts/default.vue` Column 2

## Quick Verification

After implementation, verify:
1. Feature list appears in Column 2 with all `specs/` features
2. Click a feature → see file list (spec.md, plan.md, etc.)
3. Click a file → see rendered markdown
4. Click back → return to feature list (one click)
5. Cascade "Plan" button → creates conversation and sends `/speckit.plan`
6. Active conversation with featureId → corresponding card is highlighted
