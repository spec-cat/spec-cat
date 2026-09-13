import type { Ref } from 'vue'
import type { SessionListItem } from '~/types/session'
import type { ToastType } from '~/types/app'

export function useSessionPollingController(options: {
  sessions: Ref<SessionListItem[]>
  activeSessionId: Ref<string>
  trackSessionState: (session: SessionListItem, state: string) => void
  sessionLabel: (session: SessionListItem) => string
  pushToast: (type: ToastType, message: string, duration?: number) => void
}) {
  const loadingSessions = ref(false)
  const runtimeStates = new Map<string, string>()
  let requestId = 0
  let requestRunning = false

  async function refreshSessions() {
    if (requestRunning) return
    requestRunning = true
    const currentRequest = ++requestId
    loadingSessions.value = true
    try {
      const response = await $fetch<{ sessions: SessionListItem[] }>('/api/sessions')
      if (currentRequest !== requestId) return
      options.sessions.value = response.sessions
      trackRuntimeStates(response.sessions)
    } catch (error) {
      console.warn('Failed to refresh conversations', error)
    } finally {
      if (currentRequest === requestId) loadingSessions.value = false
      requestRunning = false
    }
  }

  function trackRuntimeStates(list: SessionListItem[]) {
    for (const session of list) {
      const state = session.runtime?.state || 'unknown'
      const previous = runtimeStates.get(session.id)
      runtimeStates.set(session.id, state)
      options.trackSessionState(session, state)
      if (previous === 'working' && (state === 'idle' || state === 'waiting_input')) {
        void notifyTurnComplete(session, state)
      }
    }
    const knownIds = new Set(list.map((session) => session.id))
    for (const id of runtimeStates.keys()) {
      if (!knownIds.has(id)) runtimeStates.delete(id)
    }
  }

  async function notifyTurnComplete(session: SessionListItem, state: string) {
    const body = state === 'waiting_input'
      ? `${session.provider} · ${options.sessionLabel(session)} is waiting for input.`
      : `${session.provider} · ${options.sessionLabel(session)} finished responding.`
    if (document.hasFocus()) {
      if (session.id !== options.activeSessionId.value) options.pushToast('info', body)
      return
    }
    if (typeof Notification === 'undefined') return
    const show = () => { new Notification('Code Cat', { body, tag: `turn-complete-${session.id}` }) }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
      if (permission === 'granted') show()
    }
  }

  return { loadingSessions, refreshSessions }
}
