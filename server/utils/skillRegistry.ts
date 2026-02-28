import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { SkillDefinition } from '~/types/skill'

const REQUIRED_FIELDS = ['id', 'name', 'description', 'icon', 'prerequisites', 'promptTemplate'] as const

/**
 * Built-in skills that are always available, even without a project-level skills/ directory.
 * Project-level skills (skills/*.md) take priority over built-in skills with the same ID.
 */
const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  'better-spec': {
    id: 'better-spec',
    name: 'Better Spec',
    description: 'Enforces What/How/Track separation and repairs FR traceability with direct edits',
    icon: 'DocumentCheckIcon',
    prerequisites: ['spec.md'],
    promptTemplate: `You are a document architect and specification maintainer. Your task is to enforce document role boundaries and directly repair traceability for feature **{{featureId}}** by editing spec artifacts, not just reporting.

## Feature Context

- **Feature ID**: {{featureId}}
- **Specs Directory**: {{specsDir}}
- **Available Documents**: {{availableDocuments}}

Read all available documents before acting.

## Core Principle

Spec documents MUST keep strict role separation:

| Document | Role | Question | Includes | Excludes |
|----------|------|----------|----------|----------|
| **spec.md** | What | "What are we building?" | User stories, acceptance criteria, FRs, success criteria, entities, edge cases, assumptions | Tech stack, implementation methods, detailed file plans, code snippets |
| **plan.md** | How | "How are we building it?" | Technical context, architecture, structure, implementation approach, design decisions | Checkbox task tracking, progress logs |
| **tasks.md** | Track | "What are we doing/done?" | Task list, dependencies, checkboxes, execution order, file targets | Requirement definitions, architecture rationale |

## Non-Negotiable Traceability Contract

Maintain full chain integrity:
\`spec.md -> plan.md (FR coverage) -> tasks.md ([FR-XXX]) -> implementation intent\`

## Required Behavior

1. Validate and repair What/How/Track boundary violations:
   - Move/trim misplaced sections to the correct artifact.
   - Keep content minimal and non-duplicative across files.
2. Extract every FR from \`spec.md\` and normalize to canonical IDs (\`FR-XXX\`).
3. Verify each FR appears in \`plan.md\` coverage mapping.
4. Verify each FR maps to at least one task in \`tasks.md\` using \`[FR-XXX]\`.
5. Detect and fix:
   - Missing FR coverage in plan
   - Missing FR-to-task mappings
   - Orphan tasks without FR linkage
   - Ambiguous or duplicated FR statements
6. Perform direct edits to \`spec.md\`, \`plan.md\`, and \`tasks.md\` as needed.

## Boundary Validation Checklist

- In \`spec.md\`, keep only product intent and requirements; remove implementation detail.
- In \`plan.md\`, keep implementation strategy and technical decisions; remove checkbox execution tracking.
- In \`tasks.md\`, keep actionable tasks with progress markers; remove requirement/spec prose.

## Exceptions

- \`spec.md\` entity definitions may include basic field names/types when necessary for requirement clarity.
- \`plan.md\` may contain brief requirement summaries for context, but not full requirement duplication.
- \`tasks.md\` may include file paths and concise references to FR IDs for execution.

## Edit Policy

- Prefer minimal, deterministic edits.
- Preserve requirement intent; do not weaken scope.
- Keep FR IDs stable; do not renumber unless absolutely unavoidable.
- If renumbering is unavoidable, update all downstream references in the same run.
- Do not create extra report/checklist/reconcile files.

## Spec Repair Rules

- If an FR exists in plan/tasks but is absent or unclear in spec, patch spec with explicit FR wording.
- If an FR is duplicated, keep the clearest version and consolidate references.
- If wording is ambiguous, rewrite to measurable, testable language.
- Keep \`spec.md\` focused on "What", \`plan.md\` on "How", and \`tasks.md\` on execution tracking.

## Output Format

Return concise sections:
1. **Applied Changes**: exact file-level edits performed.
2. **Traceability Status**: FR total, FRs fully mapped, unresolved count.
3. **Boundary Status**: What/How/Track violations fixed and any remaining.
4. **Remaining Blockers**: only items that cannot be safely auto-fixed.

Never ask for permission to proceed with obvious fixes. Apply them now.`,
  },
}

/**
 * Parse a skill markdown file with YAML frontmatter.
 * Returns null if parsing fails.
 */
function parseSkillFile(content: string, filename: string): SkillDefinition | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    console.warn(`[skills] Skipping ${filename}: missing YAML frontmatter`)
    return null
  }

  let frontmatter: Record<string, unknown>
  try {
    frontmatter = parseYaml(match[1])
  } catch {
    console.warn(`[skills] Skipping ${filename}: invalid YAML frontmatter`)
    return null
  }

  if (!frontmatter || typeof frontmatter !== 'object') {
    console.warn(`[skills] Skipping ${filename}: empty YAML frontmatter`)
    return null
  }

  const promptTemplate = match[2].trim()
  if (!promptTemplate) {
    console.warn(`[skills] Skipping ${filename}: empty prompt template body`)
    return null
  }

  const skill: SkillDefinition = {
    id: String(frontmatter.id || ''),
    name: String(frontmatter.name || ''),
    description: String(frontmatter.description || ''),
    icon: String(frontmatter.icon || ''),
    prerequisites: Array.isArray(frontmatter.prerequisites)
      ? frontmatter.prerequisites.map(String)
      : [],
    promptTemplate,
  }

  const missing = REQUIRED_FIELDS.filter((field) => {
    if (field === 'prerequisites') return false
    if (field === 'promptTemplate') return false
    return !skill[field]
  })

  if (missing.length > 0) {
    console.warn(`[skills] Skipping ${filename}: missing required fields: ${missing.join(', ')}`)
    return null
  }

  return skill
}

/**
 * Load all valid skill definitions from the skills/ directory.
 * Skips malformed files with console warnings.
 * Returns empty array if skills directory doesn't exist.
 */
export async function loadSkills(projectDir: string): Promise<SkillDefinition[]> {
  const skillsDir = join(projectDir, 'skills')

  if (!existsSync(skillsDir)) {
    return Object.values(BUILTIN_SKILLS)
  }

  let entries: string[]
  try {
    entries = await readdir(skillsDir)
  } catch {
    console.warn('[skills] Failed to read skills directory')
    return Object.values(BUILTIN_SKILLS)
  }

  const mdFiles = entries.filter(f => f.endsWith('.md'))
  const skills: SkillDefinition[] = []
  const seenIds = new Set<string>()

  for (const filename of mdFiles) {
    const filepath = join(skillsDir, filename)
    let content: string
    try {
      content = await readFile(filepath, 'utf-8')
    } catch {
      console.warn(`[skills] Skipping ${filename}: failed to read file`)
      continue
    }

    if (!content.trim()) {
      console.warn(`[skills] Skipping ${filename}: empty file`)
      continue
    }

    const skill = parseSkillFile(content, filename)
    if (!skill) continue

    if (seenIds.has(skill.id)) {
      console.warn(`[skills] Skipping ${filename}: duplicate skill ID "${skill.id}"`)
      continue
    }

    seenIds.add(skill.id)
    skills.push(skill)
  }

  // Merge built-in skills that weren't overridden by project-level files
  for (const [id, skill] of Object.entries(BUILTIN_SKILLS)) {
    if (!seenIds.has(id)) {
      skills.push(skill)
    }
  }

  return skills
}

/**
 * Load a single skill by ID from the skills/ directory.
 * Returns null if not found or invalid.
 */
export async function loadSkill(projectDir: string, skillId: string): Promise<SkillDefinition | null> {
  const filepath = join(projectDir, 'skills', `${skillId}.md`)

  if (!existsSync(filepath)) {
    return BUILTIN_SKILLS[skillId] ?? null
  }

  let content: string
  try {
    content = await readFile(filepath, 'utf-8')
  } catch {
    return BUILTIN_SKILLS[skillId] ?? null
  }

  if (!content.trim()) {
    return BUILTIN_SKILLS[skillId] ?? null
  }

  return parseSkillFile(content, `${skillId}.md`) ?? BUILTIN_SKILLS[skillId] ?? null
}

/**
 * Render a skill's prompt template with feature-specific context.
 * Replaces {{featureId}}, {{specsDir}}, and {{availableDocuments}} variables.
 */
export function renderPrompt(
  skill: SkillDefinition,
  context: { featureId: string; specsDir: string; availableDocuments: string[] }
): string {
  return skill.promptTemplate
    .replace(/\{\{featureId\}\}/g, context.featureId)
    .replace(/\{\{specsDir\}\}/g, resolve(context.specsDir))
    .replace(/\{\{availableDocuments\}\}/g, context.availableDocuments.join(', '))
}
