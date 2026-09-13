import { createPollingLoop } from '~/utils/polling-loop'

export function useAppPolling(options: {
  refreshSessions: () => Promise<void>
  pollGitState: () => Promise<void> | undefined
}) {
  // One owner per loop prevents remount/setup paths from installing duplicate
  // intervals while preserving the 1s runtime and 3s repository freshness.
  const sessions = createPollingLoop(() => { void options.refreshSessions() }, 1000)
  const gitState = createPollingLoop(() => { void options.pollGitState() }, 3000)
  return {
    startPolling() { sessions.start(); gitState.start() },
    stopPolling() { sessions.stop(); gitState.stop() }
  }
}
