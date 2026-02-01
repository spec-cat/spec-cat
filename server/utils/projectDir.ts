import { homedir } from 'node:os'
import { resolve } from 'node:path'

/**
 * Project Directory Utility
 *
 * Resolves the project directory from (in order of priority):
 * 1. CLI argument: --project or -p
 * 2. Environment variable: SPEC_CAT_PROJECT_DIR
 * 3. Default: process.cwd()
 */

let cachedProjectDir: string | null = null

/**
 * Expand ~ to home directory and resolve to absolute path
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2))
  }
  if (path === '~') {
    return homedir()
  }
  return resolve(path)
}

/**
 * Parse CLI arguments to find project directory
 */
function parseCliProjectDir(): string | null {
  const args = process.argv

  console.log('[spec-cat] CLI args:', args)

  // Look for --project or -p flag
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Handle --project=/path/to/dir or -p=/path/to/dir
    if (arg.startsWith('--project=')) {
      return expandPath(arg.substring('--project='.length))
    }
    if (arg.startsWith('-p=')) {
      return expandPath(arg.substring('-p='.length))
    }

    // Handle --project /path/to/dir or -p /path/to/dir
    if ((arg === '--project' || arg === '-p') && args[i + 1]) {
      const nextArg = args[i + 1]
      // Make sure next arg is not another flag
      if (!nextArg.startsWith('-')) {
        return expandPath(nextArg)
      }
    }
  }

  return null
}

/**
 * Get the configured project directory
 *
 * Priority:
 * 1. CLI argument (--project or -p)
 * 2. Environment variable (SPEC_CAT_PROJECT_DIR)
 * 3. process.cwd()
 *
 * Result is cached after first call.
 */
export function getProjectDir(): string {
  if (cachedProjectDir !== null) {
    return cachedProjectDir
  }

  // 1. Check CLI arguments (highest priority)
  const cliProjectDir = parseCliProjectDir()
  if (cliProjectDir) {
    cachedProjectDir = cliProjectDir
    return cachedProjectDir
  }

  // 2. Check environment variable
  const envProjectDir = process.env.SPEC_CAT_PROJECT_DIR
  if (envProjectDir) {
    cachedProjectDir = expandPath(envProjectDir)
    return cachedProjectDir
  }

  // 3. Default to process.cwd()
  cachedProjectDir = process.cwd()
  return cachedProjectDir
}

/**
 * Reset the cached project directory (useful for testing)
 */
export function resetProjectDirCache(): void {
  cachedProjectDir = null
}

/**
 * Get project directory source for logging
 */
export function getProjectDirSource(): 'cli' | 'env' | 'cwd' {
  const cliProjectDir = parseCliProjectDir()
  if (cliProjectDir) {
    return 'cli'
  }

  if (process.env.SPEC_CAT_PROJECT_DIR) {
    return 'env'
  }

  return 'cwd'
}
