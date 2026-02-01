import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getProjectDir } from '../../../utils/projectDir'
import { loadSkill, renderPrompt } from '../../../utils/skillRegistry'
import type { SkillPromptResponse } from '~/types/skill'

export default defineEventHandler(async (event): Promise<SkillPromptResponse> => {
  const skillId = getRouterParam(event, 'skillId')
  if (!skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing skillId parameter' })
  }

  const body = await readBody<{ featureId?: string }>(event)
  if (!body?.featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing featureId in request body' })
  }

  const projectDir = getProjectDir()
  const specsDir = join(projectDir, 'specs', body.featureId)

  if (!existsSync(specsDir)) {
    throw createError({ statusCode: 400, statusMessage: `Feature directory not found: specs/${body.featureId}` })
  }

  const skill = await loadSkill(projectDir, skillId)
  if (!skill) {
    throw createError({ statusCode: 404, statusMessage: `Skill not found: ${skillId}` })
  }

  // Scan available documents in the feature's spec directory
  let availableDocuments: string[] = []
  try {
    const entries = await readdir(specsDir, { withFileTypes: true })
    availableDocuments = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name)
  } catch {
    // If we can't read the directory, proceed with empty documents list
  }

  const prompt = renderPrompt(skill, {
    featureId: body.featureId,
    specsDir,
    availableDocuments,
  })

  return {
    prompt,
    featureId: body.featureId,
    skillId,
  }
})
