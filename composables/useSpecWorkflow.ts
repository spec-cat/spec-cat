import type { Ref } from 'vue'
import type { ProviderId, SessionListItem } from '~/server/utils/session-store'
import type { CascadeState, PendingFeatureAction, SkillInfo, SpecFeature, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'
import { buildSpeckitCommand } from '~/utils/spec-workflow'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useSpecWorkflow(options: {
  sessionId: Ref<string>
  status: Ref<'connecting' | 'connected' | 'closed'>
  activeProvider: Ref<ProviderId | undefined>
  sessions: Ref<SessionListItem[]>
  features: Ref<SpecFeature[]>
  skills: Ref<SkillInfo[]>
  pushToast: PushToast
  selectSession: (id: string) => void
  findSessionForFeature: (featureId: string) => SessionListItem | null
  openNewSessionModal: () => Promise<void>
  sendCommand: (command: string) => boolean
  sendText: (text: string) => boolean
  refreshFeatures: () => Promise<void>
}) {
  const cascade = ref<CascadeState | null>(null)
  const pendingFeatureAction = ref<PendingFeatureAction | null>(null)
  const skillPreparationLabel = ref('')
  const speckitSteps = ['specify', 'clarify', 'plan', 'tasks', 'implement']
  const pendingFeatureActionLabel = computed(() => {
    const action = pendingFeatureAction.value
    if (!action) return ''
    if (action.kind === 'conversation') return `a clean chat for ${action.featureId}`
    if (action.kind === 'speckit') return buildSpeckitCommand(options.activeProvider.value, action.step, action.featureId)
    if (action.kind === 'skill') return `skill ${action.skillId}`
    return 'the auto cascade'
  })

  function waitForSessionAttached(id: string, timeoutMs = 8000) {
    return pollUntil(() => options.sessionId.value === id && options.status.value === 'connected', timeoutMs)
  }
  async function waitForNewSessionAttached(timeoutMs = 30000) {
    const attached = await pollValue(() => options.sessionId.value && options.status.value === 'connected' ? options.sessionId.value : '', timeoutMs)
    return attached || ''
  }
  async function waitForSessionIdle(id: string, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const state = options.sessions.value.find((session) => session.id === id)?.runtime?.state
      if (state === 'idle' || state === 'waiting_input') return true
      if (state === 'dead') return false
      await delay(200)
    }
    return false
  }
  function pollUntil(check: () => boolean, timeoutMs: number) {
    return pollValue(() => check(), timeoutMs).then(Boolean)
  }
  function pollValue<T>(read: () => T | false | '', timeoutMs: number) {
    return new Promise<T | false>((resolve) => {
      const deadline = Date.now() + timeoutMs
      const check = () => {
        const value = read()
        if (value) return resolve(value)
        if (Date.now() > deadline) return resolve(false)
        window.setTimeout(check, 100)
      }
      check()
    })
  }
  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  async function resetContext(sessionId: string, label: string) {
    if (skillPreparationLabel.value) {
      options.pushToast('warning', 'Another skill is already being prepared.', 4000)
      return false
    }
    skillPreparationLabel.value = label
    try {
      if (!(await waitForSessionIdle(sessionId))) {
        options.pushToast('error', 'The conversation did not become ready; the skill was not started.', 8000)
        return false
      }
      if (options.sessionId.value !== sessionId || !options.sendCommand('/new')) {
        options.pushToast('error', 'Terminal is not connected.', 5000)
        return false
      }
      // A provider can still report the previous idle state briefly after /new.
      await delay(1500)
      if (!(await waitForSessionIdle(sessionId, 20000))) {
        options.pushToast('error', 'The CLI did not become ready after /new; the skill was not started.', 8000)
        return false
      }
      if (options.sessionId.value !== sessionId || options.status.value !== 'connected') {
        options.pushToast('error', 'Conversation changed before the skill could start.', 6000)
        return false
      }
      return true
    } finally {
      skillPreparationLabel.value = ''
    }
  }

  async function runFeatureAction(action: PendingFeatureAction, forceNew = false) {
    const target = forceNew ? null : options.findSessionForFeature(action.featureId)
    if (!target) {
      pendingFeatureAction.value = action
      await options.openNewSessionModal()
      return
    }
    if (options.sessionId.value !== target.id || options.status.value !== 'connected') {
      options.selectSession(target.id)
      options.pushToast('info', `Switched to ${target.title || target.id} for ${action.featureId}.`)
      if (!(await waitForSessionAttached(target.id))) {
        options.pushToast('error', `Timed out attaching to the conversation for ${action.featureId}.`, 6000)
        return
      }
    }
    dispatchFeatureAction(action)
  }

  async function dispatchFeatureAction(action: PendingFeatureAction, freshConversation = false) {
    if (action.kind === 'conversation') {
      const targetId = options.sessionId.value
      if (!targetId || options.status.value !== 'connected') {
        options.pushToast('error', 'Terminal is not connected.', 5000)
        return
      }
      if (!(await waitForSessionIdle(targetId))) {
        options.pushToast('error', 'The conversation did not become ready; the context was not reset.', 8000)
        return
      }
      const sent = options.sendCommand('/new')
      options.pushToast(sent ? 'success' : 'error', sent
        ? `Attached to ${action.featureId} with a clean context.`
        : 'Terminal is not connected.', sent ? 4000 : 5000)
      return
    }
    if (action.kind === 'speckit') {
      const targetId = options.sessionId.value
      const command = buildSpeckitCommand(options.activeProvider.value, action.step, action.featureId)
      if (!targetId || options.status.value !== 'connected') {
        options.pushToast('error', 'Terminal is not connected.', 5000)
        return
      }
      if (!freshConversation && !(await resetContext(targetId, command))) return
      if (options.sessionId.value !== targetId || options.status.value !== 'connected') {
        options.pushToast('error', 'Conversation changed before the command could be sent.', 6000)
        return
      }
      const sent = options.sendCommand(command)
      options.pushToast(sent ? 'info' : 'error', sent ? `Sent ${command}.` : 'Terminal is not connected.', sent ? 3500 : 5000)
      return
    }
    if (action.kind === 'skill') {
      const skill = options.skills.value.find((entry) => entry.id === action.skillId)
      if (!skill) {
        options.pushToast('error', `Skill ${action.skillId} is no longer available.`, 5000)
        return
      }
      const targetId = options.sessionId.value
      if (!targetId || options.status.value !== 'connected') {
        options.pushToast('error', 'Terminal is not connected.', 5000)
        return
      }
      if (!freshConversation && !(await resetContext(targetId, `skill ${skill.id}`))) return
      void sendSkillPrompt(skill, action.featureId, targetId)
      return
    }
    beginCascade(action.featureId, freshConversation)
  }

  const runSpeckitStep = (feature: SpecFeature, step: string, event?: MouseEvent) => void runFeatureAction({ kind: 'speckit', featureId: feature.id, step }, event?.shiftKey)
  const openFeatureConversation = (feature: SpecFeature) => void runFeatureAction({ kind: 'conversation', featureId: feature.id })
  const runSkill = (skill: SkillInfo, feature: SpecFeature, event?: MouseEvent) => void runFeatureAction({ kind: 'skill', featureId: feature.id, skillId: skill.id }, event?.shiftKey)
  function startCascade(feature: SpecFeature, event?: MouseEvent) {
    if (cascade.value) return options.pushToast('warning', 'A cascade is already running.')
    void runFeatureAction({ kind: 'cascade', featureId: feature.id }, event?.shiftKey)
  }
  async function sendSkillPrompt(skill: SkillInfo, featureId: string, targetId: string) {
    try {
      const url: string = `/api/skills/${encodeURIComponent(skill.id)}/render`
      const response = await $fetch<{ prompt: string }>(url, { method: 'POST', body: { args: featureId } })
      if (options.sessionId.value !== targetId || options.status.value !== 'connected') {
        options.pushToast('error', 'Conversation changed before the skill prompt could be sent.', 6000)
        return
      }
      const sent = options.sendText(response.prompt)
      options.pushToast(sent ? 'info' : 'error', sent ? `Sent skill ${skill.id} for ${featureId}.` : 'Terminal is not connected.', sent ? 3500 : 5000)
    } catch (error) {
      options.pushToast('error', `Failed to render skill: ${extractFetchError(error)}`, 6000)
    }
  }
  function beginCascade(featureId: string, freshConversation = false) {
    if (cascade.value) return
    const feature = options.features.value.find((entry) => entry.id === featureId)
    if (!feature || !options.sessionId.value) {
      options.pushToast('error', feature ? 'Cascade aborted: no conversation is attached.' : `Feature ${featureId} is no longer in specs/.`, 5000)
      return
    }
    const steps = [...(!feature.hasSpec ? ['specify'] : []), ...(!feature.hasPlan ? ['plan'] : []), ...(!feature.hasTasks ? ['tasks'] : []), 'implement']
    cascade.value = { sessionId: options.sessionId.value, featureId, steps, index: -1, phase: 'waiting-start' }
    void advanceCascade(freshConversation)
  }
  async function advanceCascade(skipReset = false) {
    const state = cascade.value
    if (!state) return
    state.index += 1
    if (state.index >= state.steps.length) {
      options.pushToast('success', `Cascade for ${state.featureId} completed.`)
      cascade.value = null
      void options.refreshFeatures()
      return
    }
    state.phase = 'resetting'
    const preparingStep = state.steps[state.index]
    if (!preparingStep || (!skipReset && !(await resetContext(state.sessionId, buildSpeckitCommand(options.activeProvider.value, preparingStep, state.featureId))))) {
      cascade.value = null
      return
    }
    const command = buildSpeckitCommand(options.activeProvider.value, preparingStep, state.featureId)
    if (options.sessionId.value !== state.sessionId || !options.sendCommand(command)) {
      options.pushToast('error', 'Cascade aborted: terminal is not connected to its conversation.', 6000)
      cascade.value = null
      return
    }
    state.phase = 'waiting-start'
  }
  function cancelCascade() {
    if (!cascade.value) return
    cascade.value = null
    options.pushToast('info', 'Cascade cancelled. The current CLI turn keeps running.')
  }
  function trackCascadeState(session: SessionListItem, state: string) {
    const current = cascade.value
    if (!current || session.id !== current.sessionId) return
    if (state === 'dead' || state === 'disconnected') {
      options.pushToast('error', `Cascade aborted: conversation is ${state}.`, 6000)
      cascade.value = null
    } else if (current.phase === 'waiting-start' && state === 'working') current.phase = 'waiting-idle'
    else if (current.phase === 'waiting-idle' && state === 'idle') {
      void options.refreshFeatures()
      void advanceCascade()
    }
  }

  return { cascade, pendingFeatureAction, pendingFeatureActionLabel, skillPreparationLabel, speckitSteps, waitForNewSessionAttached,
    waitForSessionIdle, dispatchFeatureAction, openFeatureConversation, runSpeckitStep, runSkill, startCascade, cancelCascade, trackCascadeState }
}
