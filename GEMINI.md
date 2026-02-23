# Gemini Instructions

## Language
- Use English for all user-facing outputs unless the user explicitly requests another language.

## Runtime Rules
- Do not run the development server in AI sessions. The user tests manually.
- Use `pnpm` only. Do not use `npm` or `yarn`.

## Workflow: Vibe Kanban
This project uses Vibe Kanban with isolated git worktrees.

### Core Principles
1. Isolated execution per task in separate worktrees.
2. Parallel task execution across agents.
3. Diff-based review before merge.

### Task Lifecycle
- `backlog`: defined, not started
- `in_progress`: actively implemented
- `review`: ready for review
- `blocked`: waiting on dependency/clarification
- `done`: merged

### Best Practices
- Keep tasks atomic and single-purpose.
- Write explicit acceptance criteria.
- Review early and iterate with feedback.
- Rebase cleanly before integration.

## Tech/Repo Context
- Stack: Nuxt 3 + Vue 3 + TypeScript + Pinia + Tailwind.
- Domain focus: Git graph/worktree/chat/spec workflows with server APIs and filesystem-backed persistence.
- Prefer existing patterns in `components/`, `stores/`, `server/api/`, and `server/utils/`.

## Spec Cat Workflow
When user asks for spec workflow commands, follow these mappings.

### `/specify [feature-description]`
1. Read `lib/speckit/prompts/specify.prompt.md`
2. Use `lib/speckit/templates/spec.template.md`
3. Write `specs/{feature-id}/spec.md`

### `/plan [feature-id]`
1. Read `lib/speckit/prompts/plan.prompt.md`
2. Read `specs/{feature-id}/spec.md`
3. Use `lib/speckit/templates/plan.template.md`
4. Write `specs/{feature-id}/plan.md`
5. Include full FR coverage matrix for all FRs

### `/tasks [feature-id]`
1. Read `lib/speckit/prompts/tasks.prompt.md`
2. Read `specs/{feature-id}/spec.md` and `specs/{feature-id}/plan.md`
3. Use `lib/speckit/templates/tasks.template.md`
4. Write `specs/{feature-id}/tasks.md`
5. Every task must include `[FR-XXX]`
6. Every FR must map to at least one task

### `/implement [feature-id]`
1. Read `lib/speckit/prompts/implement.prompt.md`
2. Read all spec files: `spec.md`, `plan.md`, `tasks.md`
3. Implement each task against full FR definition and success criteria
4. Mark tasks complete only after FR is satisfied

### `/analyze [feature-id]`
1. Read `lib/speckit/prompts/analyze.prompt.md`
2. Extract all FRs from `spec.md`
3. Verify FR coverage in `plan.md`
4. Verify FR-to-task mapping in `tasks.md`
5. Report all gaps explicitly

### `/checklist [feature-id]`
1. Use `lib/speckit/templates/checklist.template.md`
2. List all FRs with implementation status
3. Write `specs/{feature-id}/checklist.md`

### `/constitution`
1. Read `lib/speckit/prompts/constitution.prompt.md`
2. Use `lib/speckit/templates/constitution.template.md`
3. Write `.speckit/memory/constitution.md`

## Non-Negotiable: FR Traceability
Every feature requirement must be traceable through:
`spec.md -> plan.md (coverage) -> tasks.md ([FR-XXX]) -> implementation`

If traceability is broken, fix planning artifacts before coding.

## Active Technologies
- TypeScript 5.6+, Nuxt 3.16+, Vue 3.5+, Pinia 2.2+ + Existing repo dependencies only (`@anthropic-ai/claude-code` for Claude path, Node child process/fs APIs, Nitro server runtime)
- Filesystem-backed settings at `~/.spec-cat/projects/{hash}/settings.json`; conversation session state in existing chat store persistence
- TypeScript 5.6+, Vue 3.5+, Nuxt 3.16+ + Nuxt/Nitro runtime, Pinia, Tailwind CSS, `@heroicons/vue`
- Filesystem-backed spec search index/cache (existing), no new storage for this feature
