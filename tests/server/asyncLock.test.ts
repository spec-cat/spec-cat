import { describe, expect, it } from 'vitest'
import { withLock } from '~/server/utils/asyncLock'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('withLock', () => {
  it('serializes tasks sharing a key (no interleaving)', async () => {
    const order: string[] = []

    const makeTask = (label: string) => async () => {
      order.push(`${label}:start`)
      await tick()
      await tick()
      order.push(`${label}:end`)
      return label
    }

    const [a, b] = await Promise.all([
      withLock('k', makeTask('a')),
      withLock('k', makeTask('b')),
    ])

    expect(a).toBe('a')
    expect(b).toBe('b')
    // b must not start until a has finished.
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('runs tasks under different keys concurrently', async () => {
    const order: string[] = []
    await Promise.all([
      withLock('x', async () => { order.push('x:start'); await tick(); order.push('x:end') }),
      withLock('y', async () => { order.push('y:start'); await tick(); order.push('y:end') }),
    ])
    // Both should have started before either ended (interleaved).
    expect(order.slice(0, 2).sort()).toEqual(['x:start', 'y:start'])
  })

  it('does not let a rejected task poison the chain for the same key', async () => {
    const failing = withLock('k', async () => { throw new Error('boom') })
    await expect(failing).rejects.toThrow('boom')

    const next = await withLock('k', async () => 'ok')
    expect(next).toBe('ok')
  })

  it('propagates the task result and rejection to the caller', async () => {
    await expect(withLock('r', async () => 42)).resolves.toBe(42)
    await expect(withLock('r', async () => { throw new Error('x') })).rejects.toThrow('x')
  })
})
