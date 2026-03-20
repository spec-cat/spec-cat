import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ConversationEventBus } from './eventBusHelper'

// We test the ConversationEventBus class logic via a fresh instance per test.
// The singleton `eventBus` is not imported to avoid cross-test pollution.

describe('ConversationEventBus', () => {
  let bus: ConversationEventBus

  beforeEach(() => {
    bus = new ConversationEventBus()
  })

  // ── subscribe / emit basics ──────────────────────────

  it('delivers emitted events to subscribers of the same channel', () => {
    const cb = vi.fn()
    bus.subscribe('conv-1', cb)

    bus.emit('conv-1', { type: 'hello' })

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ type: 'hello' })
  })

  it('does not deliver events to subscribers of a different channel', () => {
    const cb = vi.fn()
    bus.subscribe('conv-1', cb)

    bus.emit('conv-2', { type: 'hello' })

    expect(cb).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers on the same channel', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.subscribe('conv-1', cb1)
    bus.subscribe('conv-1', cb2)

    bus.emit('conv-1', { type: 'multi' })

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('delivers events with extra payload fields', () => {
    const cb = vi.fn()
    bus.subscribe('conv-1', cb)

    bus.emit('conv-1', { type: 'data', value: 42, nested: { a: 1 } })

    expect(cb).toHaveBeenCalledWith({ type: 'data', value: 42, nested: { a: 1 } })
  })

  // ── unsubscribe ──────────────────────────────────────

  it('stops delivering events after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = bus.subscribe('conv-1', cb)

    bus.emit('conv-1', { type: 'before' })
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
    bus.emit('conv-1', { type: 'after' })
    expect(cb).toHaveBeenCalledTimes(1) // no new calls
  })

  it('removes channel entry when last subscriber unsubscribes', () => {
    const cb = vi.fn()
    const unsub = bus.subscribe('conv-1', cb)

    expect(bus.hasSubscribers('conv-1')).toBe(true)

    unsub()

    expect(bus.hasSubscribers('conv-1')).toBe(false)
  })

  it('keeps channel alive when one of multiple subscribers unsubscribes', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = bus.subscribe('conv-1', cb1)
    bus.subscribe('conv-1', cb2)

    unsub1()

    expect(bus.hasSubscribers('conv-1')).toBe(true)

    bus.emit('conv-1', { type: 'still' })
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('double unsubscribe is a no-op', () => {
    const cb = vi.fn()
    const unsub = bus.subscribe('conv-1', cb)

    unsub()
    unsub() // should not throw

    expect(bus.hasSubscribers('conv-1')).toBe(false)
  })

  // ── hasSubscribers ───────────────────────────────────

  it('returns false for channels that never had subscribers', () => {
    expect(bus.hasSubscribers('never')).toBe(false)
  })

  it('returns true when channel has active subscribers', () => {
    bus.subscribe('conv-1', vi.fn())
    expect(bus.hasSubscribers('conv-1')).toBe(true)
  })

  // ── error isolation ──────────────────────────────────

  it('continues delivering to other subscribers when one throws', () => {
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()

    bus.subscribe('conv-1', bad)
    bus.subscribe('conv-1', good)

    bus.emit('conv-1', { type: 'test' })

    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('does not throw when emitting to a channel with no subscribers', () => {
    expect(() => bus.emit('empty', { type: 'noop' })).not.toThrow()
  })

  // ── channel isolation ────────────────────────────────

  it('maintains independent subscriber sets per channel', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    bus.subscribe('conv-a', cb1)
    bus.subscribe('conv-b', cb2)

    bus.emit('conv-a', { type: 'a' })
    bus.emit('conv-b', { type: 'b' })

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb1).toHaveBeenCalledWith({ type: 'a' })
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledWith({ type: 'b' })
  })

  // ── GLOBAL_CHANNEL ──────────────────────────────────

  it('__global__ channel works the same as any other channel', () => {
    const cb = vi.fn()
    bus.subscribe('__global__', cb)

    bus.emit('__global__', { type: 'notification', notificationEvent: 'job_created' })

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'notification' }))
  })

  // ── ordering ─────────────────────────────────────────

  it('delivers events in subscription order', () => {
    const order: number[] = []
    bus.subscribe('conv-1', () => order.push(1))
    bus.subscribe('conv-1', () => order.push(2))
    bus.subscribe('conv-1', () => order.push(3))

    bus.emit('conv-1', { type: 'order' })

    expect(order).toEqual([1, 2, 3])
  })

  // ── multiple events ──────────────────────────────────

  it('delivers multiple events sequentially', () => {
    const events: string[] = []
    bus.subscribe('conv-1', (e) => events.push(e.type))

    bus.emit('conv-1', { type: 'first' })
    bus.emit('conv-1', { type: 'second' })
    bus.emit('conv-1', { type: 'third' })

    expect(events).toEqual(['first', 'second', 'third'])
  })
})
