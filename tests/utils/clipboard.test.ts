import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeTextToClipboard } from '~/utils/clipboard'

function setClipboard(clipboard: Pick<Clipboard, 'writeText'> | undefined) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  })
}

function setExecCommand(impl: (command: string) => boolean) {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn(impl),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  setClipboard(undefined)
  document.querySelectorAll('textarea').forEach((node) => node.remove())
})

describe('writeTextToClipboard', () => {
  it('uses the native clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    await writeTextToClipboard('abc123')

    expect(writeText).toHaveBeenCalledWith('abc123')
  })

  it('falls back to execCommand when the native clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard({ writeText })
    setExecCommand(() => true)

    await writeTextToClipboard('fallback-text')

    expect(writeText).toHaveBeenCalledWith('fallback-text')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('throws when native and fallback clipboard writes both fail', async () => {
    setClipboard(undefined)
    setExecCommand(() => false)

    await expect(writeTextToClipboard('nope')).rejects.toThrow('Failed to copy to clipboard')
  })
})
