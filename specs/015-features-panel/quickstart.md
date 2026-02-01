# Quickstart: Features Panel (015)

## Overview

The Features Panel is a client-side panel component (Column 2 in the 4-column layout) that discovers feature specs from the `specs/` directory via server API, displays them as interactive cards, and provides navigation and cascade pipeline actions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         default.vue (Layout)                       │
│ ┌─────────┐ ┌───────────────┐ ┌──────────────┐ ┌────────────────┐ │
│ │Git Tree │ │Features Panel │ │Conversations │ │ Chat Panel     │ │
│ │(flex:3) │ │  (flex:2)     │ │  (flex:2)    │ │  (flex:3)      │ │
│ └─────────┘ └───────┬───────┘ └──────────────┘ └────────────────┘ │
└─────────────────────┼───────────────────────────────────────────────┘
                      │
           ┌──────────┴──────────┐
           │  FeaturesPanel.vue  │
           │  (state machine)    │
           ├─────────────────────┤
           │ features | files |  │
           │  content            │
           └──────┬──────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐  ┌─────▼─────┐  ┌───▼──────────┐
│Feature │  │ File List │  │SpecFile      │
│Card    │  │ (inline)  │  │Viewer        │
└───┬────┘  └───────────┘  └──────────────┘
    │
    ├── click card → emit('select')
    ├── click action → emit('cascade')
    └── click chat  → emit('openChat')
```

## Key Files

| File | Purpose | FR Coverage |
|------|---------|-------------|
| `components/features/FeaturesPanel.vue` | Main container, 3-view state machine, cascade logic | FR-001, FR-004, FR-009, FR-010, FR-011, FR-013, FR-014, FR-015 |
| `components/features/FeatureCard.vue` | Card rendering with badges and action buttons | FR-002, FR-003, FR-007, FR-008, FR-012 |
| `components/features/SpecFileViewer.vue` | Markdown content viewer with loading/error states | FR-005, FR-006, FR-018 |
| `server/api/specs/features.get.ts` | Feature discovery API | FR-001, FR-002, FR-003 |
| `server/api/specs/[featureId]/[...filename].get.ts` | File content API with security | FR-016, FR-017 |
| `types/spec-viewer.ts` | TypeScript interfaces | All FRs (type safety) |
| `composables/useMarkdown.ts` | Markdown rendering with XSS protection | FR-006 |
| `composables/useChatStream.ts` | Cascade pipeline integration | FR-009 |
| `stores/chat.ts` | Conversation management and feature linking | FR-010, FR-011, FR-012 |

## Data Flow

### Feature Discovery (on panel mount)

```
FeaturesPanel.onMounted()
  → $fetch('/api/specs/features')
    → Server scans specs/ directory
    → Returns Feature[] with files, badges
  → features.value = data.features
  → Cards render in template
```

### Cascade Action (e.g., "Plan" button click)

```
FeatureCard emits cascade(event, featureId, 'plan')
  → FeaturesPanel.handleCascade(event, featureId, 'plan')
    → Check Shift key for force-new
    → Find/create conversation with featureId
    → enableCascade(featureId, convId, ['tasks', 'implement'])
    → Send '/speckit.plan {featureId}' message
    → Stream response via WebSocket
    → On completion: auto-trigger '/speckit.tasks {featureId}'
    → On completion: auto-trigger '/speckit.implement {featureId}'
```

### Spec File Viewing (3-view navigation)

```
[features view] → click card → selectedFeatureId = id → [files view]
[files view]    → click file → selectedFileName = name → [content view]
[content view]  → SpecFileViewer fetches /api/specs/{id}/{file}
                → marked.parse() + DOMPurify.sanitize()
                → Rendered HTML displayed
[any view]      → back button → previous view
```

## Dependencies

All dependencies are already in `package.json`:
- `marked@^15.0.12` — Markdown parsing
- `dompurify@^3.2.0` — HTML sanitization
- `@heroicons/vue@^2.2.0` — Icons (ArrowPathIcon, ChevronLeftIcon, FolderOpenIcon, ChatBubbleLeftIcon, PlayIcon)

## Integration Points

1. **Chat Store** (`stores/chat.ts`): `createConversation()`, `findConversationByFeature()`, `isConversationStreaming()`, `selectConversation()`, `renameConversation()`
2. **Chat Stream** (`composables/useChatStream.ts`): `sendMessage()`, `enableCascade()`
3. **Toast** (`composables/useToast.ts`): Error notifications
4. **Layout** (`layouts/default.vue`): Column 2 placement with `flex: 2`
