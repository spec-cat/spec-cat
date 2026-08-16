import type { Ref } from 'vue'
import type { ProviderId } from '~/server/utils/session-store'
import type { PendingFeatureAction, SessionOptions, SessionProviderOption, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useNewSession(options: {
  defaultProvider: Ref<ProviderId>
  sessionId: Ref<string>
  pendingAction: Ref<PendingFeatureAction | null>
  pendingActionLabel: Ref<string>
  integrationError: Ref<string>
  clearSessionId: () => void
  connect: (id?: string, provider?: ProviderId, creation?: { baseBranch?: string; featureId?: string }) => void
  waitForAttached: () => Promise<string>
  waitForIdle: (id: string) => Promise<boolean>
  dispatchAction: (action: PendingFeatureAction) => void
  refreshSessions: () => Promise<void>
  pushToast: PushToast
}) {
  const showNewSessionModal = ref(false)
  const showSettingsModal = ref(false)
  const sessionOptions = ref<SessionOptions>({ branches: [], providers: [] })
  const loadingSessionOptions = ref(false)
  const creatingSession = ref(false)
  const newSessionProvider = ref<ProviderId>('claude')
  const newSessionBaseBranch = ref('')
  const newSessionBaseBranchRef = ref<{ focusBaseBranch: () => void } | null>(null)
  const settingsDoneRef = ref<{ focusDone: () => void } | null>(null)
  const settingsProviderOptions = computed<SessionProviderOption[]>(() => sessionOptions.value.providers.length
    ? sessionOptions.value.providers
    : [{ id: 'claude', name: 'Claude' }, { id: 'codex', name: 'Codex' }])

  async function loadSessionOptions() {
    loadingSessionOptions.value = true
    options.integrationError.value = ''
    try {
      sessionOptions.value = await $fetch<SessionOptions>('/api/sessions/options')
      const provider = sessionOptions.value.providers.find((entry) => entry.id === newSessionProvider.value) || sessionOptions.value.providers[0]
      if (provider) newSessionProvider.value = provider.id
      const featureId = options.pendingAction.value?.featureId
      const featureBranch = featureId && sessionOptions.value.branches.find((branch) => branch === featureId || branch.split('/').pop() === featureId)
      if (featureBranch) {
        // Spec-created conversations branch from the feature itself while
        // retaining their own managed sc/<conversation> branch.
        newSessionBaseBranch.value = featureBranch
      } else if (options.pendingAction.value?.kind === 'conversation') {
        newSessionBaseBranch.value = ''
        options.integrationError.value = `No local branch matches spec ${featureId}. Create or fetch the spec branch before starting its conversation.`
      } else if (!sessionOptions.value.branches.includes(newSessionBaseBranch.value)) {
        newSessionBaseBranch.value = sessionOptions.value.branches.includes('main') ? 'main' : sessionOptions.value.branches[0] || ''
      }
    } catch (error) { options.integrationError.value = extractFetchError(error) }
    finally { loadingSessionOptions.value = false }
  }
  async function openNewSessionModal() {
    showNewSessionModal.value = true
    newSessionProvider.value = options.defaultProvider.value
    await loadSessionOptions()
    await nextTick()
    newSessionBaseBranchRef.value?.focusBaseBranch()
  }
  async function openSettingsModal() {
    showSettingsModal.value = true
    await nextTick()
    settingsDoneRef.value?.focusDone()
    if (!sessionOptions.value.providers.length) {
      try { sessionOptions.value = await $fetch<SessionOptions>('/api/sessions/options') }
      catch (error) { console.warn('Failed to load provider options', error) }
    }
  }
  async function createNewSession() {
    if (!newSessionBaseBranch.value || creatingSession.value) return
    const pending = options.pendingAction.value
    const label = options.pendingActionLabel.value
    creatingSession.value = true
    options.clearSessionId()
    options.connect(undefined, newSessionProvider.value, { baseBranch: newSessionBaseBranch.value, featureId: pending?.featureId })
    showNewSessionModal.value = false
    creatingSession.value = false
    if (!pending) return
    const newSessionId = await options.waitForAttached()
    if (!newSessionId) return options.pushToast('error', `Conversation for ${pending.featureId} did not start; action cancelled.`, 6000)
    options.pushToast('info', `Waiting for the CLI to start before running ${label}...`)
    await options.refreshSessions()
    if (!(await options.waitForIdle(newSessionId))) return options.pushToast('error', `The CLI never became ready; ${label} was not sent.`, 8000)
    options.dispatchAction(pending)
  }
  watch(showNewSessionModal, (open) => { if (!open) options.pendingAction.value = null })
  return { showNewSessionModal, showSettingsModal, sessionOptions, loadingSessionOptions,
    creatingSession, newSessionProvider, newSessionBaseBranch, newSessionBaseBranchRef,
    settingsDoneRef, settingsProviderOptions, loadSessionOptions, openNewSessionModal,
    openSettingsModal, createNewSession }
}
