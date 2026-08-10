import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listSkills, renderSkillPrompt, SKILL_ID_PATTERN } from '../server/utils/skills'

let projectDir: string

beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'skills-test-'))
  const skillsDir = join(projectDir, 'skills')
  await mkdir(skillsDir, { recursive: true })

  await writeFile(
    join(skillsDir, 'alpha.md'),
    '# Alpha Reviewer\n\nReviews the alpha quality of a document.\n\n## Instructions\n\nReview this input: {{args}}\nAnd again: {{args}}\n'
  )
  await writeFile(
    join(skillsDir, 'no-placeholder.md'),
    '# No Placeholder\n\nA skill without an args placeholder.\n\nDo the work.\n'
  )
  await writeFile(join(skillsDir, 'bare.md'), 'Just a body without any heading.\n')
  await writeFile(join(skillsDir, 'long-desc.md'), `# Long Description\n\n${'x'.repeat(300)}\n`)
  await writeFile(join(skillsDir, 'Invalid_Name.md'), '# Ignored\n\nShould not be listed.\n')
  await writeFile(join(skillsDir, 'notes.txt'), 'not a skill')
})

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('listSkills', () => {
  test('includes the built-in better-spec skill', async () => {
    const skills = await listSkills(projectDir)
    const builtin = skills.find((skill) => skill.id === 'better-spec')
    expect(builtin).toBeDefined()
    expect(builtin?.name).toBe('Better Spec Review')
    expect(builtin?.path).toBeNull()
    expect(builtin?.description.length).toBeGreaterThan(0)
  })

  test('lists project skill files with parsed metadata', async () => {
    const skills = await listSkills(projectDir)
    const alpha = skills.find((skill) => skill.id === 'alpha')
    expect(alpha).toBeDefined()
    expect(alpha?.name).toBe('Alpha Reviewer')
    expect(alpha?.description).toBe('Reviews the alpha quality of a document.')
    expect(alpha?.path).toBe(join(projectDir, 'skills', 'alpha.md'))
  })

  test('falls back to the id when no heading exists', async () => {
    const skills = await listSkills(projectDir)
    const bare = skills.find((skill) => skill.id === 'bare')
    expect(bare?.name).toBe('bare')
    expect(bare?.description).toBe('Just a body without any heading.')
  })

  test('caps descriptions at 200 characters', async () => {
    const skills = await listSkills(projectDir)
    const long = skills.find((skill) => skill.id === 'long-desc')
    expect(long).toBeDefined()
    expect(long!.description.length).toBeLessThanOrEqual(200)
  })

  test('ignores non-markdown files and unsafe ids', async () => {
    const skills = await listSkills(projectDir)
    expect(skills.some((skill) => skill.id === 'notes')).toBe(false)
    expect(skills.some((skill) => skill.id === 'Invalid_Name')).toBe(false)
  })

  test('returns only built-ins when the skills directory is missing', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'skills-empty-'))
    try {
      const skills = await listSkills(emptyDir)
      expect(skills.map((skill) => skill.id)).toEqual(['better-spec'])
    } finally {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('renderSkillPrompt', () => {
  test('substitutes every {{args}} placeholder', async () => {
    const prompt = await renderSkillPrompt('alpha', 'specs/001-demo', projectDir)
    expect(prompt).toContain('Review this input: specs/001-demo')
    expect(prompt).toContain('And again: specs/001-demo')
    expect(prompt).not.toContain('{{args}}')
  })

  test('substitutes an empty string when args are omitted', async () => {
    const prompt = await renderSkillPrompt('alpha', undefined, projectDir)
    expect(prompt).toContain('Review this input: ')
    expect(prompt).not.toContain('{{args}}')
  })

  test('appends args as context when no placeholder exists', async () => {
    const prompt = await renderSkillPrompt('no-placeholder', 'extra detail', projectDir)
    expect(prompt).toContain('Do the work.')
    expect(prompt).toContain('## Context')
    expect(prompt).toContain('extra detail')
  })

  test('returns the body unchanged when no placeholder and no args', async () => {
    const prompt = await renderSkillPrompt('no-placeholder', undefined, projectDir)
    expect(prompt).toContain('Do the work.')
    expect(prompt).not.toContain('## Context')
  })

  test('renders the built-in better-spec skill', async () => {
    const prompt = await renderSkillPrompt('better-spec', 'specs/002-feature', projectDir)
    expect(prompt).toContain('Feature to review: specs/002-feature')
    expect(prompt).toContain('What/How/Track')
    expect(prompt).toContain('testable')
  })

  test('returns null for unknown skills', async () => {
    expect(await renderSkillPrompt('does-not-exist', undefined, projectDir)).toBeNull()
  })

  test('returns null for path-unsafe ids', async () => {
    expect(await renderSkillPrompt('../secrets', undefined, projectDir)).toBeNull()
    expect(await renderSkillPrompt('a/b', undefined, projectDir)).toBeNull()
  })
})

describe('SKILL_ID_PATTERN', () => {
  test.each(['better-spec', 'alpha', 'a1', '0skill'])('accepts %s', (id) => {
    expect(SKILL_ID_PATTERN.test(id)).toBe(true)
  })

  test.each(['../etc', 'Upper', 'has space', '-leading', 'dot.md', ''])('rejects %s', (id) => {
    expect(SKILL_ID_PATTERN.test(id)).toBe(false)
  })
})
