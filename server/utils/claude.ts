/**
 * Claude CLI path detection utilities
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

/**
 * Detect the Claude Code CLI path
 * Tries system installation first, then falls back to node_modules
 */
export function detectClaudeCli(): string | null {
  // 1. First try system-installed claude binary (most reliable for user installations)
  const systemPaths = [
    // User local bin (common for npm/pnpm global installs)
    join(process.env.HOME || '', '.local/bin/claude'),
    // Standard unix paths
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]

  for (const path of systemPaths) {
    if (existsSync(path)) {
      // Use the path directly (don't follow symlinks - let the OS handle it)
      console.log(`[Claude CLI] Found system installation: ${path}`)
      return path
    }
  }

  // 2. Try 'which claude' to find in PATH
  try {
    const whichResult = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (whichResult && existsSync(whichResult)) {
      console.log(`[Claude CLI] Found via which: ${whichResult}`)
      return whichResult
    }
  } catch {
    // which command failed, continue to other methods
  }

  return null
}

// Cache the CLI path
let cachedCliPath: string | null = null

/**
 * Get the Claude CLI path (cached)
 */
export function getClaudeCliPath(): string {
  if (cachedCliPath === null) {
    cachedCliPath = detectClaudeCli()
  }

  if (!cachedCliPath) {
    throw new Error(
      'Claude Code CLI not found. Please install Claude Code CLI globally.'
    )
  }

  return cachedCliPath
}
