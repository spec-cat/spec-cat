import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { projectDir as defaultProjectDir } from './project-dir'
import { analyzeTraceability, formatTraceabilityContextForPrompt } from './traceability'

export type Skill = {
  id: string
  name: string
  description: string
  path: string | null
}

export const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

const BETTER_SPEC_SKILL = `# Better Spec Review

Review the specification documents for the feature identified below and verify
that they follow the What/How/Track separation used by this project:

- spec.md (What): user value, scenarios, functional requirements, key entities,
  success criteria, and assumptions. No implementation details.
- plan.md (How): technical approach, architecture, and design decisions. It must
  not restate requirements already captured in spec.md.
- tasks.md (Track): an ordered, checkable list of work items derived from the plan.

## Repository Checker Results

{{detectedTraceabilityIssues}}

## Checker Compatibility Contract

- Recognize FR IDs only as \`FR-XXX\` or \`FR-XXXa\` (three digits and an optional lowercase suffix).
- Count plan coverage only when the literal FR token appears in \`plan.md\`.
- Count task coverage only when the FR token appears on the same markdown checkbox line (\`- [ ]\` or \`- [x]\`) in \`tasks.md\`.
- Treat an FR token on a checkbox task that is absent from \`spec.md\` as an error.

Perform the following checks and directly fix every violation you find:

1. Flag any implementation detail (frameworks, file paths, data structures,
   API shapes) that appears in spec.md instead of plan.md.
2. Flag any requirement (What) that is written or duplicated in plan.md or
   tasks.md instead of spec.md.
3. Verify every functional requirement (FR-###) is specific and testable:
   it names an observable behavior with a verifiable outcome, not an intention.
4. Verify cross-document consistency: each FR in spec.md is addressed by the
   plan and traceable to at least one task, and no task exists without a
   corresponding requirement or plan section.
5. Verify terminology, entity names, and identifiers are used consistently
   across all three documents.

Start with the injected repository-checker errors and continue editing until
all of them are resolved. Re-read the three documents and repeat the exact
checks before finishing. Report the applied changes and final coverage status.

Feature to review: {{args}}
`

const RENEW_SPEC_SKILL = `# Renew Spec

Rewrite the target specification so it reads as the clean, authoritative
definition of the product in its final intended state, as though it had been
written from scratch with no earlier version.

Remove all historical and transitional language, including:

- descriptions of changing from A to B;
- references to previous, legacy, old, current, or former behavior when they
  exist only to explain how the specification evolved;
- dates, timelines, changelogs, migration narratives, and statements about
  when or why a requirement changed;
- superseded requirements, before-and-after comparisons, and implementation
  progress notes.

Preserve the final intended behavior and all still-valid requirements. Resolve
historical statements into direct, present-tense requirements instead of merely
deleting information that defines the final state. Keep stable identifiers such
as functional requirement IDs whenever the corresponding requirement remains.

Refine the result as a Spec Kit specification focused only on user value,
scenarios, testable functional requirements, key entities, success criteria,
and assumptions. Keep implementation details out of spec.md. Ensure every
functional requirement is observable and testable, terminology is consistent,
and the document contains no trace of its revision history.

Edit the specification files directly. Re-read the finished specification and
remove any remaining historical framing before reporting a concise summary of
the final-state definition and the changes applied.

Feature to renew: {{args}}
`

const BUILTIN_SKILLS: Record<string, string> = {
  'better-spec': BETTER_SPEC_SKILL,
  'renew-spec': RENEW_SPEC_SKILL
}

function parseSkill(id: string, markdown: string, path: string | null): Skill {
  const lines = markdown.split(/\r?\n/)
  let name = id
  let headingIndex = -1

  for (let index = 0; index < lines.length; index += 1) {
    const match = (lines[index] ?? '').match(/^#\s+(.+?)\s*$/)
    if (match?.[1]) {
      name = match[1]
      headingIndex = index
      break
    }
  }

  const paragraph: string[] = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim()
    if (!line) {
      if (paragraph.length > 0) break
      continue
    }
    if (line.startsWith('#')) break
    paragraph.push(line)
  }

  let description = paragraph.join(' ')
  if (description.length > 200) description = `${description.slice(0, 199).trimEnd()}…`

  return { id, name, description, path }
}

export async function listSkills(projectDir = defaultProjectDir()): Promise<Skill[]> {
  const skills = new Map<string, Skill>()

  for (const [id, markdown] of Object.entries(BUILTIN_SKILLS)) {
    skills.set(id, parseSkill(id, markdown, null))
  }

  const skillsDir = join(projectDir, 'skills')
  let entries: string[] = []
  try {
    entries = await readdir(skillsDir)
  } catch {
    entries = []
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue
    const id = entry.slice(0, -3)
    if (!SKILL_ID_PATTERN.test(id)) continue
    const path = join(skillsDir, entry)
    try {
      skills.set(id, parseSkill(id, await readFile(path, 'utf8'), path))
    } catch {
      continue
    }
  }

  return [...skills.values()].sort((a, b) => a.id.localeCompare(b.id))
}

async function readSkillBody(skillId: string, projectDir: string): Promise<string | null> {
  if (!SKILL_ID_PATTERN.test(skillId)) return null

  try {
    return await readFile(join(projectDir, 'skills', `${skillId}.md`), 'utf8')
  } catch {
    return BUILTIN_SKILLS[skillId] ?? null
  }
}

async function buildBetterSpecTraceabilityContext(args: string, projectDir: string): Promise<string> {
  const specsRoot = resolve(projectDir, 'specs')
  const requestedPath = isAbsolute(args) ? resolve(args) : resolve(projectDir, args.startsWith('specs/') ? args : join('specs', args))
  const pathFromRoot = relative(specsRoot, requestedPath)
  if (!args || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    return '## Detected Traceability Issues\n\nUnable to inspect traceability: the feature path is missing or invalid.'
  }

  const readOptional = async (filename: string) => {
    try {
      return await readFile(join(normalize(requestedPath), filename), 'utf8')
    } catch {
      return null
    }
  }
  const [spec, plan, tasks] = await Promise.all([
    readOptional('spec.md'),
    readOptional('plan.md'),
    readOptional('tasks.md')
  ])
  return formatTraceabilityContextForPrompt(analyzeTraceability({ spec, plan, tasks }))
}

export async function renderSkillPrompt(
  skillId: string,
  args?: string,
  projectDir = defaultProjectDir()
): Promise<string | null> {
  const body = await readSkillBody(skillId, projectDir)
  if (body === null) return null

  const substitution = (args ?? '').trim()
  let renderedBody = body
  if (skillId === 'better-spec') {
    renderedBody = renderedBody.replaceAll(
      '{{detectedTraceabilityIssues}}',
      await buildBetterSpecTraceabilityContext(substitution, projectDir)
    )
  }
  if (renderedBody.includes('{{args}}')) {
    return renderedBody.replaceAll('{{args}}', substitution)
  }
  if (substitution) {
    return `${renderedBody.trimEnd()}\n\n## Context\n\n${substitution}\n`
  }
  return renderedBody
}
