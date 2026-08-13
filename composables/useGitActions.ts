import type { Ref } from 'vue'
import type { GitDialogField } from '~/types/app'
import { stashName } from '~/utils/app-formatters'

type DialogOptions = {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  fields?: GitDialogField[]
}
type DialogResult = Record<string, string | boolean> | null
type RunAction = (action: string, payload?: Record<string, unknown>) => Promise<boolean>

export function useGitActions(options: {
  gitCommitMessage: Ref<string>
  selectedUncommittedChanges: Ref<boolean>
  openDialog: (options: DialogOptions) => Promise<DialogResult>
  runAction: RunAction
}) {
  const { gitCommitMessage, selectedUncommittedChanges, openDialog, runAction } = options
  const simple = (action: string, payload: Record<string, unknown> = {}) => runAction(action, payload)
  const remoteParts = (branch: string) => {
    const [remote, ...rest] = branch.split('/')
    return { remote, branch: rest.join('/') || branch }
  }

  const checkoutRef = (value: string) => simple('checkout', { branch: value })
  const stageFiles = (files: string[] = []) => simple('stage', { files })
  const unstageFiles = (files: string[] = []) => simple('unstage', { files })
  const fetchBranch = (branch?: string) => simple('fetch', branch ? { branch } : {})
  const applyStash = (index: number) => simple('applyStash', { stash: index })
  const popStash = (index: number) => simple('popStash', { stash: index })

  async function createBranchFrom(hash: string) {
    const result = await openDialog({ title: 'Create Branch', message: `From commit ${hash.slice(0, 8)}`, confirmLabel: 'Create', fields: [{ kind: 'text', key: 'newName', label: 'Branch name', value: '', placeholder: 'feature/my-branch' }] })
    if (result?.newName) await simple('createBranch', { hash, newName: result.newName })
  }
  async function renameBranch(branch: string) {
    const result = await openDialog({ title: 'Rename Branch', confirmLabel: 'Rename', fields: [{ kind: 'text', key: 'newName', label: 'New branch name', value: branch }] })
    if (result?.newName && result.newName !== branch) await simple('renameBranch', { branch, newName: result.newName })
  }
  async function deleteBranch(branch: string, isRemote: boolean) {
    if (isRemote) {
      const result = await openDialog({ title: 'Delete Remote Branch', message: `Delete branch ${branch} from its remote?`, danger: true, confirmLabel: 'Delete' })
      if (result) await simple('deleteRemoteBranch', remoteParts(branch))
      return
    }
    const result = await openDialog({ title: 'Delete Branch', message: `Delete branch ${branch}?`, danger: true, confirmLabel: 'Delete', fields: [{ kind: 'checkbox', key: 'force', label: 'Force delete even if not fully merged', value: false }] })
    if (result) await simple('deleteBranch', { branch, force: result.force })
  }
  async function mergeRef(value: string) {
    const result = await openDialog({ title: 'Merge into Current Branch', message: `Merge ${value} into the current branch.`, confirmLabel: 'Merge', fields: [
      { kind: 'checkbox', key: 'noCommit', label: 'No commit (--no-commit)', value: false },
      { kind: 'checkbox', key: 'noFastForward', label: 'Create a merge commit (--no-ff)', value: false },
      { kind: 'checkbox', key: 'squash', label: 'Squash commits (--squash)', value: false }
    ] })
    if (result) await simple('merge', { branch: value, noCommit: result.noCommit, noFastForward: result.noFastForward, squash: result.squash })
  }
  async function rebaseOnto(value: string) {
    if (await openDialog({ title: 'Rebase', message: `Rebase the current branch onto ${value}?`, confirmLabel: 'Rebase' })) await simple('rebase', { branch: value })
  }
  async function commitStagedChanges() {
    const message = gitCommitMessage.value.trim()
    if (message && await simple('commit', { message })) {
      gitCommitMessage.value = ''
      selectedUncommittedChanges.value = false
    }
  }
  async function pushBranch(branch: string) {
    const result = await openDialog({ title: 'Push Branch', message: `Push ${branch} to a remote.`, confirmLabel: 'Push', fields: [
      { kind: 'text', key: 'remote', label: 'Remote', value: 'origin' },
      { kind: 'checkbox', key: 'forceWithLease', label: 'Force push (--force-with-lease)', value: false }
    ] })
    if (result) await simple('push', { remote: result.remote || 'origin', branch, forceWithLease: result.forceWithLease })
  }
  async function pullBranch(branch: string) {
    const result = await openDialog({ title: 'Pull Branch', message: `Pull ${branch} from a remote.`, confirmLabel: 'Pull', fields: [{ kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }] })
    if (result) await simple('pull', { remote: result.remote || 'origin', branch })
  }
  async function addTag(hash: string) {
    const result = await openDialog({ title: 'Add Tag', message: `Tag commit ${hash.slice(0, 8)}.`, confirmLabel: 'Add Tag', fields: [
      { kind: 'text', key: 'tag', label: 'Tag name', value: '', placeholder: 'v1.0.0' },
      { kind: 'text', key: 'message', label: 'Annotated tag message (empty for lightweight)', value: '' }
    ] })
    if (result?.tag) await simple('addTag', { hash, tag: result.tag, message: result.message })
  }
  async function deleteTag(tag: string) {
    const result = await openDialog({ title: 'Delete Tag', message: `Delete tag ${tag}?`, danger: true, confirmLabel: 'Delete', fields: [
      { kind: 'checkbox', key: 'deleteRemote', label: 'Also delete from remote', value: false },
      { kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }
    ] })
    if (result) await simple('deleteTag', { tag, deleteRemote: result.deleteRemote, remote: result.deleteRemote ? result.remote || 'origin' : undefined })
  }
  async function pushTag(tag: string) {
    const result = await openDialog({ title: 'Push Tag', message: `Push tag ${tag} to a remote.`, confirmLabel: 'Push', fields: [{ kind: 'text', key: 'remote', label: 'Remote', value: 'origin' }] })
    if (result) await simple('pushTag', { tag, remote: result.remote || 'origin' })
  }
  async function cherryPickCommit(hash: string) {
    const result = await openDialog({ title: 'Cherry Pick', message: `Cherry pick commit ${hash.slice(0, 8)} onto the current branch.`, confirmLabel: 'Cherry Pick', fields: [{ kind: 'checkbox', key: 'noCommit', label: 'No commit (--no-commit)', value: false }] })
    if (result) await simple('cherryPick', { hash, noCommit: result.noCommit })
  }
  async function revertCommit(hash: string) {
    if (await openDialog({ title: 'Revert Commit', message: `Revert commit ${hash.slice(0, 8)}?`, danger: true, confirmLabel: 'Revert' })) await simple('revert', { hash })
  }
  async function resetToCommit(hash: string) {
    const result = await openDialog({ title: 'Reset Current Branch', message: `Reset the current branch to ${hash.slice(0, 8)}. Hard reset discards local changes.`, danger: true, confirmLabel: 'Reset', fields: [{ kind: 'select', key: 'mode', label: 'Reset mode', value: 'mixed', options: ['soft', 'mixed', 'hard'] }] })
    if (result && ['soft', 'mixed', 'hard'].includes(String(result.mode))) await simple('reset', { hash, mode: result.mode })
  }
  async function stashWorkingTree() {
    const result = await openDialog({ title: 'Stash Changes', confirmLabel: 'Stash', fields: [
      { kind: 'text', key: 'message', label: 'Stash message (optional)', value: '' },
      { kind: 'checkbox', key: 'includeUntracked', label: 'Include untracked files', value: false }
    ] })
    if (result) await simple('stash', { message: result.message, includeUntracked: result.includeUntracked })
  }
  async function resetWorkingTree() {
    const result = await openDialog({ title: 'Reset Working Tree', message: 'Hard reset discards local changes.', danger: true, confirmLabel: 'Reset', fields: [{ kind: 'select', key: 'mode', label: 'Reset mode', value: 'mixed', options: ['mixed', 'hard'] }] })
    if (result && ['mixed', 'hard'].includes(String(result.mode))) await simple('resetWorking', { mode: result.mode })
  }
  async function cleanUntracked() {
    if (await openDialog({ title: 'Clean Untracked Files', message: 'Delete untracked files and directories? This cannot be undone.', danger: true, confirmLabel: 'Delete' })) await simple('cleanUntracked')
  }
  async function dropStash(index: number) {
    if (await openDialog({ title: 'Drop Stash', message: `Drop ${stashName(index)}? This cannot be undone.`, danger: true, confirmLabel: 'Drop' })) await simple('dropStash', { stash: index })
  }
  async function createBranchFromStash(index: number) {
    const result = await openDialog({ title: 'Create Branch from Stash', message: `Create a branch from ${stashName(index)}.`, confirmLabel: 'Create', fields: [{ kind: 'text', key: 'newName', label: 'Branch name', value: '' }] })
    if (result?.newName) await simple('stashBranch', { stash: index, newName: result.newName })
  }

  return { checkoutRef, createBranchFrom, renameBranch, deleteBranch, mergeRef, rebaseOnto,
    stageFiles, unstageFiles, commitStagedChanges, pushBranch, pullBranch, fetchBranch, addTag,
    deleteTag, pushTag, cherryPickCommit, revertCommit, resetToCommit, stashWorkingTree,
    resetWorkingTree, cleanUntracked, applyStash, popStash, dropStash, createBranchFromStash }
}
