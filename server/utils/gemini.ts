import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

let cachedGeminiPath: string | null = null

/**
 * Find the Gemini CLI executable.
 * We look for 'gemini' in PATH, or common install locations.
 */
export function getGeminiCliPath(): string {
  if (cachedGeminiPath) return cachedGeminiPath

  // 1. Try 'gemini' in PATH
  try {
    const path = execSync('which gemini', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (path) {
      cachedGeminiPath = path
      return path
    }
  } catch {}

  // 2. Common nvm/npm global paths as fallback
  const commonPaths = [
    join(homedir(), '.nvm/versions/node/v22.22.0/bin/gemini'), // Example from session_context
    '/usr/local/bin/gemini',
    '/opt/homebrew/bin/gemini'
  ]

  for (const p of commonPaths) {
    if (existsSync(p)) {
      cachedGeminiPath = p
      return p
    }
  }

  // Fallback to just 'gemini' and hope it works in spawn
  return 'gemini'
}
