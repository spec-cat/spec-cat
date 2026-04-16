# Spec Cat

```
  ____                    ____      _
 / ___| _ __   ___  ___  / ___|__ _| |_
 \___ \| '_ \ / _ \/ __|| |   / _` | __|
  ___) | |_) |  __/ (__ | |__| (_| | |_
 |____/| .__/ \___|\___| \____\__,_|\__|
       |_|
```

A local development workbench for spec-driven development.
Write specs, visualize git history, chat with AI, isolate work in worktrees — all in one screen.

## What It Does

Spec Cat orchestrates the spec-driven workflow:

```
spec -> (clarify) -> plan -> tasks -> implement -> review
```

Every change starts from a spec, gets planned, broken into tasks, implemented in an isolated worktree, and reviewed before merging. AI assists at each step, but humans stay in control.

## Screen Layout

Four-column workbench on a single page:

| Git Graph | Features | Conversations | Chat |
|-----------|----------|---------------|------|
| Branch/commit visualization, diffs, 50+ git operations | Spec status cards, markdown viewer, traceability | Session list, archive, search | AI streaming, permission modes, worktree controls |

## Features

### Git Graph & Operations
- Interactive commit graph with branch/tag/stash visualization
- Context menus for merge, rebase, cherry-pick, reset, revert, stash, tag, push/pull
- Inline diff viewer for any commit or uncommitted changes
- Find widget for searching commits by subject or hash
- Remote management (add, edit, fetch, push, pull)

### Spec Management
- Auto-discovers `specs/` directory with per-feature status (`spec.md`, `plan.md`, `tasks.md`)
- Markdown viewer/editor modal with syntax highlighting (CodeMirror)
- FR traceability analysis — verifies every requirement maps through plan to tasks
- Keyword + embedding-based semantic search across all specs (SQLite + sqlite-vec)

### AI Chat
- Streaming responses with thinking blocks, tool use, and result summaries
- **Permission modes**: `ask` (confirm each action), `plan` (upfront approval), `auto` (no prompts), `bypass` (admin)
- **Providers**: Claude, Gemini, Codex — with capability-based selection and safe fallbacks
- Session resume on page reload, per-conversation stream isolation
- **Streaming resilience**: reconnect after refresh, retry setup with linear backoff when the server record hasn't landed yet, and clean up timers on disconnect to kill ghost callbacks
- **Type-while-streaming**: messages entered during an AI response are queued and flushed in order once streaming settles
- Commit message generation from diffs

### Worktree Isolation
- Each conversation gets its own git worktree
- Auto-provisioned for browser UI, `POST /api/jobs`, and external WebSocket clients alike — no manual setup
- **Preview**: apply worktree changes to main workspace for review
- **Finalize**: clean up worktree after merge
- **Sync**: keep worktree alive for continued iteration
- Rebase conflict resolution with AI-assisted suggestions

### Conversations
- Archive-first management (soft delete, not hard delete)
- Linked to features and worktree branches
- Persistent across sessions via filesystem-backed storage

### Cascade / Auto Mode
- Chain spec pipeline commands per feature (`specify -> plan -> tasks -> implement`)
- Sequential or parallel processing of multiple features
- Results reviewed in the same conversation/worktree flow

### Skills & Tools
- Registered tool schemas sent per AI request (request-scoped, not global)
- Skill prompt system for spec-kit operations
- Provider adapters map tools to each provider's format

### WebSocket API
- External tools can drive chat through the same `/_ws` endpoint the browser uses
- Speckit commands (`/speckit.plan 001-auth`) and bare spec IDs in messages are auto-detected, validated against `specs/`, and wired to the matching feature branch
- Server-initiated jobs stream live tool use and text to any subscribed client; reference client in `scripts/speccat_client.py`

### Theme
- Dark / light mode with retro-style color palette
- Persisted via cookie

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Nuxt 3, Vue 3, TypeScript |
| State | Pinia |
| Styling | Tailwind CSS |
| Server | Nitro with WebSocket support |
| Editor | CodeMirror 6 |
| Search | SQLite (better-sqlite3) + sqlite-vec for embeddings |
| Markdown | marked + shiki + DOMPurify |
| AI | Claude CLI, Gemini API, Codex CLI |

## Getting Started

### Requirements
- Node.js >= 20
- `pnpm`
- For AI features: authenticated `claude` CLI, `codex` CLI, or Gemini API credentials

### Install & Run

```bash
pnpm install
pnpm dev
```

### Run via npx

```bash
npx spec-cat
npx spec-cat --port 4310 --host 0.0.0.0
npx spec-cat --project /path/to/your/project
SPEC_CAT_PROJECT_DIR=/path/to/your/project npx spec-cat
```

### Scripts

```bash
pnpm dev            # Development server
pnpm build          # Production build
pnpm preview        # Preview production build
pnpm typecheck      # Type checking
pnpm test           # Run tests
pnpm test:coverage  # Tests with coverage
```

## Directory Structure

```
components/     70+ Vue components (chat, git, features, worktree, settings)
composables/    Reusable composition functions (stream, graph, dialogs, theme)
stores/         Pinia stores (chat, gitGraph, layout, settings, worktree)
server/api/     90+ Nitro API endpoints
server/utils/   AI providers, git ops, spec search, job queue, event bus
pages/          Main workbench, settings, worktrees, design guide
types/          TypeScript type definitions
utils/          Client-side utilities
specs/          Feature spec documents (source of truth)
lib/speckit/    Spec-kit templates and prompts
```

## Settings

Per-project settings stored at `~/.spec-cat/projects/{project-hash}/settings.json`.
Same repo opened from different paths gets separate settings.

## License

MIT
