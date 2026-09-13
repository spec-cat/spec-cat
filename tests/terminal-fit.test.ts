import { describe, expect, test } from 'bun:test'
import { createTerminalFitScheduler, TERMINAL_SETTLE_DELAYS } from '../utils/terminal-fit'

function clockHarness() {
  let nextTimer = 1
  let nextFrame = 100
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const frames = new Map<number, () => void>()
  const cleared: number[] = []
  const cancelled: number[] = []
  return {
    timers,
    frames,
    cleared,
    cancelled,
    clock: {
      setTimeout(callback: () => void, delay: number) {
        const id = nextTimer++
        timers.set(id, { callback: () => { timers.delete(id); callback() }, delay })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout(timer: ReturnType<typeof setTimeout>) {
        const id = timer as unknown as number
        cleared.push(id)
        timers.delete(id)
      },
      requestAnimationFrame(callback: () => void) {
        const id = nextFrame++
        frames.set(id, callback)
        return id
      },
      cancelAnimationFrame(frame: number) {
        cancelled.push(frame)
        frames.delete(frame)
      }
    }
  }
}

describe('terminal fit scheduling', () => {
  test('invokes receiver-sensitive default browser clocks through globalThis', () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    const timer = 41 as unknown as ReturnType<typeof setTimeout>
    const calls: string[] = []
    globalThis.setTimeout = function (this: typeof globalThis, callback: () => void) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      calls.push('timeout')
      return timer
    } as typeof setTimeout
    globalThis.clearTimeout = function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      calls.push('clear-timeout')
    } as typeof clearTimeout
    globalThis.requestAnimationFrame = function () {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      calls.push('frame')
      return 42
    }
    globalThis.cancelAnimationFrame = function () {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      calls.push('cancel-frame')
    }

    try {
      const scheduler = createTerminalFitScheduler(() => {})
      scheduler.schedule()
      scheduler.schedule()
      scheduler.dispose()
      expect(calls).toEqual(['timeout', 'clear-timeout', 'timeout', 'clear-timeout'])
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  test('rapid resize replaces the pending fit and keeps the latest delay', () => {
    const harness = clockHarness()
    const scheduler = createTerminalFitScheduler(() => {}, harness.clock)
    scheduler.schedule(80)
    scheduler.schedule(120)
    expect(harness.cleared).toEqual([1])
    expect([...harness.timers.values()].map((timer) => timer.delay)).toEqual([120])
  })

  test('preserves the immediate, 50ms, 150ms, and 350ms settle sequence', () => {
    const harness = clockHarness()
    const scheduler = createTerminalFitScheduler(() => {}, harness.clock)
    scheduler.settle()
    expect([...harness.timers.values()].map((timer) => timer.delay).sort((a, b) => a - b))
      .toEqual([0, ...TERMINAL_SETTLE_DELAYS])
  })

  test('dispose cancels pending timers and an outstanding animation frame', () => {
    const harness = clockHarness()
    const scheduler = createTerminalFitScheduler(() => {}, harness.clock)
    scheduler.schedule()
    harness.timers.get(1)?.callback()
    scheduler.dispose()
    expect(harness.cancelled).toEqual([100])
    expect(harness.timers.size).toBe(0)
    expect(harness.frames.size).toBe(0)
  })
})
