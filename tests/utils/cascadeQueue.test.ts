import { describe, expect, it } from 'vitest'
import { createCascadeRegistry } from '~/utils/cascadeQueue'

describe('cascadeQueue', () => {
  it('enable creates a queue copy (not reference) for isolation', () => {
    const registry = createCascadeRegistry()
    const steps = ['clarify', 'plan', 'tasks']
    registry.enable('c1', 'feat-001', steps)

    // Mutating caller's array does not affect registry state
    steps.push('implement')
    const next = registry.popNextStep('c1')
    expect(next).toEqual({ featureId: 'feat-001', step: 'clarify' })
    // Only 3 original steps should remain
    registry.popNextStep('c1')
    const last = registry.popNextStep('c1')
    expect(last?.step).toBe('tasks')
    expect(registry.popNextStep('c1')).toBeNull()
  })

  it('popNextStep returns null when conversation has no cascade', () => {
    const registry = createCascadeRegistry()
    expect(registry.popNextStep('unknown')).toBeNull()
  })

  it('popNextStep returns null when queue is empty', () => {
    const registry = createCascadeRegistry()
    registry.enable('c1', 'f1', [])
    expect(registry.popNextStep('c1')).toBeNull()
  })

  it('popNextStep yields steps in FIFO order', () => {
    const registry = createCascadeRegistry()
    registry.enable('c1', 'f1', ['a', 'b', 'c'])
    expect(registry.popNextStep('c1')?.step).toBe('a')
    expect(registry.popNextStep('c1')?.step).toBe('b')
    expect(registry.popNextStep('c1')?.step).toBe('c')
    expect(registry.popNextStep('c1')).toBeNull()
  })

  it('popNextStep deletes entry when queue drains', () => {
    const registry = createCascadeRegistry()
    registry.enable('c1', 'f1', ['only'])
    expect(registry.has('c1')).toBe(true)
    registry.popNextStep('c1')
    expect(registry.has('c1')).toBe(false)
  })

  it('disable(id) removes a specific entry', () => {
    const registry = createCascadeRegistry()
    registry.enable('a', 'f1', ['x'])
    registry.enable('b', 'f2', ['y'])
    registry.disable('a')
    expect(registry.has('a')).toBe(false)
    expect(registry.has('b')).toBe(true)
  })

  it('disable() without id clears all entries', () => {
    const registry = createCascadeRegistry()
    registry.enable('a', 'f1', ['x'])
    registry.enable('b', 'f2', ['y'])
    registry.disable()
    expect(registry.size()).toBe(0)
  })

  it('get returns the entry without mutation', () => {
    const registry = createCascadeRegistry()
    registry.enable('c1', 'f1', ['a', 'b'])
    const e1 = registry.get('c1')
    const e2 = registry.get('c1')
    expect(e1).toEqual({ featureId: 'f1', queue: ['a', 'b'] })
    expect(e2?.queue).toEqual(['a', 'b'])
  })

  it('re-enabling overwrites prior queue', () => {
    const registry = createCascadeRegistry()
    registry.enable('c1', 'f1', ['a', 'b'])
    registry.enable('c1', 'f1', ['x'])
    expect(registry.popNextStep('c1')?.step).toBe('x')
    expect(registry.popNextStep('c1')).toBeNull()
  })

  it('independent conversations have independent queues', () => {
    const registry = createCascadeRegistry()
    registry.enable('a', 'f1', ['1', '2'])
    registry.enable('b', 'f2', ['3'])
    expect(registry.popNextStep('a')?.step).toBe('1')
    expect(registry.popNextStep('b')?.step).toBe('3')
    expect(registry.popNextStep('a')?.step).toBe('2')
  })
})
