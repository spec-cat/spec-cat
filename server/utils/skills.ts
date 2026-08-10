import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectDir as defaultProjectDir } from './project-dir'

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

Perform the following checks and report every violation you find:

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

Present the findings as a prioritized list. For each finding include the file,
the section or line, the problem, and a concrete suggested fix. Finish with a
short verdict on whether the feature is ready for implementation.

Feature to review: {{args}}
`

const BUILTIN_SKILLS: Record<string, string> = {
  'better-spec': BETTER_SPEC_SKILL
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

export async function renderSkillPrompt(
  skillId: string,
  args?: string,
  projectDir = defaultProjectDir()
): Promise<string | null> {
  const body = await readSkillBody(skillId, projectDir)
  if (body === null) return null

  const substitution = (args ?? '').trim()
  if (body.includes('{{args}}')) {
    return body.replaceAll('{{args}}', substitution)
  }
  if (substitution) {
    return `${body.trimEnd()}\n\n## Context\n\n${substitution}\n`
  }
  return body
}
