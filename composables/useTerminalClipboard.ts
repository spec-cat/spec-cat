import type { Terminal } from '@xterm/xterm'
import type { ToastType } from '~/types/app'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useTerminalClipboard(pushToast: PushToast) {
  async function writeClipboard(value: string): Promise<boolean> {
    try {
      if (window.navigator.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(value)
        return true
      }
    } catch {
      // Permission failures fall through to the HTTP-compatible legacy path.
    }
    return legacyCopy(value)
  }

  function legacyCopy(value: string) {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      return copied
    } catch {
      return false
    }
  }

  async function writeTerminalSelection(value: string, notifySuccess: boolean) {
    if (await writeClipboard(value)) {
      if (notifySuccess) pushToast('success', 'Selection copied to clipboard.', 1200)
    } else {
      pushToast('error', 'Could not copy terminal selection.', 4000)
    }
  }

  function handleTerminalCopyKey(event: KeyboardEvent, getTerminal: () => Terminal | null) {
    if (event.type !== 'keydown' || event.key.toLowerCase() !== 'c' || !(event.metaKey || event.ctrlKey)) return true
    const selected = getTerminal()?.getSelection()
    if (!selected) return true
    event.preventDefault()
    event.stopPropagation()
    void writeTerminalSelection(selected, true)
    return false
  }

  function attachTerminalClipboardBridge(term: Terminal, mount: HTMLElement) {
    let lastCopiedSelection = ''
    let pointerStartedInTerminal = false
    let selectionChanged = false
    const selectionDisposable = term.onSelectionChange(() => {
      selectionChanged = true
      if (!term.getSelection()) lastCopiedSelection = ''
    })
    const handlePointerDown = () => {
      pointerStartedInTerminal = true
      selectionChanged = false
    }
    const handlePointerUp = () => {
      if (!pointerStartedInTerminal) return
      pointerStartedInTerminal = false
      const selected = term.getSelection()
      if (!selectionChanged || !selected || selected === lastCopiedSelection) return
      lastCopiedSelection = selected
      void writeTerminalSelection(selected, false)
    }
    const handleKeyDown = (event: KeyboardEvent) => handleTerminalCopyKey(event, () => term)

    mount.addEventListener('pointerdown', handlePointerDown)
    mount.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      selectionDisposable.dispose()
      mount.removeEventListener('pointerdown', handlePointerDown)
      mount.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }

  return { writeClipboard, handleTerminalCopyKey, attachTerminalClipboardBridge }
}
