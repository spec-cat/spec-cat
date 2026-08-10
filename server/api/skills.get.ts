import { listSkills } from '../utils/skills'

export default defineEventHandler(async () => {
  return { skills: await listSkills() }
})
