# Spec Cat
Spec Cat is a local development workbench designed to make spec-driven development safer, faster, and a bit more delightful.

It brings spec writing/editing, Git graph inspection, interactive AI coding, worktree isolation, and cascade automation into a single screen.

<img width="3300" height="1848" alt="image" src="https://github.com/user-attachments/assets/0012524e-5337-470e-a005-8f36a97ea9ad" />

## Project Overview
In large codebases, a "one-line prompt" might be fast, but it does not guarantee maintainable results.

Spec Cat is built to make this workflow a daily default:

`spec -> plan -> tasks -> implement -> review`

This workflow follows GitHub Spec-Kit conventions and tracks planning/implementation around documents in `specs/`.
Spec Cat is not only convention-compatible: it is a wrapper/orchestration project around Spec-Kit workflows (`/speckit.*`), adding UI, conversation state, worktree safety, and review/finalize controls on top.

The core idea is simple.
- Specs are the source of truth.
- Changes are isolated by worktree.
- AI helps quickly, but outcomes remain reviewable by humans.

## Motivation
- Direct code changes from prompts alone can quickly make projects chaotic.
- The more repetitive spec pipeline work is automated, the smaller team quality variance becomes.
- Even when AI makes mistakes, teams should be able to recover safely through a worktree/preview/finalize flow.

## Features
Below are the major features in the current repository (implemented + some in progress).

### 1) Four-column development workbench UI
- Use Git / Features / Conversations / Chat panels on a single screen
- Prioritizes context continuity over route switching

### 2) Git graph + Git tooling
- Git operation APIs and UI for branches, commits, tags, stashes, and more
- Commit graph visualization with detailed diff inspection

### 3) Features panel + spec viewer
- Automatic discovery of the `specs/` directory
- Status checks for `spec.md`, `plan.md`, and `tasks.md` from feature cards
- Markdown viewing/editing for spec files in a modal

### 4) AI chat (provider abstraction)
- Streaming responses, session resume, and permission modes (`plan`, `ask`, `auto`, `bypass`)
- Provider Registry supports Claude and Codex selection
- Incompatible provider/model combinations are safely normalized on the server

### 5) Worktree-isolated workflow
- Worktree isolation per conversation
- `Preview` (apply to main workspace) -> `Finalize` (clean up after review) flow
- Stop/recovery paths when conflicts occur

### 6) Cascade / auto mode
- Chained pipeline command execution by feature unit
- Sequential/parallel processing of multiple spec units in auto mode
- Results are reviewed in the same conversation/worktree flow

### 7) Spec search
- Keeps `specs/*` as the source of truth
- Keyword search + embedding-based semantic search (SQLite cache)

### 8) Conversation archive
- Archive-first management instead of hard deletion
- Preserve historical context for re-open/restart workflows

## Tech Stack
- Nuxt 3, Vue 3, TypeScript
- Pinia, Tailwind CSS
- Nitro server routes + Node.js child process/fs utilities
- SQLite (`better-sqlite3`, `sqlite-vec`) for spec search caching

## Provider Capability Policy
- Codex can appear in provider metadata even when runtime support is unavailable.
- If Codex is missing required capabilities (`streaming`, `permissions`, `resume`), selection is disabled in Settings with a clear reason.
- Backend AI endpoints return actionable guard errors that include `providerId` and `missingCapability`.
- If persisted provider/model settings are invalid, Claude is used as a safe default fallback.

## Model API Tool Registration Policy
- Tool schemas are request-scoped: each model API call includes the tool schema payload.
- App startup loads only the internal tool registry (definitions + executors).
- Provider adapters map that registry per provider format at request time.

## Getting Started
### 1) Requirements
- Node.js (LTS recommended)
- `pnpm`
- (Optional) AI CLI
  - For Claude: authenticated `claude` CLI
  - For Codex: `codex` CLI or `CODEX_CLI_PATH` configuration

### 2) Install
```bash
pnpm install
```

### 3) Run in development
```bash
pnpm dev
```

### 4) Run via npx (after npm publish)
```bash
npx spec-cat
npx spec-cat --port 4310 --host 0.0.0.0
npx spec-cat --project /path/to/your/project
SPEC_CAT_PROJECT_DIR=/path/to/your/project npx spec-cat
```

### 5) Key scripts
```bash
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm preview
```

## Settings Storage Path
Per-project settings are stored at:

`~/.spec-cat/projects/{project-hash}/settings.json`

Even when opening the same repository multiple times, settings remain isolated per project hash.

## Directory Sketch
```text
components/     UI components
stores/         Pinia state management
server/api/     Nitro API endpoints
server/utils/   provider/worktree/spec/git utilities
specs/          Feature spec docs (source of truth)
tests/          Vitest tests
```

## Direction
Spec Cat aims to be more than an "AI codes for you" app.
It is a workbench where structure does not collapse, even when AI and humans build together.
