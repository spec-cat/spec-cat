import { describe, expect, test } from 'bun:test'
import { pollUntil } from '../server/utils/async-poll'

describe('async polling mechanics', () => {
  test('runs checks sequentially until one succeeds', async () => {
    let calls = 0
    let active = 0
    let maxActive = 0
    const result = await pollUntil({
      intervalMs: 1,
      deadline: Date.now() + 100,
      check: async () => {
        calls++
        active++
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active--
        return calls === 3
      }
    })
    expect(result).toBe(true)
    expect(calls).toBe(3)
    expect(maxActive).toBe(1)
  })

  test('returns false after the deadline', async () => {
    const result = await pollUntil({
      intervalMs: 2,
      deadline: Date.now() + 5,
      check: () => false
    })
    expect(result).toBe(false)
  })

  test('cancels an outstanding delay with the caller message', async () => {
    const controller = new AbortController()
    const result = pollUntil({
      intervalMs: 1000,
      signal: controller.signal,
      abortedMessage: 'Job aborted',
      check: () => false
    })
    controller.abort()
    await expect(result).rejects.toThrow('Job aborted')
  })
})
