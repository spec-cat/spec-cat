/**
 * POST /api/chat/finalize
 * Squash all worktree commits into one, rebase onto base branch,
 * update the base branch pointer, then clean up worktree + temp branch.
 *
 * Conflict handling: abort rebase, return conflict file list, keep worktree.
 */

import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { logger } from '~/server/utils/logger'
import { getProjectDir } from '~/server/utils/projectDir'
import { guardServerProviderCapability } from '~/server/utils/aiProviderSelection'
import type { FinalizeRequest, FinalizeResponse } from '~/types/chat'

const execAsync = promisify(exec)

async function git(cwd: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd })
  return stdout.trim()
}

/**
 * Auto-commit any uncommitted changes in the worktree
 */
async function autoCommitChanges(worktreePath: string): Promise<boolean> {
  const status = await git(worktreePath, 'status --porcelain')
  if (!status) return false

  await git(worktreePath, 'add -A')
  // Use stdin (-F -) to safely handle any special characters
  execSync('git commit -F -', { cwd: worktreePath, input: 'auto-commit uncommitted changes', encoding: 'utf-8' })
  return true
}

export default defineEventHandler(async (event): Promise<FinalizeResponse> => {
  const body = await readBody<FinalizeRequest>(event)

  if (!body?.conversationId || !body?.commitMessage) {
    throw createError({
      statusCode: 400,
      message: 'conversationId and commitMessage are required',
    })
  }

  const { conversationId, commitMessage } = body
  const providerGuard = await guardServerProviderCapability(
    'autoCommit',
    'Switch to a provider with auto-commit support before finalizing.',
  )
  if ('failure' in providerGuard) {
    return providerGuard.failure
  }

  const projectDir = getProjectDir()
  const branchName = body.worktreeBranch || `sc/${conversationId}`
  const worktreePath = body.worktreePath || `/tmp/sc-${conversationId}`

  logger.chat.info('Finalizing conversation', { conversationId, branchName })

  // Resolve the base branch — accept from body or detect from the worktree's fork point
  let baseBranch = body.baseBranch
  if (!baseBranch) {
    // Fallback: find main/master
    try {
      await git(projectDir, 'rev-parse --verify main')
      baseBranch = 'main'
    } catch {
      baseBranch = 'master'
    }
  } else {
    // Verify the requested base branch actually exists
    try {
      await git(projectDir, `rev-parse --verify "${baseBranch}"`)
    } catch {
      // Requested branch doesn't exist (e.g. a stale sc/conv-xxx branch) — fallback
      logger.chat.warn('Requested baseBranch not found, falling back', { requested: baseBranch })
      try {
        await git(projectDir, 'rev-parse --verify main')
        baseBranch = 'main'
      } catch {
        baseBranch = 'master'
      }
    }
  }

  try {
    // 0. Ensure worktree exists
    if (!existsSync(worktreePath)) {
      return { success: false, error: 'Worktree directory not found. It may have been cleaned up.' }
    }

    // 1. Auto-commit any uncommitted changes
    await autoCommitChanges(worktreePath)

    // 2. Count commits ahead of base branch
    let commitCount: number
    try {
      const countStr = await git(worktreePath, `rev-list --count ${baseBranch}..HEAD`)
      commitCount = parseInt(countStr, 10)
    } catch {
      return { success: false, error: `Cannot compare with base branch "${baseBranch}". It may not exist.` }
    }

    if (commitCount === 0) {
      return { success: false, error: 'No commits to finalize.' }
    }

    // 3. Find merge-base (fork point)
    const mergeBase = await git(worktreePath, `merge-base ${baseBranch} HEAD`)

    // 4. Squash: soft-reset to merge-base then commit
    await git(worktreePath, `reset --soft ${mergeBase}`)
    // Use stdin (-F -) to safely handle messages starting with "-" or containing special characters
    execSync('git commit -F -', { cwd: worktreePath, input: commitMessage, encoding: 'utf-8' })

    // 5. Rebase onto latest base branch
    try {
      await git(worktreePath, `rebase ${baseBranch}`)
    } catch (rebaseError) {
      // Conflict detected — abort and report
      logger.chat.warn('Rebase conflict during finalize', { conversationId })

      // Get conflicting files before aborting
      let conflictFiles: string[] = []
      try {
        const diffOutput = await git(worktreePath, 'diff --name-only --diff-filter=U')
        conflictFiles = diffOutput.split('\n').filter(Boolean)
      } catch {
        // Fallback: try status
        try {
          const statusOutput = await git(worktreePath, 'status --porcelain')
          conflictFiles = statusOutput
            .split('\n')
            .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DU') || line.startsWith('UD'))
            .map(line => line.substring(3))
        } catch { /* ignore */ }
      }

      // Keep rebase in progress so user can resolve conflicts via UI
      return {
        success: false,
        error: `Rebase conflict with "${baseBranch}". Resolve conflicts to continue.`,
        conflictFiles,
        rebaseInProgress: true,
      }
    }

    // 6. Always checkout baseBranch in main worktree before update-ref.
    //    If a preview branch is still checked out, update-ref will fail or leave
    //    the working directory in a dirty state. Switching to baseBranch first
    //    ensures a clean slate, and the preview branch can be deleted afterwards.
    const previewBranch = body.previewBranch
    try {
      const currentBranch = await git(projectDir, 'rev-parse --abbrev-ref HEAD')
      if (currentBranch !== baseBranch) {
        await git(projectDir, `checkout "${baseBranch}"`)
      }
    } catch { /* ignore — main worktree might be in detached HEAD or other state */ }

    // 7. Update base branch ref to point to the squashed+rebased commit
    const newHead = await git(worktreePath, 'rev-parse HEAD')
    await git(projectDir, `update-ref refs/heads/${baseBranch} ${newHead}`)

    // 7-1. Sync working directory if main worktree is on baseBranch
    // update-ref only moves the ref pointer — working dir & index stay stale,
    // causing reverse uncommitted changes without this reset.
    try {
      const mainBranch = await git(projectDir, 'rev-parse --abbrev-ref HEAD')
      if (mainBranch === baseBranch) {
        await git(projectDir, 'reset --hard HEAD')
      }
    } catch { /* detached HEAD or other state — skip */ }

    logger.chat.info('Base branch updated', { baseBranch, newHead })

    // 8. Cleanup: remove worktree and delete temp branch + preview branch
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectDir })
    } catch {
      // Fallback: direct removal
      try {
        await rm(worktreePath, { recursive: true, force: true })
      } catch { /* ignore */ }
    }

    await execAsync('git worktree prune', { cwd: projectDir }).catch(() => {})

    try {
      await git(projectDir, `branch -D "${branchName}"`)
    } catch {
      logger.chat.warn('Failed to delete temp branch', { branchName })
    }

    // Delete preview branch if it exists
    if (previewBranch) {
      try {
        await git(projectDir, `branch -D "${previewBranch}"`)
      } catch { /* preview branch may not exist — fine */ }
    }

    logger.chat.info('Conversation finalized', { conversationId, newCommit: newHead })

    return {
      success: true,
      newCommit: newHead,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.chat.error('Finalize failed', { conversationId, error: errorMessage })

    return {
      success: false,
      error: errorMessage,
    }
  }
})
