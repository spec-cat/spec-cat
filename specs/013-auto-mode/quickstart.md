# Quickstart: Auto Mode (013-auto-mode)

**Date**: 2026-02-24

## Overview

Auto Mode is a background scheduler that automatically runs the speckit workflow (specify → plan → tasks) for all spec units in the project. It reuses the existing conversation system, worktree isolation, and cascade pipeline — extending them with a toggle control, concurrency support, and session persistence.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Client (Browser)                                          │
│                                                           │
│  ┌─────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │AutoModeToggle│  │ConversationList│  │SettingsModal  │ │
│  │(FeaturesPanel│  │(auto badge)    │  │(concurrency)  │ │
│  │toolbar)      │  │                │  │               │ │
│  └──────┬───────┘  └───────┬────────┘  └──────┬────────┘ │
│         │                  │                   │          │
│  ┌──────▼──────────────────▼───────────────────▼────────┐│
│  │                    Pinia Stores                       ││
│  │  autoMode.ts ──── chat.ts ──── settings.ts           ││
│  └──────┬──────────────────────────────────────┬────────┘│
│         │ WebSocket                            │ HTTP    │
└─────────┼──────────────────────────────────────┼─────────┘
          │                                      │
┌─────────▼──────────────────────────────────────▼─────────┐
│ Server (Nitro)                                            │
│                                                           │
│  ┌────────────────┐  ┌─────────────────────────────────┐ │
│  │auto-mode-ws    │  │ POST /api/auto-mode/toggle      │ │
│  │(status updates)│  │ GET  /api/auto-mode/status      │ │
│  └────────┬───────┘  └──────────────┬──────────────────┘ │
│           │                         │                     │
│  ┌────────▼─────────────────────────▼──────────────────┐ │
│  │            AutoModeScheduler (singleton)              │ │
│  │                                                       │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │  Concurrent Queue (up to N workers)              │ │ │
│  │  │                                                  │ │ │
│  │  │  Worker 1: query(/speckit.specify 001-feature)   │ │ │
│  │  │  Worker 2: query(/speckit.plan 002-feature)      │ │ │
│  │  │  Worker 3: query(/speckit.tasks 003-feature)     │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Session File: ~/.spec-cat/projects/{hash}/auto-mode-session.json          │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  worktreeResolver.ts                                  │ │
│  │  Creates /tmp/spec-cat-worktrees/{featureId}-{randomId}  │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

## Key Flows

### 1. Enable Auto Mode

```
User clicks AutoModeToggle (BoltIcon)
  │
  ├─ autoModeStore.toggle()
  │   └─ POST /api/auto-mode/toggle { enabled: true, concurrency: 3 }
  │
  ├─ AutoModeScheduler.toggle(true, 3)
  │   ├─ discoverFeatures() — scan specs/*/spec.md
  │   ├─ Create session with all features queued
  │   ├─ Persist session to ~/.spec-cat/projects/{hash}/auto-mode-session.json
  │   ├─ Broadcast auto_mode_status via WebSocket
  │   └─ Start concurrent processing pool
  │       ├─ For each feature (up to N concurrent):
  │       │   ├─ Check for existing worktree → skip if found
  │       │   ├─ resolveWorktree() → create isolated worktree
  │       │   ├─ Run specify → auto-commit
  │       │   ├─ Run plan → auto-commit
  │       │   ├─ Run tasks → auto-commit
  │       │   ├─ Mark task completed
  │       │   └─ Broadcast task_update
  │       └─ When all done → session state = 'completed'
  │
  └─ Client receives WebSocket updates → autoModeStore updates

User sees:
  - AutoModeToggle turns yellow with pulse
  - AutoModeStatus shows progress bar + task list
  - Conversations appear in ConversationList with "auto" badge
```

### 2. Disable Auto Mode

```
User clicks AutoModeToggle again
  │
  ├─ POST /api/auto-mode/toggle { enabled: false }
  ├─ AutoModeScheduler.toggle(false)
  │   ├─ Abort signal sent to running tasks
  │   ├─ Running tasks complete current Claude query naturally
  │   ├─ Queued tasks marked as failed ("Auto Mode disabled")
  │   ├─ Session state → 'stopped'
  │   └─ Delete ~/.spec-cat/projects/{hash}/auto-mode-session.json
  │
  └─ Client receives status update → toggle goes gray
```

### 3. Review Auto Mode Results

```
User clicks Auto Mode conversation in ConversationList
  │
  ├─ See full chat history (specify/plan/tasks commands + Claude responses)
  ├─ Click Preview (eye icon) → standard preview flow
  │   └─ POST /api/chat/preview → checkout worktree changes
  ├─ Review diffs in main worktree
  └─ Click Finalize → standard finalize flow
      └─ POST /api/chat/finalize → squash + merge to main
```

## Files to Create/Modify

### New Files
- None — all changes go into existing files

### Modified Files

| File | Change | FR |
|------|--------|-----|
| `types/chat.ts` | Add `autoMode?: boolean` to `Conversation` | FR-008 |
| `types/autoMode.ts` | Add `AutoModePersistedSession`, extend `AutoModeConfig` | FR-015, FR-013 |
| `stores/settings.ts` | Add `autoModeConcurrency` field | FR-016 |
| `stores/autoMode.ts` | Pass concurrency in toggle, persist on page | FR-013, FR-002 |
| `server/utils/autoModeScheduler.ts` | Concurrent processing, session persistence, constitution support | FR-013, FR-015, FR-012 |
| `server/api/auto-mode/toggle.post.ts` | Accept `concurrency` in body | FR-013 |
| `components/chat/ConversationItem.vue` | Show "auto" badge when `conversation.autoMode` | FR-008 |
| `components/settings/SettingsModal.vue` | Add concurrency slider/input | FR-016 |
| `pages/settings.vue` | Add concurrency setting | FR-016 |

## Development Order

1. **Data model changes** (types + store extensions) — foundation
2. **Server scheduler upgrades** (concurrency + persistence + constitution) — core logic
3. **API changes** (toggle endpoint concurrency param) — wiring
4. **UI changes** (badge, settings) — polish

## Testing Strategy

Manual testing per CLAUDE.md:
1. Toggle Auto Mode on → verify conversations created per spec
2. Verify concurrent processing (check multiple worktrees exist simultaneously)
3. Toggle off mid-processing → verify graceful stop
4. Refresh page during processing → verify session state restored
5. Click Auto Mode conversation → verify chat history visible
6. Preview + Finalize → verify standard flow works
7. Change concurrency in settings → verify next cycle uses new value
