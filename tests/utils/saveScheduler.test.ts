import { describe, expect, it, vi } from 'vitest'
import { createSaveScheduler } from '~/utils/saveScheduler'

describe('createSaveScheduler', () => {
  it('schedules a flush after delayMs', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      expect(onFlush).not.toHaveBeenCalled()

      vi.advanceTimersByTime(99)
      expect(onFlush).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(onFlush).toHaveBeenCalledWith('a')
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces repeated schedule() calls during the debounce window', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      s.schedule('a')
      s.schedule('a')
      vi.advanceTimersByTime(100)
      expect(onFlush).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps timers per-key independent', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      s.schedule('b')
      expect(s.pendingCount()).toBe(2)
      vi.advanceTimersByTime(100)
      expect(onFlush).toHaveBeenCalledTimes(2)
      expect(onFlush).toHaveBeenCalledWith('a')
      expect(onFlush).toHaveBeenCalledWith('b')
    } finally {
      vi.useRealTimers()
    }
  })

  it('flush() runs onFlush immediately and cancels the pending timer', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      s.flush('a')
      expect(onFlush).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(200)
      // No additional flush from the expired timer
      expect(onFlush).toHaveBeenCalledTimes(1)
      expect(s.hasPending('a')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flush() runs even when no schedule was queued', () => {
    const onFlush = vi.fn()
    const s = createSaveScheduler({ onFlush, delayMs: 100 })
    s.flush('a')
    expect(onFlush).toHaveBeenCalledWith('a')
  })

  it('cancel() drops the pending timer without flushing', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      s.cancel('a')
      vi.advanceTimersByTime(200)
      expect(onFlush).not.toHaveBeenCalled()
      expect(s.hasPending('a')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancelAll() drops every pending timer', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      s.schedule('b')
      s.cancelAll()
      vi.advanceTimersByTime(200)
      expect(onFlush).not.toHaveBeenCalled()
      expect(s.pendingCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('can re-schedule after a flush', () => {
    vi.useFakeTimers()
    try {
      const onFlush = vi.fn()
      const s = createSaveScheduler({ onFlush, delayMs: 100 })
      s.schedule('a')
      vi.advanceTimersByTime(100)
      expect(onFlush).toHaveBeenCalledTimes(1)

      s.schedule('a')
      vi.advanceTimersByTime(100)
      expect(onFlush).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
