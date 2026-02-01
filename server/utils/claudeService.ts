/**
 * Claude Code CLI Service
 * Used for one-off queries (e.g. commit message generation) when Claude is selected.
 */

import { execSync } from 'node:child_process'
import { logger } from './logger'
import { runClaudeCliStream } from './claude'
import { getClaudeModelId } from './claudeModel'
import { readSpecCatStore } from './specCatStore'

/**
 * Send a single message to the provider (Claude CLI)
 * Used for one-off queries like commit message generation
 */
export async function sendMessage(
  prompt: string,
  workingDirectory: string,
  modelKey?: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const modelId = getClaudeModelId(modelKey)
    const result = await runClaudeCliStream({
      cwd: workingDirectory,
      prompt,
      modelId,
      includePartial: false,
    })

    if (result.success) {
      return { success: true, text: result.text?.trim() }
    }

    return { success: false, error: result.error || 'Provider CLI failed' }
  } catch (error) {
    logger.chat.error('sendMessage failed', { error: String(error) })
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Execute a git command in a specific directory
 */
function execGit(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8' }).trim()
}

/**
 * Generate a commit message using AI
 */
async function generateCommitMessage(
  worktreePath: string,
  featureId: string | undefined,
  diffStat: string
): Promise<string> {
  const prompt = `Generate a concise git commit message for these changes.
Feature: ${featureId || 'unknown'}
Changes:
${diffStat}

Rules:
- Use conventional commit format (feat/fix/refactor/docs)
- First line max 72 chars
- Be specific about what changed
- No emoji

Output only the commit message, nothing else.`

  const result = await sendMessage(prompt, worktreePath, 'haiku')

  if (result.success && result.text) {
    return result.text.trim()
  }

  return `feat(${featureId || 'unknown'}): automated changes`
}

/**
 * Generate a simple template-based commit message (no AI)
 */
function generateTemplateCommitMessage(featureId: string | undefined, diffStat: string): string {
  // Extract file count from diff stat (e.g., "3 files changed, 45 insertions(+), 12 deletions(-)")
  const fileCountMatch = diffStat.match(/(\d+) files? changed/)
  const fileCount = fileCountMatch ? fileCountMatch[1] : '?'

  const prefix = featureId ? `feat(${featureId})` : 'chore'
  return `${prefix}: auto commit - ${fileCount} files changed`
}

/**
 * Auto-commit changes in a worktree
 */
export async function autoCommitChanges(
  worktreePath: string,
  featureId?: string,
): Promise<{ success: boolean; message?: string; currentBranch?: string; error?: string }> {
  try {
    // Detect current branch (may have changed during AI execution)
    const currentBranch = execGit(worktreePath, 'rev-parse --abbrev-ref HEAD')

    const status = execGit(worktreePath, 'status --porcelain')
    if (!status.trim()) {
      return { success: true, message: 'No changes to commit', currentBranch }
    }

    execGit(worktreePath, 'add -A')

    const diff = execGit(worktreePath, 'diff --cached --stat')

    // Check settings to determine whether to use AI or template
    const settings = await readSpecCatStore<{ autoGenerateCommitMessages?: boolean }>('settings.json', {})
    const useAI = settings.autoGenerateCommitMessages ?? false

    const commitMessage = useAI
      ? await generateCommitMessage(worktreePath, featureId, diff)
      : generateTemplateCommitMessage(featureId, diff)

    // Use stdin (-F -) to safely handle messages starting with "-" or containing special characters
    execSync('git commit -F -', { cwd: worktreePath, input: commitMessage, encoding: 'utf-8' })

    logger.chat.info('Auto-commit successful', { featureId, commitMessage: commitMessage.split('\n')[0], currentBranch, useAI })
    return { success: true, message: commitMessage.split('\n')[0], currentBranch }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Auto-commit failed', { featureId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}
