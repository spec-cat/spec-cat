# language
use English always.

# rule
I will test it manually. Don't run server in AI session

# package manager
Always use pnpm. Never use npm or yarn.

---

# Vibe Kanban Workflow

This project uses **Vibe Kanban** for orchestrating AI coding agents with isolated git worktrees.

## Core Principles

1. **Isolated Execution**: Every task runs in an isolated git worktree. Agents can't interfere with each other or the main branch.
2. **Parallel Processing**: Multiple coding agents can work simultaneously on different tasks.
3. **Code Review Integration**: Review AI changes with line-by-line diffs before merging.

## Task Workflow

### 1. Task Creation
- Create tasks with clear descriptions and acceptance criteria
- Use task templates for common patterns (bug fix, feature, refactor)
- Break complex work into manageable subtasks

### 2. Agent Execution
- Start coding agent in isolated worktree
- Monitor execution via real-time logs
- Use interactive controls (pause/resume/stop) as needed

### 3. Code Review
- Review agent-generated changes with diff tools
- Add comments and send feedback back to agent
- Request regeneration if changes don't meet criteria

### 4. Integration
- Rebase and resolve any conflicts
- Create pull request for final review
- Merge changes to main branch

## Task States

| State | Description |
|-------|-------------|
| `backlog` | Task defined but not yet started |
| `in_progress` | Agent actively working on task |
| `review` | Changes ready for code review |
| `blocked` | Waiting for dependencies or clarification |
| `done` | Task completed and merged |

## Best Practices

- **One task, one concern**: Keep tasks focused and atomic
- **Clear acceptance criteria**: Define what "done" looks like
- **Frequent reviews**: Review agent output early and often
- **Iterative feedback**: Use agent feedback loop to refine output
- **Clean merges**: Ensure worktree changes rebase cleanly before merging

## Active Technologies
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+) for state, Tailwind CSS for styling, @heroicons/vue for icons (001-app-layout)
- Server-side file storage (`~/.spec-cat/projects/{hash}/settings.json`) for layout preferences (001-app-layout)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @heroicons/vue, Tailwind CSS, chokidar (for file watching) (002-git-graph)
- Git repository (read-only data source via CLI), no persistent client storage (002-git-graph)
- Git repository (worktree metadata), filesystem (worktree directories at `/tmp/`) (003-worktree-management)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+) for state, Tailwind CSS for styling, @heroicons/vue for icons, marked + dompurify (markdown rendering) (015-features-panel)
- Filesystem (`specs/` directory, read-only), cascade pipeline integration with chat system (015-features-panel)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + `@anthropic-ai/claude-code` (v1.0.108), node-pty (v1.1.0), Pinia (v2.2+), `@heroicons/vue`, marked + dompurify (markdown rendering) (007-claude-code-chat)
- Server-side file storage (`~/.spec-cat/projects/{hash}/conversations.json`, `settings.json`), in-memory (session/stream state) (007-claude-code-chat)
- TypeScript 5.6+ with Nuxt 3 (v3.16+) + `better-sqlite3` (SQLite), `sqlite-vec` (vector extension), `@xenova/transformers` (embeddings), chokidar (file watching) (008-spec-search)
- SQLite database at `~/.spec-cat/projects/{hash}/specs-index.db` (rebuildable cache) (008-spec-search)
- Pinia (v2.2+), server-side file storage (`~/.spec-cat/projects/{hash}/conversations.json`) for conversation persistence (009-conversation-management)
- Pinia (v2.2+), server-side file storage (`~/.spec-cat/projects/{hash}/settings.json`) for permission mode (010-chat-permission-system)
- Git worktrees at `/tmp/`, server APIs for worktree/preview/finalize lifecycle (011-chat-worktree-integration)
- Cascade pipeline integration with 015-features-panel (012-cascade-automation)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @anthropic-ai/claude-code (v1.0.108), @heroicons/vue, Tailwind CSS (013-auto-mode)
- Server-side file storage (`~/.spec-cat/projects/{hash}/settings.json`, `conversations.json`, `auto-mode-session.json`) (013-auto-mode)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @heroicons/vue, git CLI (child_process), chokidar (011-chat-worktree-integration)
- Server-side file storage (`~/.spec-cat/projects/{hash}/conversations.json` for conversation persistence including worktree fields), git branches/worktrees on filesystem (`/tmp/br-*`) (011-chat-worktree-integration)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @heroicons/vue (SunIcon/MoonIcon), Tailwind CSS (v3.4+) (014-theme-system)
- Server-side file storage (`~/.spec-cat/projects/{hash}/settings.json` — extends existing settings store) (014-theme-system)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), marked (v15.0.12), dompurify (v3.2.0), @heroicons/vue, Tailwind CSS (004-spec-viewer)
- Filesystem (`specs/` directory, read-only) (004-spec-viewer)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @heroicons/vue, Tailwind CSS, WebSocket (built-in) (012-cascade-automation)
- Server-side file storage (`~/.spec-cat/projects/{hash}/conversations.json` — extends existing conversation persistence) (012-cascade-automation)
- TypeScript 5.6+ with Vue 3.5+ (Composition API, `<script setup>`) + Vue 3.5+, Pinia 2.2+ (state), Tailwind CSS 3.4+ (styling), @heroicons/vue 2.2+ (icons), marked 15.0.12 (markdown), dompurify 3.2.0 (XSS protection) (015-features-panel)
- Filesystem (`specs/` directory — read-only, server-scanned); localStorage (conversations via chat store) (015-features-panel)
- TypeScript 5.6+ with Nuxt 3 (v3.16+), Vue 3 (v3.5+) + Pinia (v2.2+), @heroicons/vue (v2.2+), yaml (v2.8.2), marked (v15.0.12), dompurify (v3.2.0), Tailwind CSS (v3.4+) (016-embedded-skills)
- Filesystem (`skills/` directory — read-only skill definitions); no database (016-embedded-skills)

## Recent Changes
- 007-claude-code-chat: Split into focused specs — chat UI core (007), conversation management (009), permission system (010), worktree integration (011), cascade automation (012)
- 007-claude-code-chat: WebSocket + PTY streaming, real-time chat with Claude Code CLI
- 009-conversation-management: Conversation list, server-side file persistence, search/filter, rename/delete
- 010-chat-permission-system: 4 permission modes (plan/ask/auto/bypass), request/approval UI
- 011-chat-worktree-integration: Per-conversation worktree isolation, preview, finalize, auto-recovery
- 012-cascade-automation: Cascade pipeline (Plan → Tasks → Implement)
- 015-features-panel: Feature discovery from specs/, card UI with status badges, cascade actions, spec file viewer
- 001-app-layout: 4-column layout (Git Tree, Features, Conversations, Chat)

---

# Spec Cat (Internal)

Spec Cat has its own spec-driven development workflow.

## Directory Structure

- **`lib/speckit/`** - Spec Cat-internal templates and prompts (do not modify per-project)
- **`.speckit/memory/`** - Project-specific settings and memory
  - `constitution.md` - Project principles and guidelines
  - Other project-specific memory files

## Workflow Commands

When user requests spec work, follow these prompts:

### /specify [feature-description]
Create feature specification.
1. Read `lib/speckit/prompts/specify.prompt.md`
2. Use template `lib/speckit/templates/spec.template.md`
3. Output to `specs/{feature-id}/spec.md`

### /plan [feature-id]
Create implementation plan from spec.
1. Read `lib/speckit/prompts/plan.prompt.md`
2. Read `specs/{feature-id}/spec.md`
3. Use template `lib/speckit/templates/plan.template.md`
4. Output to `specs/{feature-id}/plan.md`
5. **CRITICAL**: Create FR Coverage Matrix mapping ALL FRs

### /tasks [feature-id]
Generate tasks from plan.
1. Read `lib/speckit/prompts/tasks.prompt.md`
2. Read `specs/{feature-id}/spec.md` AND `plan.md`
3. Use template `lib/speckit/templates/tasks.template.md`
4. Output to `specs/{feature-id}/tasks.md`
5. **CRITICAL**: Every task MUST have [FR-XXX] tag
6. **CRITICAL**: Every FR MUST have at least one task

### /implement [feature-id]
Execute tasks with FR verification.
1. Read `lib/speckit/prompts/implement.prompt.md`
2. Read ALL spec files: spec.md, plan.md, tasks.md
3. For each task:
   - Read the FR definition from spec.md (not just task title)
   - Implement to satisfy the FR
   - Verify against Success Criteria
4. Mark tasks complete only when FR is fully satisfied

### /analyze [feature-id]
Check for gaps between spec, plan, and tasks.
1. Read `lib/speckit/prompts/analyze.prompt.md`
2. Extract all FRs from spec.md
3. Verify each FR appears in plan.md coverage matrix
4. Verify each FR has task(s) in tasks.md
5. Report any gaps

### /checklist [feature-id]
Generate implementation checklist.
1. Use template `lib/speckit/templates/checklist.template.md`
2. List all FRs with implementation status
3. Output to `specs/{feature-id}/checklist.md`

### /constitution
Create or update project constitution.
1. Read `lib/speckit/prompts/constitution.prompt.md`
2. Use template `lib/speckit/templates/constitution.template.md`
3. Output to `.speckit/memory/constitution.md`
4. Constitution defines project-wide principles that apply to all features

## Key Principle: FR Traceability

The #1 cause of implementation gaps is losing track of requirements.

```
spec.md (FR-013: Show project name)
    ↓
plan.md (FR Coverage Matrix includes FR-013)
    ↓
tasks.md (Task T017a [FR-013] Add project name)
    ↓
implement (Read FR-013 definition, not just task title)
```

Every FR must be traceable from spec → plan → task → implementation.

