import type { Ref } from 'vue'
import type { SessionListItem } from '~/server/utils/session-store'
import type { SessionOptions, ToastType } from '~/types/app'
import { shortId } from '~/utils/app-formatters'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useSessionIntegration(options: {
  activeSession: Ref<SessionListItem | undefined>
  previewingSession: Ref<SessionListItem | null>
  canPreviewActiveSession: Ref<boolean>
  sessions: Ref<SessionListItem[]>
  sessionId: Ref<string>
  clearSessionId: () => void
  sessionOptions: Ref<SessionOptions>
  integrationError: Ref<string>
  loadSessionOptions: () => Promise<void>
  refreshSessions: () => Promise<void>
  refreshArchivedSessions: () => Promise<void>
  refreshGitGraph: () => Promise<void>
  waitForSessionIdle: (id: string, timeout?: number) => Promise<boolean>
  isTerminalConnected: () => boolean
  sendTerminalCommand: (value: string) => boolean
  sendTerminalText: (value: string) => boolean
  closeTerminal: () => void
  resetTerminal: () => void
  writelnTerminal: (value: string) => void
  connect: (id: string) => void
  pushToast: PushToast
}) {
  const showIntegrationModal = ref(false)
  const integrationMode = ref<'rebase' | 'finalize' | 'squash'>('rebase')
  const integrationBaseBranch = ref('')
  const integrationCommitMessage = ref('')
  const integrationRunning = ref(false)
  const integrationError = options.integrationError
  const generatingCommitMessage = ref(false)
  const commitQueryScreen = ref('')
  const conflictReport = ref('')
  const showConflictReport = ref(false)
  const previewRunning = ref(false)
  const previewError = ref('')
  const branchReviewRunning = ref(false)
  const integrationBaseBranchRef = ref<{ focusBaseBranch: () => void } | null>(null)
  const conflictCloseRef = ref<{ focusClose: () => void } | null>(null)
  let commitScreenTimer: ReturnType<typeof setInterval> | null = null

  async function openIntegrationModal(mode: 'rebase' | 'finalize' | 'squash') {
    const session = options.activeSession.value
    if (!session || session.finalized) return
    integrationMode.value = mode
    integrationError.value = ''
    integrationCommitMessage.value = `feat: finalize ${shortId(session.id)}`
    commitQueryScreen.value = ''
    showIntegrationModal.value = true
    await options.loadSessionOptions()
    const branches = options.sessionOptions.value.branches
    integrationBaseBranch.value = branches.includes(session.baseBranch || '') ? session.baseBranch || '' : branches.includes('main') ? 'main' : branches[0] || ''
    await nextTick()
    integrationBaseBranchRef.value?.focusBaseBranch()
  }
  function stopCommitScreenPolling() {
    if (commitScreenTimer) clearInterval(commitScreenTimer)
    commitScreenTimer = null
  }
  function startCommitScreenPolling(sessionId: string) {
    stopCommitScreenPolling()
    commitScreenTimer = setInterval(async () => {
      try {
        const response = await $fetch<{ screen: string | null }>(`/api/sessions/${encodeURIComponent(sessionId)}/commit-message-screen`)
        if (response.screen) commitQueryScreen.value = response.screen
      } catch {}
    }, 700)
  }
  async function generateCommitMessage() {
    const session = options.activeSession.value
    if (!session || generatingCommitMessage.value) return
    generatingCommitMessage.value = true
    integrationError.value = ''
    commitQueryScreen.value = ''
    startCommitScreenPolling(session.id)
    try {
      const url: string = `/api/sessions/${encodeURIComponent(session.id)}/commit-message`
      const response = await $fetch<{ message: string }>(url, { method: 'POST', body: integrationBaseBranch.value ? { baseBranch: integrationBaseBranch.value } : {} })
      integrationCommitMessage.value = response.message
      commitQueryScreen.value = ''
    } catch (error) { integrationError.value = extractFetchError(error) }
    finally { stopCommitScreenPolling(); generatingCommitMessage.value = false }
  }
  async function runSessionIntegration() {
    const session = options.activeSession.value
    if (!session || !integrationBaseBranch.value || integrationRunning.value) return
    if (integrationMode.value === 'finalize' && !integrationCommitMessage.value.trim()) return
    integrationRunning.value = true
    integrationError.value = ''
    try {
      const mode = integrationMode.value
      const targetBranch = integrationBaseBranch.value
      const url: string = `/api/sessions/${encodeURIComponent(session.id)}/${mode}`
      const result = await $fetch<{ conflictReport?: string }>(url, { method: 'POST', body: { baseBranch: targetBranch, commitMessage: integrationCommitMessage.value.trim() } })
      showIntegrationModal.value = false
      previewError.value = ''
      if (result.conflictReport) {
        conflictReport.value = result.conflictReport
        showConflictReport.value = true
        void nextTick(() => conflictCloseRef.value?.focusClose())
        options.pushToast('success', `Rebase conflicts on ${targetBranch} were auto-resolved.`)
      }
      if (mode === 'finalize') {
        const active = session.id === options.sessionId.value
        if (active) {
          options.closeTerminal(); options.clearSessionId(); options.resetTerminal()
          options.writelnTerminal(`[finalized into ${targetBranch} and archived]\r\n`)
        }
        await Promise.allSettled([options.refreshSessions(), options.refreshArchivedSessions()])
        options.pushToast('success', `Finalized into ${targetBranch} and archived.`)
        if (active && options.sessions.value[0]) options.connect(options.sessions.value[0].id)
      } else {
        await options.refreshSessions(); void options.refreshGitGraph()
        options.pushToast('success', mode === 'squash' ? `Squashed conversation commits onto ${targetBranch}.` : `Rebased onto ${targetBranch}.`)
      }
    } catch (error) { integrationError.value = extractFetchError(error) }
    finally { integrationRunning.value = false }
  }
  async function injectBranchReviewPrompt() {
    const session = options.activeSession.value
    if (!session || session.archived || session.finalized || branchReviewRunning.value) return
    if (!options.isTerminalConnected()) return options.pushToast('error', 'Terminal is not connected.', 5000)
    branchReviewRunning.value = true
    try {
      const targetId = session.id
      if (!options.sendTerminalCommand('/new')) return options.pushToast('error', 'Terminal is not connected.', 5000)
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
      await options.refreshSessions()
      if (!(await options.waitForSessionIdle(targetId, 20000))) return options.pushToast('error', 'The CLI did not become ready after /new; review prompt was not sent.', 8000)
      if (options.sessionId.value !== targetId || !options.isTerminalConnected()) return options.pushToast('error', 'Conversation changed before the review prompt could be sent.', 6000)
      const sent = options.sendTerminalText('Check the specs and implementation of this branch.')
      options.pushToast(sent ? 'info' : 'error', sent ? 'Started a fresh branch review.' : 'Terminal is not connected.', sent ? 3500 : 5000)
    } finally { branchReviewRunning.value = false }
  }
  async function toggleSessionPreview() {
    const session = options.activeSession.value
    if (!session || !options.canPreviewActiveSession.value || previewRunning.value) return
    previewRunning.value = true
    previewError.value = ''
    try {
      if (session.previewBranch) {
        const url: string = `/api/sessions/${encodeURIComponent(session.id)}/preview`
        await $fetch(url, { method: 'DELETE' })
      } else {
        const existing = options.previewingSession.value
        if (existing && existing.id !== session.id) {
          const oldUrl: string = `/api/sessions/${encodeURIComponent(existing.id)}/preview`
          await $fetch(oldUrl, { method: 'DELETE' })
        }
        const url: string = `/api/sessions/${encodeURIComponent(session.id)}/preview`
        await $fetch(url, { method: 'POST' })
      }
      await options.refreshSessions(); await options.refreshGitGraph()
    } catch (error) { previewError.value = extractFetchError(error) }
    finally { previewRunning.value = false }
  }
  watch(showIntegrationModal, (open) => { if (!open) { stopCommitScreenPolling(); commitQueryScreen.value = '' } })
  onBeforeUnmount(stopCommitScreenPolling)
  return { showIntegrationModal, integrationMode, integrationBaseBranch, integrationCommitMessage,
    integrationRunning, integrationError, generatingCommitMessage, commitQueryScreen,
    conflictReport, showConflictReport, previewRunning, previewError, branchReviewRunning,
    integrationBaseBranchRef, conflictCloseRef, openIntegrationModal, generateCommitMessage,
    runSessionIntegration, injectBranchReviewPrompt, toggleSessionPreview }
}
