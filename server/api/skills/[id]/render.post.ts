import { renderSkillPrompt, SKILL_ID_PATTERN } from '../../../utils/skills'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id || !SKILL_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid skill id' })
  }

  const body = await readBody(event).catch(() => null)
  const args = body && typeof body === 'object' && typeof body.args === 'string' ? body.args : undefined

  const prompt = await renderSkillPrompt(id, args)
  if (prompt === null) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  return { prompt }
})
