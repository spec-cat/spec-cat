import { describe, expect, test } from 'bun:test'
import { createPollingLoop, type PollingScheduler } from '../utils/polling-loop'

describe('polling loop ownership', () => {
  test('starts once, preserves the interval, and stops its owned timer once', () => {
    const scheduled: Array<{ callback: () => void, interval: number, timer: number }> = []
    const cleared: number[] = []
    const scheduler = {
      set(callback, interval) {
        const timer = scheduled.length + 1
        scheduled.push({ callback, interval, timer })
        return timer as unknown as ReturnType<typeof setInterval>
      },
      clear(timer) { cleared.push(timer as unknown as number) }
    } satisfies PollingScheduler
    let calls = 0
    const loop = createPollingLoop(() => { calls += 1 }, 1000, scheduler)
    loop.start(); loop.start()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]?.interval).toBe(1000)
    scheduled[0]?.callback()
    expect(calls).toBe(1)
    loop.stop(); loop.stop()
    expect(cleared).toEqual([1])
    expect(loop.isRunning()).toBe(false)
  })
})
