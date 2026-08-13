import { describe, expect, test } from 'bun:test'
import { canFinishShellInitialization, shouldReuseShellConnection } from '../composables/useShellTerminal'

describe('shell connection reuse', () => {
  test('reuses a connecting or open socket for the active shell', () => {
    expect(shouldReuseShellConnection('shell-1', 'shell-1', 0)).toBe(true)
    expect(shouldReuseShellConnection('shell-1', 'shell-1', 1)).toBe(true)
  })

  test('reconnects for a different shell or a closed socket', () => {
    expect(shouldReuseShellConnection('shell-1', 'shell-2', 1)).toBe(false)
    expect(shouldReuseShellConnection('shell-1', 'shell-1', 2)).toBe(false)
    expect(shouldReuseShellConnection('shell-1', 'shell-1', 3)).toBe(false)
  })

  test('abandons asynchronous initialization after unmount or mount replacement', () => {
    const initialMount = {}
    expect(canFinishShellInitialization(false, initialMount, initialMount)).toBe(true)
    expect(canFinishShellInitialization(true, initialMount, initialMount)).toBe(false)
    expect(canFinishShellInitialization(false, {}, initialMount)).toBe(false)
    expect(canFinishShellInitialization(false, null, initialMount)).toBe(false)
  })
})
