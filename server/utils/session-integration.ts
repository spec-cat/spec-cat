import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { autoCommitTurn } from './auto-commit'
import {
  decideBranchFollow,
  readWorktreeBranch,
  retireAbandonedBranch
} from './branch-follow'
import { autoResolveRebaseConflicts } from './conflict-resolver'
import {
  isSessionDeleted,
  readStoredSession,
  writeStoredSession,
  type StoredTerminalSession
} from './session-store'
import { deleteSessionWorktree } from './worktree'

const execFileAsync = promisify(execFile)
const TMUX_BIN = process.env.TMUX_BIN || 'tmux'
const operationQueue = new Map<string, Promise<unknown>>()

export async function rebaseSession(sessionId: string, targetBranch: string) {
  return serialize(sessionId, async () => {
    const session = await requireManagedSession(sessionId)
    const target = await requireTargetBranch(session.projectDir!, targetBranch)
    await ensureNoRebaseInProgress(session.cwd)
    await autoCommitAndSyncPreview(session)

    const conflictReport = await runRebaseWithAutoResolve(session, target)

    if (session.previewBranch) await syncPreviewBranch(session.projectDir!, session.cwd, session.previewBranch)

    await writeStoredSession({
      ...session,
      baseBranch: target,
      updatedAt: new Date().toISOString()
    })
    return { success: true, baseBranch: target, ...(conflictReport ? { conflictReport } : {}) }
  })
}

export async function squashSession(sessionId: string, targetBranch: string) {
  return serialize(sessionId, async () => {
    const session = await requireManagedSession(sessionId)
    const target = await requireTargetBranch(session.projectDir!, targetBranch)
    await ensureNoRebaseInProgress(session.cwd)
    await autoCommitAndSyncPreview(session)

    const ahead = Number(await gitOutput(session.cwd, ['rev-list', '--count', `${target}..HEAD`]))
    let newHead = await gitOutput(session.cwd, ['rev-parse', 'HEAD'])
    let conflictReport = ''

    if (ahead > 0) {
      conflictReport = await runRebaseWithAutoResolve(session, target)
      await git(session.cwd, ['reset', '--soft', target])

      if (await isIndexClean(session.cwd)) {
        await git(session.cwd, ['reset', '--hard', target])
      } else {
        await git(session.cwd, ['commit', '-m', 'chore: squash conversation commits'])
      }
      newHead = await gitOutput(session.cwd, ['rev-parse', 'HEAD'])
    }

    if (session.previewBranch) await syncPreviewBranch(session.projectDir!, session.cwd, session.previewBranch)

    await writeStoredSession({
      ...session,
      baseBranch: target,
      updatedAt: new Date().toISOString()
    })

    return { success: true, baseBranch: target, newCommit: newHead, squashed: ahead > 0, ...(conflictReport ? { conflictReport } : {}) }
  })
}

/**
 * Runs `git rebase <target>` and, if it stops on conflicts, hands them to the
 * session's provider through the live tmux PTY to resolve automatically. On
 * success returns a one-time report of what the agent did (empty when the
 * rebase applied cleanly). On failure the rebase is aborted and a conflict
 * error is thrown, matching the pre-auto-resolve behavior.
 */
async function runRebaseWithAutoResolve(session: StoredTerminalSession, target: string): Promise<string> {
  try {
    await git(session.cwd, ['rebase', target])
    return ''
  } catch (error) {
    const conflictFiles = await getConflictFiles(session.cwd)
    if (!conflictFiles.length) throw integrationError(getErrorMessage(error), [])

    const resolution = await autoResolveRebaseConflicts(session, session.cwd, target)
    if (!resolution.resolved) {
      await git(session.cwd, ['rebase', '--abort']).catch(() => {})
      throw integrationError(
        `Rebase conflict with ${target} — automatic resolution did not converge`,
        resolution.remainingConflicts
      )
    }
    return resolution.report
  }
}

export async function finalizeSession(sessionId: string, targetBranch: string, commitMessage: string) {
  return serialize(sessionId, async () => {
    const session = await requireManagedSession(sessionId)
    const projectDir = session.projectDir!
    const worktreeBranch = session.worktreeBranch!
    const target = await requireTargetBranch(projectDir, targetBranch)
    await ensureNoRebaseInProgress(session.cwd)
    await autoCommitAndSyncPreview(session)

    const targetHash = await gitOutput(projectDir, ['rev-parse', `refs/heads/${target}`])
    const ahead = Number(await gitOutput(session.cwd, ['rev-list', '--count', `${target}..HEAD`]))
    let newHead = targetHash
    let conflictReport = ''

    if (ahead > 0) {
      conflictReport = await runRebaseWithAutoResolve(session, target)

      await git(session.cwd, ['reset', '--soft', target])
      // Rebasing onto target may drop every commit as already-applied (the work
      // is equivalent to what target already has), leaving nothing staged. Only
      // commit when there is a net diff; otherwise keep newHead at target so the
      // merge below is skipped and teardown proceeds to delete the branch —
      // `git commit` with nothing staged would throw and orphan the worktree.
      if (!(await isIndexClean(session.cwd))) {
        await git(session.cwd, ['commit', '-m', commitMessage.trim()])
        newHead = await gitOutput(session.cwd, ['rev-parse', 'HEAD'])
      }
    }

    const currentBranch = await gitOutput(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (currentBranch === target && newHead !== targetHash) {
      await git(projectDir, ['merge', '--ff-only', worktreeBranch])
    } else if (newHead !== targetHash) {
      await git(projectDir, ['update-ref', `refs/heads/${target}`, newHead, targetHash])
    }
    if (session.previewBranch && currentBranch === session.previewBranch) {
      await git(projectDir, ['checkout', target])
    }

    await killTmux(session.tmuxName)
    await deleteSessionWorktree({
      projectDir,
      worktreePath: session.cwd,
      branch: worktreeBranch
    })
    if (session.previewBranch) await deletePreviewBranch(projectDir, session.previewBranch)

    const now = new Date().toISOString()
    // Finalizing merges the work into the target branch and tears down the
    // runtime, so the conversation is done: archive it in the same write. The
    // worktree branch is deleted above, hence branchKept is false.
    await writeStoredSession({
      ...session,
      cwd: projectDir,
      baseBranch: target,
      finalized: true,
      finalizedAt: now,
      finalCommit: newHead,
      previewBranch: undefined,
      archived: true,
      archivedAt: now,
      branchKept: false,
      updatedAt: now
    })

    return { success: true, baseBranch: target, newCommit: newHead, ...(conflictReport ? { conflictReport } : {}) }
  })
}

export async function previewSession(sessionId: string) {
  return serialize(sessionId, async () => {
    const session = await requireManagedSession(sessionId)
    if (!session.baseBranch) throw new Error('Conversation has no base branch')

    await autoCommitAndSyncPreview(session)

    const previewBranch = 'sc/preview'
    const worktreeHead = await gitOutput(session.cwd, ['rev-parse', 'HEAD'])
    const currentBranch = await gitOutput(session.projectDir!, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')
    const mainStatus = await gitOutput(session.projectDir!, ['status', '--porcelain'])

    if (mainStatus && currentBranch !== previewBranch) {
      throw new Error('Main worktree has uncommitted changes. Commit or stash changes first.')
    }

    if (await localBranchExists(session.projectDir!, previewBranch)) {
      await git(session.projectDir!, ['checkout', previewBranch])
      await git(session.projectDir!, ['reset', '--hard', worktreeHead])
    } else {
      await git(session.projectDir!, ['branch', previewBranch, worktreeHead])
      await git(session.projectDir!, ['checkout', previewBranch])
    }

    const now = new Date().toISOString()
    await writeStoredSession({
      ...session,
      previewBranch,
      updatedAt: now
    })

    return { success: true, previewBranch, commit: worktreeHead }
  })
}

export async function endSessionPreview(sessionId: string) {
  return serialize(sessionId, async () => {
    const session = await requireManagedSession(sessionId)
    if (!session.previewBranch) return { success: true }
    if (!session.baseBranch) throw new Error('Conversation has no base branch')

    const currentBranch = await gitOutput(session.projectDir!, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')
    if (currentBranch === session.previewBranch) {
      await git(session.projectDir!, ['checkout', session.baseBranch])
    }
    await deletePreviewBranch(session.projectDir!, session.previewBranch)

    const now = new Date().toISOString()
    await writeStoredSession({
      ...session,
      previewBranch: undefined,
      updatedAt: now
    })

    return { success: true }
  })
}

export type BranchFollowResult = {
  changed: boolean
  branch?: string
  previousBranch?: string
  droppedPrevious?: boolean
}

/**
 * Reconciles a conversation's stored branch with the branch its worktree is
 * actually on, persisting the change and retiring the abandoned `sc/<id>`
 * branch when the new branch already contains its commits.
 *
 * Serialized on its own key rather than the session key: the HEAD watcher and
 * the turn-end commit path can both trigger a follow for the same checkout, but
 * a follow must never queue behind a long-running finalize that is itself
 * waiting on a provider turn.
 */
export function followSessionBranch(sessionId: string): Promise<BranchFollowResult> {
  return serialize(`branch-follow:${sessionId}`, async () => {
    if (!sessionId || isSessionDeleted(sessionId)) return { changed: false }

    const session = await readStoredSession(sessionId)
    if (!isFollowableSession(session)) return { changed: false }

    const currentBranch = await readWorktreeBranch(session.cwd)
    const decision = decideBranchFollow({
      sessionId,
      storedBranch: session.worktreeBranch,
      currentBranch,
      baseBranch: session.baseBranch,
      previewBranch: session.previewBranch
    })
    if (!decision.follow) return { changed: false }

    // Re-read after the git calls: an auto-title or rename may have landed in
    // the meantime, and the spread below must not resurrect stale metadata.
    const latest = await readStoredSession(sessionId)
    if (!isFollowableSession(latest)) return { changed: false }

    const previousBranch = latest.worktreeBranch
    await writeStoredSession({
      ...latest,
      worktreeBranch: currentBranch,
      updatedAt: new Date().toISOString()
    })

    const droppedPrevious = decision.dropPrevious && previousBranch
      ? await retireAbandonedBranch(latest.projectDir!, previousBranch, currentBranch)
      : false

    return { changed: true, branch: currentBranch, previousBranch, droppedPrevious }
  })
}

function isFollowableSession(
  session: StoredTerminalSession | null
): session is StoredTerminalSession {
  return Boolean(
    session
    && !session.archived
    && !session.finalized
    && session.projectDir
    && session.worktreeBranch
    && session.cwd
  )
}

export async function autoCommitAndSyncPreview(session: StoredTerminalSession) {
  const result = await autoCommitTurn(session.cwd, session.provider)
  if (session.previewBranch) await syncPreviewBranch(session.projectDir!, session.cwd, session.previewBranch)
  return result
}

async function requireManagedSession(id: string): Promise<StoredTerminalSession> {
  const session = await readStoredSession(id)
  if (!session) throw new Error('Conversation not found')
  if (session.finalized) throw new Error('Conversation is already finalized')
  if (!session.projectDir || !session.worktreeBranch) throw new Error('Conversation has no managed worktree')
  return session
}

async function requireTargetBranch(projectDir: string, value: string) {
  const branch = value.trim()
  if (!/^(?!-)[a-zA-Z0-9._/-]+$/.test(branch) || branch.startsWith('sc/')) {
    throw new Error('Invalid target branch')
  }
  await git(projectDir, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])
  return branch
}

export async function syncPreviewBranch(projectDir: string, worktreePath: string, previewBranch: string) {
  // Serialize per main checkout: the turn-end auto-commit and the HEAD watcher
  // can both fire a sync for the same commit, and two concurrent `reset --hard`
  // in the main worktree collide on `.git/index.lock` — one fails outright,
  // which surfaced the "sc/preview did not follow the auto-commit" report.
  // Queuing also means the last sync always reads the freshest worktree HEAD,
  // so a slower call can never rewind the branch to an older commit.
  return serialize(`preview-sync:${projectDir}`, async () => {
    if (!await localBranchExists(projectDir, previewBranch)) return

    const worktreeHead = await gitOutput(worktreePath, ['rev-parse', 'HEAD'])
    const currentBranch = await gitOutput(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')

    if (currentBranch === previewBranch) {
      await git(projectDir, ['reset', '--hard', worktreeHead])
    } else {
      await git(projectDir, ['update-ref', `refs/heads/${previewBranch}`, worktreeHead])
    }
  })
}

async function deletePreviewBranch(projectDir: string, previewBranch: string) {
  if (previewBranch !== 'sc/preview') throw new Error('Invalid preview branch')
  await git(projectDir, ['branch', '-D', previewBranch]).catch(() => {})
}

/** True when nothing is staged (index matches HEAD), i.e. `git commit` would fail. */
async function isIndexClean(cwd: string) {
  try {
    await git(cwd, ['diff', '--cached', '--quiet'])
    return true
  } catch {
    return false
  }
}

async function localBranchExists(projectDir: string, branch: string) {
  try {
    await git(projectDir, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])
    return true
  } catch {
    return false
  }
}

async function getConflictFiles(cwd: string) {
  const output = await gitOutput(cwd, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')
  return output.split('\n').map((file) => file.trim()).filter(Boolean)
}

async function ensureNoRebaseInProgress(cwd: string) {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const path = await gitOutput(cwd, ['rev-parse', '--git-path', name])
    try {
      await access(path)
      throw new Error('A rebase is already in progress. Resolve it with git rebase --continue or abort it before retrying.')
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('A rebase is already')) throw error
    }
  }
}

async function killTmux(name: string) {
  await execFileAsync(TMUX_BIN, ['kill-session', '-t', name]).catch(() => {})
}

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationQueue.get(key) || Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  operationQueue.set(key, next)
  return next.finally(() => {
    if (operationQueue.get(key) === next) operationQueue.delete(key)
  })
}

function integrationError(message: string, conflictFiles: string[]) {
  return Object.assign(new Error(message), { conflictFiles })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function gitOutput(cwd: string, args: string[]) {
  const { stdout } = await git(cwd, args)
  return stdout.trim()
}

function git(cwd: string, args: string[]) {
  return execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
}
