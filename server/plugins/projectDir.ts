import { getProjectDir, getProjectDirSource } from '../utils/projectDir'

/**
 * Server plugin to initialize project directory at startup
 *
 * This plugin runs when the Nitro server starts and:
 * 1. Resolves the project directory from CLI args, env var, or cwd
 * 2. Updates the runtime config
 * 3. Logs the configured directory for visibility
 */
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
