import { getProjectDir } from '../../utils/projectDir'
import { loadSkills } from '../../utils/skillRegistry'
import type { SkillsListResponse, SkillMetadata } from '~/types/skill'

export default defineEventHandler(async (): Promise<SkillsListResponse> => {
  const projectDir = getProjectDir()

  const definitions = await loadSkills(projectDir)

  const skills: SkillMetadata[] = definitions.map(({ id, name, description, icon, prerequisites }) => ({
    id,
    name,
    description,
    icon,
    prerequisites,
  }))

  return { skills }
})
