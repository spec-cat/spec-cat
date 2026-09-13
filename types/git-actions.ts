/** Action identifiers shared by Git UI controllers and the Nitro dispatcher. */
export const GIT_ACTIONS = [
  'checkout', 'createBranch', 'renameBranch', 'deleteBranch', 'deleteRemoteBranch',
  'merge', 'rebase', 'stage', 'unstage', 'commit', 'push', 'pull', 'fetch',
  'addRemote', 'editRemote', 'deleteRemote', 'addTag', 'deleteTag', 'pushTag',
  'cherryPick', 'revert', 'reset', 'stash', 'applyStash', 'popStash', 'dropStash',
  'stashBranch', 'resetWorking', 'cleanUntracked'
] as const

export type GitActionId = typeof GIT_ACTIONS[number]

export function isGitActionId(value: string): value is GitActionId {
  return (GIT_ACTIONS as readonly string[]).includes(value)
}
