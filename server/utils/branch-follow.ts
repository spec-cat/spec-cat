/**
 * Pure decision logic (plus the git reads it needs) for keeping a
 * conversation's stored branch in sync with the branch its worktree is
 * actually on. Deliberately free of session-store access so importing it never
 * initializes the store — `followSessionBranch` in session-integration.ts is
 * the driver that persists the outcome.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Branches a conversation must never adopt as its own worktree branch. Adopting
 * one would make finalize try to merge a shared branch into itself and would
 * expose it to the teardown branch deletion.
 */
export const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'trunk', 'release'])

/** The branch a managed worktree is provisioned on. */
export function managedSessionBranch(sessionId: string) {
  return `sc/${sessionId}`
}

export type BranchFollowInput = {
  sessionId: string
  /** Branch currently recorded on the conversation. */
  storedBranch?: string
  /** Branch actually checked out in the worktree ('' while HEAD is detached). */
  currentBranch: string
  baseBranch?: string
  previewBranch?: string
}

export type BranchFollowDecision = {
  /** True when the conversation must adopt `currentBranch`. */
  follow: boolean
  /**
   * True when the branch being left behind is the conversation's own generated
   * `sc/<id>` branch and is therefore a deletion candidate. A branch the user
   * (or an earlier speckit step) created is never dropped.
   */
  dropPrevious: boolean
  reason:
    | 'unchanged'
    | 'detached'
    | 'protected'
    | 'preview'
    | 'base'
    | 'follow'
}

/**
 * Decides "the worktree is now on a different branch — should the conversation
 * follow it?".
 *
 * A speckit step (`/speckit.specify`) creates and checks out a feature branch
 * inside the conversation's worktree. Without following it, the conversation's
 * stored `worktreeBranch` keeps pointing at the abandoned `sc/<id>` branch, so
 * finalize/rebase/archive all operate on the wrong ref and the real work is
 * orphaned.
 */
export function decideBranchFollow(input: BranchFollowInput): BranchFollowDecision {
  const current = input.currentBranch.trim()
  const stored = (input.storedBranch || '').trim()
  const dropPrevious = Boolean(stored) && stored === managedSessionBranch(input.sessionId)

  // A detached HEAD is a transient state (rebase, bisect, checkout of a commit);
  // adopting it would erase the branch the conversation belongs to.
  if (!current) return { follow: false, dropPrevious: false, reason: 'detached' }
  if (current === stored) return { follow: false, dropPrevious: false, reason: 'unchanged' }
  if (input.previewBranch && current === input.previewBranch) {
    return { follow: false, dropPrevious: false, reason: 'preview' }
  }
  if (PROTECTED_BRANCHES.has(current)) return { follow: false, dropPrevious: false, reason: 'protected' }
  if (input.baseBranch && current === input.baseBranch) {
    return { follow: false, dropPrevious: false, reason: 'base' }
  }

  return { follow: true, dropPrevious, reason: 'follow' }
}

/** Current branch of a worktree, or '' when HEAD is detached or git fails. */
export async function readWorktreeBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8'
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

/**
 * Deletes the branch the conversation just left, but only when the new branch
 * already contains it — otherwise the old branch still holds unique commits and
 * dropping it would lose work. Returns whether the branch was removed.
 */
export async function retireAbandonedBranch(projectDir: string, previous: string, current: string) {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', previous, current], {
      cwd: projectDir,
      encoding: 'utf8'
    })
  } catch {
    return false
  }

  try {
    await execFileAsync('git', ['branch', '-D', previous], { cwd: projectDir, encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}
