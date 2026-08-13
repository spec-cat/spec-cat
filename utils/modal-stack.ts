export const APP_MODAL_PRIORITY = [
  'gitDialog',
  'worktrees',
  'spec',
  'remotes',
  'integration',
  'conflictReport',
  'newSession',
  'settings'
] as const

export type AppModalLayer = typeof APP_MODAL_PRIORITY[number]
export type ModalHandlers = Partial<Record<AppModalLayer, () => boolean>>

export function runTopmostModalHandler(handlers: ModalHandlers): boolean {
  for (const layer of APP_MODAL_PRIORITY) {
    if (handlers[layer]?.()) return true
  }
  return false
}
