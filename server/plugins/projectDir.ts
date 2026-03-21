import { getProjectDir, getProjectDirSource } from '../utils/projectDir'

export default defineNitroPlugin(() => {
  const projectDir = getProjectDir()
  const source = getProjectDirSource()

  const sourceLabels = {
    cli: 'CLI argument (--project)',
    env: 'environment variable (SPEC_CAT_PROJECT_DIR)',
    cwd: 'current working directory',
  }

  console.log(`[spec-kit] Project directory: ${projectDir}`)
  console.log(`[spec-kit] Source: ${sourceLabels[source]}`)
})
