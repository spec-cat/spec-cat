import { describe, expect, test } from 'bun:test'
import { createTurnMonitor } from '../server/utils/turn-monitor'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('turn monitor', () => {
  test('keeps watching after repeated incomplete quiet checks', async () => {
    let screen = 'Do you want to allow this command?\n❯ yes/no'
    let captures = 0
    let completions = 0

    const monitor = createTurnMonitor({
      provider: 'claude',
      quietMs: 1,
      minTurnMs: 1,
      maxTurnMs: 1000,
      captureScreen: async () => {
        captures += 1
        return screen
      },
      onComplete: async () => {
        completions += 1
      }
    })

    monitor.submitted()
    monitor.output()

    await wait(40)
    expect(captures).toBeGreaterThan(12)
    expect(completions).toBe(0)

    screen = 'Done\n❯\nshortcuts'
    await wait(10)

    expect(completions).toBe(1)
    monitor.dispose()
  })
})
