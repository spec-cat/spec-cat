/**
 * Conversation worktree setup utility.
 *
 * Ensures an isolated git worktree exists for a conversation.
 * Creates a new worktree + branch if none exists, or resolves an existing one.
 * Also ensures the conversation storage record has worktree metadata.
 *
 * Used by the WS chat handler to provide the same worktree isolation
 * that POST /api/jobs and the client UI already perform.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectDir } from './projectDir'
import { upsertConversationInStorage } from './conversationStore'
import { getSpecCatDataDir } from './specCatStore'
import { isUsableBaseBranchName, resolvePreferredBaseBranch } from './baseBranch'
import { execGitCommand } from './gitExec'
import { getChatWorktreePath } from './worktreePaths'
import { generateConversationTitle, STORAGE_VERSION } from '~/types/chat'
import type { Conversation } from '~/types/chat'

export interface WorktreeSetupResult {
  success: boolean
  cwd: string
  worktreeBranch?: string
  baseBranch?: string
  error?: string
}

/**
 * Ensure an isolated worktree exists for a conversation.
 *
 * - If the worktree directory already exists, returns it immediately.
 * - If the branch exists but directory is missing, recovers the worktree.
 * - If neither exists, creates a new branch + worktree.
 * - Updates the conversation storage record with worktree metadata.
 */
export async function setupConversationWorktree(options: {
  conversationId: string
  message: string
  featureId?: string
  baseBranch?: string
  providerId?: string
  providerModelKey?: string
}): Promise<WorktreeSetupResult> {
  const { conversationId, featureId } = options
  const projectDir = getProjectDir()

  // Validate featureId to prevent shell injection
  if (featureId && !/^[a-zA-Z0-9_\-]+$/.test(featureId)) {
    console.warn('[worktreeSetup] Invalid featureId format:', featureId)
    return { success: false, cwd: projectDir }
  }

  const branchName = featureId || `sc/${conversationId}`
  const worktreePath = getChatWorktreePath(conversationId, featureId)

  // If directory already exists, just return it
  if (existsSync(worktreePath)) {
    return { success: true, cwd: worktreePath, worktreeBranch: branchName }
  }

  try {
    const requestedBaseBranch = options.baseBranch?.trim()
    if (requestedBaseBranch && !isUsableBaseBranchName(requestedBaseBranch)) {
      throw new Error(`Invalid base branch "${requestedBaseBranch}"`)
    }

    const baseBranch = requestedBaseBranch || await resolvePreferredBaseBranch(projectDir)
    if (!baseBranch) {
      throw new Error('Unable to resolve base branch for conversation worktree')
    }

    const baseHead = await execGitCommand(
      ['rev-parse', '--verify', `refs/heads/${baseBranch}^{commit}`],
      projectDir,
    ).catch(() => {
      throw new Error(`Base branch "${baseBranch}" does not exist`)
    })

    // Check if branch already exists (recovery vs creation)
    let branchExists = false
    try {
      await execGitCommand(['rev-parse', '--verify', branchName], projectDir)
      branchExists = true
    } catch {
      // Branch doesn't exist
    }

    if (branchExists) {
      // Recovery: branch exists but directory was cleaned up
      await execGitCommand(['worktree', 'prune'], projectDir)
      await execGitCommand(['worktree', 'add', worktreePath, branchName], projectDir)
    } else {
      // Creation: new branch + worktree
      await execGitCommand(['worktree', 'add', '-b', branchName, worktreePath, baseHead], projectDir)
    }

    console.log('[worktreeSetup] Worktree ready:', { conversationId, worktreePath, branchName, branchExists })

    // Ensure conversation storage record has worktree metadata
    await ensureConversationWorktreeInfo(options, worktreePath, branchName, baseBranch)

    return { success: true, cwd: worktreePath, worktreeBranch: branchName, baseBranch }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn('[worktreeSetup] Failed:', error)
    return { success: false, cwd: projectDir, error }
  }
}

/**
 * Update conversation storage with worktree metadata.
 * Creates a minimal record if the conversation doesn't exist yet.
 */
async function ensureConversationWorktreeInfo(
  options: {
    conversationId: string
    message: string
    featureId?: string
    baseBranch?: string
    providerId?: string
    providerModelKey?: string
  },
  worktreePath: string,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const dataDir = getSpecCatDataDir()
  const convFilePath = join(dataDir, 'conversations', `${options.conversationId}.json`)

  try {
    if (existsSync(convFilePath)) {
      // Update existing record if it lacks worktree info
      const raw = await readFile(convFilePath, 'utf-8')
      const conv = JSON.parse(raw) as Conversation
      if (!conv.worktreePath) {
        conv.cwd = worktreePath
        conv.worktreePath = worktreePath
        conv.worktreeBranch = branchName
        conv.hasWorktree = true
        conv.baseBranch = baseBranch
        conv.updatedAt = new Date().toISOString()
        await upsertConversationInStorage(conv, STORAGE_VERSION)
      }
    } else {
      // Create minimal conversation record
      const now = new Date().toISOString()
      const conv: Conversation = {
        id: options.conversationId,
        title: generateConversationTitle(options.message),
        messages: [],
        createdAt: now,
        updatedAt: now,
        cwd: worktreePath,
        source: options.featureId ? 'cascade' : 'user',
        worktreePath,
        worktreeBranch: branchName,
        hasWorktree: true,
        baseBranch,
        featureId: options.featureId,
        providerId: options.providerId,
        providerModelKey: options.providerModelKey,
      }
      await upsertConversationInStorage(conv, STORAGE_VERSION)
    }
  } catch (err) {
    // Non-fatal: worktree is created, just storage update failed
    console.warn('[worktreeSetup] Failed to update conversation storage:', err)
  }
}
