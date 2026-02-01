/**
 * Git File Watcher Manager
 *
 * Uses chokidar to watch .git/ directory for changes and notifies subscribers.
 * Watches key paths: HEAD, refs/, index, MERGE_HEAD, REBASE_HEAD
 * Debounces rapid changes (500ms) to avoid flooding.
 */

import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

type ChangeCallback = (workingDirectory: string) => void

interface DirectoryWatcher {
  watcher: FSWatcher
  subscribers: Set<ChangeCallback>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, DirectoryWatcher>()

function getGitDir(workingDirectory: string): string | null {
  const gitDir = join(workingDirectory, '.git')
  if (existsSync(gitDir)) return gitDir
  return null
}

function notifySubscribers(workingDirectory: string) {
  const entry = watchers.get(workingDirectory)
  if (!entry) return

  for (const callback of entry.subscribers) {
    try {
      callback(workingDirectory)
    } catch {
      // Subscriber error should not crash watcher
    }
  }
}

function startWatcher(workingDirectory: string): DirectoryWatcher | null {
  const gitDir = getGitDir(workingDirectory)
  if (!gitDir) return null

  // Watch key git paths that indicate state changes
  const watchPaths = [
    join(gitDir, 'HEAD'),          // checkout, commit
    join(gitDir, 'refs'),          // branch create/delete, push/pull
    join(gitDir, 'index'),         // stage/unstage
    join(gitDir, 'MERGE_HEAD'),    // merge in progress
    join(gitDir, 'REBASE_HEAD'),   // rebase in progress
    join(gitDir, 'COMMIT_EDITMSG'), // commit message
  ]

  const watcher = chokidarWatch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    // refs/ is a directory, watch recursively
    depth: 3,
  })

  const entry: DirectoryWatcher = {
    watcher,
    subscribers: new Set(),
    debounceTimer: null,
  }

  const handleChange = () => {
    // Debounce: wait 500ms of no changes before notifying
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null
      notifySubscribers(workingDirectory)
    }, 500)
  }

  watcher.on('change', handleChange)
  watcher.on('add', handleChange)
  watcher.on('unlink', handleChange)

  return entry
}

/**
 * Subscribe to git changes for a specific working directory.
 * Returns an unsubscribe function.
 */
export function subscribeGitChanges(workingDirectory: string, callback: ChangeCallback): () => void {
  let entry = watchers.get(workingDirectory)

  if (!entry) {
    const newEntry = startWatcher(workingDirectory)
    if (!newEntry) {
      console.warn(`[GitWatcher] Cannot watch ${workingDirectory}: .git directory not found`)
      return () => {}
    }
    entry = newEntry
    watchers.set(workingDirectory, entry)
    console.log(`[GitWatcher] Started watching: ${workingDirectory}`)
  }

  entry.subscribers.add(callback)

  return () => {
    entry!.subscribers.delete(callback)

    // Stop watcher if no more subscribers
    if (entry!.subscribers.size === 0) {
      if (entry!.debounceTimer) {
        clearTimeout(entry!.debounceTimer)
      }
      entry!.watcher.close()
      watchers.delete(workingDirectory)
      console.log(`[GitWatcher] Stopped watching: ${workingDirectory}`)
    }
  }
}
