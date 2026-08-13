import { describe, expect, test } from 'bun:test'
import { APP_MODAL_PRIORITY, runTopmostModalHandler } from '../utils/modal-stack'

describe('application modal stack', () => {
  test('keeps keyboard handling aligned with visual stacking priority', () => {
    expect(APP_MODAL_PRIORITY).toEqual([
      'gitDialog',
      'worktrees',
      'spec',
      'remotes',
      'integration',
      'conflictReport',
      'newSession',
      'settings'
    ])
  })

  test('runs only the first handler that accepts the action', () => {
    const calls: string[] = []
    const handled = runTopmostModalHandler({
      gitDialog: () => { calls.push('gitDialog'); return false },
      worktrees: () => { calls.push('worktrees'); return false },
      spec: () => { calls.push('spec'); return true },
      remotes: () => { calls.push('remotes'); return true }
    })

    expect(handled).toBe(true)
    expect(calls).toEqual(['gitDialog', 'worktrees', 'spec'])
  })

  test('returns false when no modal handles the action', () => {
    expect(runTopmostModalHandler({})).toBe(false)
  })
})
