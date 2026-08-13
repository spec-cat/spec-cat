import type { Ref } from 'vue'
import type { SessionListItem } from '~/server/utils/session-store'
import type { CascadeState, PendingFeatureAction, SkillInfo, SpecFeature, ToastType } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useSpecWorkflow(options: {
  sessionId: Ref<string>
  status: Ref<'connecting' | 'connected' | 'closed'>
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
  const speckitSteps = ['specify', 'clarify', 'plan', 'tasks', 'implement']
  const pendingFeatureActionLabel = computed(() => {
    const action = pendingFeatureAction.value
    if (!action) return ''
    if (action.kind === 'speckit') return `/speckit.${action.step} ${action.featureId}`
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

  function dispatchFeatureAction(action: PendingFeatureAction) {
    if (action.kind === 'speckit') {
      const sent = options.sendCommand(`/speckit.${action.step} ${action.featureId}`)
      options.pushToast(sent ? 'info' : 'error', sent ? `Sent /speckit.${action.step} for ${action.featureId}.` : 'Terminal is not connected.', sent ? 3500 : 5000)
      return
    }
    if (action.kind === 'skill') {
      const skill = options.skills.value.find((entry) => entry.id === action.skillId)
      if (skill) void sendSkillPrompt(skill, action.featureId)
      else options.pushToast('error', `Skill ${action.skillId} is no longer available.`, 5000)
      return
    }
    beginCascade(action.featureId)
  }

  const runSpeckitStep = (feature: SpecFeature, step: string, event?: MouseEvent) => void runFeatureAction({ kind: 'speckit', featureId: feature.id, step }, event?.shiftKey)
  const runSkill = (skill: SkillInfo, feature: SpecFeature, event?: MouseEvent) => void runFeatureAction({ kind: 'skill', featureId: feature.id, skillId: skill.id }, event?.shiftKey)
  function startCascade(feature: SpecFeature, event?: MouseEvent) {
    if (cascade.value) return options.pushToast('warning', 'A cascade is already running.')
    void runFeatureAction({ kind: 'cascade', featureId: feature.id }, event?.shiftKey)
  }
  async function sendSkillPrompt(skill: SkillInfo, featureId: string) {
    try {
      const url: string = `/api/skills/${encodeURIComponent(skill.id)}/render`
      const response = await $fetch<{ prompt: string }>(url, { method: 'POST', body: { args: featureId } })
      const sent = options.sendText(response.prompt)
      options.pushToast(sent ? 'info' : 'error', sent ? `Sent skill ${skill.id} for ${featureId}.` : 'Terminal is not connected.', sent ? 3500 : 5000)
    } catch (error) {
      options.pushToast('error', `Failed to render skill: ${extractFetchError(error)}`, 6000)
    }
  }
  function beginCascade(featureId: string) {
    if (cascade.value) return
    const feature = options.features.value.find((entry) => entry.id === featureId)
    if (!feature || !options.sessionId.value) {
      options.pushToast('error', feature ? 'Cascade aborted: no conversation is attached.' : `Feature ${featureId} is no longer in specs/.`, 5000)
      return
    }
    const steps = [...(!feature.hasSpec ? ['specify'] : []), ...(!feature.hasPlan ? ['plan'] : []), ...(!feature.hasTasks ? ['tasks'] : []), 'implement']
    cascade.value = { sessionId: options.sessionId.value, featureId, steps, index: -1, phase: 'waiting-start' }
    advanceCascade()
  }
  function advanceCascade() {
    const state = cascade.value
    if (!state) return
    state.index += 1
    if (state.index >= state.steps.length) {
      options.pushToast('success', `Cascade for ${state.featureId} completed.`)
      cascade.value = null
      void options.refreshFeatures()
      return
    }
    if (options.sessionId.value !== state.sessionId || !options.sendCommand(`/speckit.${state.steps[state.index]} ${state.featureId}`)) {
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
      advanceCascade()
    }
  }

  return { cascade, pendingFeatureAction, pendingFeatureActionLabel, speckitSteps, waitForNewSessionAttached,
    waitForSessionIdle, dispatchFeatureAction, runSpeckitStep, runSkill, startCascade, cancelCascade, trackCascadeState }
}
