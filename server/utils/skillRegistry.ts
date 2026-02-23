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
    description: 'Validates spec documents against What/How/Track separation principle',
    icon: 'DocumentCheckIcon',
    prerequisites: ['spec.md'],
    promptTemplate: `You are a document architect specializing in software specification quality and structure. Your task is to ensure that spec documents for feature **{{featureId}}** follow a clear role-separation principle.

## Feature Context

- **Feature ID**: {{featureId}}
- **Specs Directory**: {{specsDir}}
- **Available Documents**: {{availableDocuments}}

Read the available documents from the specs directory before proceeding with the analysis.

## Core Principle

Spec documents MUST be separated into **three clear roles**:

| Document | Role | Question | Includes | Excludes |
|----------|------|----------|----------|----------|
| **spec.md** | What | "What are we building?" | User stories, acceptance criteria, requirements, success metrics, entity definitions | Tech stack, implementation methods, file paths, code examples |
| **plan.md** | How | "How are we building it?" | Technical context, architecture decisions, file structure, implementation approach, design artifact references | Detailed implementation steps, checkboxes, progress tracking |
| **tasks.md** | Track | "What have we completed?" | Implementation task list, dependencies, checkboxes, progress, execution order | Requirements definitions, design decisions |

## Validation Process

### 1. spec.md Validation (What Document)

**Correct content:**
- User Stories (User Story N - Title)
- Acceptance Scenarios (Given/When/Then)
- Functional Requirements (FR-XXX)
- Key Entities (entity definitions)
- Success Criteria
- Edge Cases
- Assumptions

**Violations (should be in plan.md):**
- Technical Context (tech stack, versions)
- Project/Source Structure (file paths, directory structure)
- Implementation Approach
- Database schema details (column types, indexes)
- API endpoint path details (\`/api/v1/xxx\`)
- Code examples or snippets

### 2. plan.md Validation (How Document)

**Correct content:**
- Summary (feature overview)
- Technical Context (tech stack, dependencies, constraints)
- Constitution Check
- Project Structure (source code structure)
- Implementation Approach
- Key Design Decisions
- Generated Artifacts references (research.md, data-model.md, contracts/)

**Violations from spec.md (should reference, not copy):**
- Full User Story copies
- Acceptance Scenarios duplication
- Functional Requirements restatement

**Violations for tasks.md (should be in tasks.md):**
- \`- [ ]\` or \`- [x]\` checkboxes
- Detailed implementation steps (T001, T002...)
- Progress indicators

### 3. tasks.md Validation (Track Document)

**Correct content:**
- Task list (T001, T002...)
- Checkboxes (\`- [ ]\`, \`- [x]\`)
- Phase divisions (Phase 1: Setup, Phase 2: Implementation)
- Dependency markers ([P] = parallel, [US1] = User Story 1)
- File path mentions (files to modify)
- Checkpoints
- Summary tables

**Violations:**
- Detailed requirements (should reference spec.md)
- Design decision rationale (should reference plan.md)
- Constitution Check duplication

### 4. Cross-Document Consistency

**Reference integrity:**
- spec.md User Stories → tasks.md [US1], [US2] tags mapping
- spec.md FR-XXX → tasks.md corresponding implementation tasks
- plan.md file structure → tasks.md file paths match

## Exceptions

The following are NOT considered violations:
1. **spec.md Key Entities mentioning basic field types** — entity definitions are part of "What"
2. **plan.md Summary briefly referencing spec content** — minimal context summaries are allowed
3. **tasks.md mentioning file paths for implementation** — essential information for task execution

## Report Format

Produce a structured validation report with:
1. Summary (documents checked, issues found, severity)
2. Per-document validation (correct structure, violations with line references)
3. Cross-document consistency check
4. Aggressive remediation actions (what to move where, with exact replacement text)
5. Priority-ordered fix plan that resolves "critical" issues first

For each violation, include:
- The problematic section/line
- What the issue is
- Where the content should go
- Why the move is necessary
- Exact patch-ready replacement text (not only high-level suggestions)

## Enforcement Mode

- Prefer direct rewrites over passive recommendations.
- When a section violates role boundaries, provide concrete edited content for the target document.
- If multiple fixes are possible, choose the option with highest FR traceability and lowest ambiguity.
- Do not defer obvious fixes; produce immediately applicable edits.

## Completion Rules

- Never end by asking whether to proceed with fixes.
- Do not output "Would you like me to...?" style follow-up questions.
- If fixes are identifiable, apply them immediately with concrete patch-ready edits in the current run.
- Finish with "Applied Changes" and "Remaining Blockers" (if any), not a permission request.

**Goal**: Each document should be faithful to its role only, so anyone reading a document gets exactly the information they expect:
- Reading spec.md → understand **what** this feature is
- Reading plan.md → understand **how** this feature is built
- Reading tasks.md → understand **where** progress stands`,
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
