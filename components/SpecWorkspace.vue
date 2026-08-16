<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'
import type { SpecWorkspaceExpose, ToastType } from '~/types/app'

const props = defineProps<{
  collapsed: boolean
  mobile: boolean
  sessions: SessionListItem[]
  sessionId: string
  status: 'connecting' | 'connected' | 'closed'
  themeVars: Record<string, string>
  pushToast: (type: ToastType, message: string, duration?: number) => void
  selectSession: (id: string) => void
  openNewSession: () => Promise<void>
  sendCommand: (command: string) => boolean
  sendText: (text: string) => boolean
}>()

const sessions = toRef(props, 'sessions')
const sessionId = toRef(props, 'sessionId')
const status = toRef(props, 'status')
const documents = useSpecDocuments(props.pushToast)

function branchOwnsFeature(branch: string | undefined, featureId: string) {
  return Boolean(branch && (branch === featureId || branch.split('/').pop() === featureId))
}
function findSessionForFeature(featureId: string) {
  const owners = sessions.value.filter((session) => !session.archived && !session.finalized
    && (branchOwnsFeature(session.worktreeBranch, featureId) || session.featureId === featureId))
  return [...owners].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null
}
const featureSessionMap = computed(() => {
  const map = new Map<string, SessionListItem>()
  for (const feature of documents.features.value) {
    const session = findSessionForFeature(feature.id)
    if (session) map.set(feature.id, session)
  }
  return map
})
const workflow = useSpecWorkflow({
  sessionId, status, sessions, features: documents.features, skills: documents.skills,
  pushToast: props.pushToast, selectSession: props.selectSession, findSessionForFeature,
  openNewSessionModal: props.openNewSession, sendCommand: props.sendCommand,
  sendText: props.sendText, refreshFeatures: documents.refreshFeatures
})

function closeTopmost() {
  if (documents.showSpecEditModal.value) { documents.showSpecEditModal.value = false; return true }
  if (documents.specViewerFeatureId.value) { documents.closeSpecViewer(); return true }
  return false
}
function submitTopmost() {
  if (!documents.showSpecEditModal.value) return false
  void documents.saveSpecEdit()
  return true
}
onMounted(() => Promise.allSettled([documents.refreshFeatures(), documents.refreshSkills()]))
defineExpose<SpecWorkspaceExpose>({
  refresh: documents.refreshFeatures,
  trackSessionState: workflow.trackCascadeState,
  waitForNewSessionAttached: workflow.waitForNewSessionAttached,
  waitForSessionIdle: workflow.waitForSessionIdle,
  dispatchFeatureAction: workflow.dispatchFeatureAction,
  getPendingAction: () => workflow.pendingFeatureAction.value,
  getPendingActionLabel: () => workflow.pendingFeatureActionLabel.value,
  clearPendingAction: () => { workflow.pendingFeatureAction.value = null },
  closeTopmost,
  submitTopmost
})
</script>

<template>
  <SpecBrowserPanel v-model:search-query="documents.specSearchQuery.value" :collapsed="collapsed" :mobile="mobile"
    :features="documents.features.value" :filtered-features="documents.filteredFeatures.value"
    :loading="documents.loadingFeatures.value" :selected-feature-id="documents.specViewerFeatureId.value"
    :session-id="sessionId" :feature-session-map="featureSessionMap" :traceability="documents.traceability.value"
    :cascade="workflow.cascade.value" :skills="documents.skills.value" :speckit-steps="workflow.speckitSteps"
    @refresh="documents.refreshFeatures" @open-feature="documents.openSpecViewer"
    @open-conversation="workflow.openFeatureConversation"
    @run-speckit-step="workflow.runSpeckitStep" @start-cascade="workflow.startCascade"
    @cancel-cascade="workflow.cancelCascade" @run-skill="workflow.runSkill" />
  <Teleport to="body">
    <SpecViewerModal :feature="documents.specViewerFeature.value" :selected-file="documents.selectedSpecFile.value"
      :loading-content="documents.loadingSpecContent.value" :rendered-html="documents.renderedSpecHtml.value"
      :content="documents.selectedSpecContent.value" :theme-vars="themeVars" @close="documents.closeSpecViewer"
      @edit="documents.startSpecEdit" @select-file="documents.selectSpecFile" />
    <SpecEditModal v-model:content="documents.specEditContent.value" :open="documents.showSpecEditModal.value"
      :selected-file="documents.selectedSpecFile.value" :saving="documents.savingSpec.value" :theme-vars="themeVars"
      @save="documents.saveSpecEdit" @close="documents.showSpecEditModal.value = false" />
  </Teleport>
</template>
