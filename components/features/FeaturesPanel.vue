<script setup lang="ts">
import { ArrowPathIcon, FolderOpenIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { useChatStore } from '~/stores/chat'
import { useGitGraphStore } from '~/stores/gitGraph'
import { useChatStream } from '~/composables/useChatStream'
import { useToast } from '~/composables/useToast'
import NewConversationModal from '~/components/conversations/NewConversationModal.vue'
import type { Feature, TraceabilityResponse } from '~/types/spec-viewer'
import type { SkillMetadata, SkillPromptResponse } from '~/types/skill'

const chatStore = useChatStore()
const gitGraphStore = useGitGraphStore()
const { sendMessage: streamMessage, enableCascade } = useChatStream()
const toast = useToast()

// View state machine
const currentView = ref<'features' | 'files' | 'content'>('features')
const selectedFeatureId = ref<string | null>(null)
const selectedFileName = ref<string | null>(null)

// Data
const features = ref<Feature[]>([])
const skills = ref<SkillMetadata[]>([])
const loading = ref(false)
const featureRiskMap = ref<Record<string, { critical: number; major: number }>>({})

// Modal state
const showModal = ref(false)
const modalFeature = ref<Feature | null>(null)
const showFeatureSearchModal = ref(false)
const showCreateModal = ref(false)
const creatingConversation = ref(false)

type PendingFeatureAction =
  | { type: 'cascade'; featureId: string; command: string; title: string }
  | { type: 'open-chat'; featureId: string; title: string }
  | { type: 'skill'; featureId: string; skillId: string; title: string }

const pendingFeatureAction = ref<PendingFeatureAction | null>(null)

// Search
const searchQuery = ref('')
const debouncedQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 300)
})

const filteredFeatures = computed(() => {
  const q = debouncedQuery.value.trim().toLowerCase()
  if (!q) return features.value
  return features.value.filter(f =>
    f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)
  )
})

// Template refs for auto-scroll
const featureRefs = ref<Record<string, HTMLElement | null>>({})

// Active feature from conversation
const activeFeatureId = computed(() => {
  const conv = chatStore.activeConversation
  if (!conv) return null

  if (conv.featureId) return conv.featureId

  const branch = conv.worktreeBranch?.trim()
  if (!branch) return null
  return features.value.some(feature => feature.id === branch) ? branch : null
})

const highlightedFeatureId = computed(() => activeFeatureId.value || selectedFeatureId.value)

// Auto-scroll to active feature card
watch(() => chatStore.activeConversationId, () => {
  // Conversation-driven selection should not be masked by stale manual clicks.
  selectedFeatureId.value = null
  const fid = activeFeatureId.value
  gitGraphStore.setSelectedFeatureId(fid)
  if (!fid) return
  nextTick(() => {
    const el = featureRefs.value[fid]
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  })
})

watch(selectedFeatureId, (fid) => {
  if (!fid) return
  nextTick(() => {
    const el = featureRefs.value[fid]
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  })
})

// Fetch features from API
async function fetchFeatures() {
  loading.value = true
  try {
    const data = await $fetch<{ features: Feature[] }>('/api/specs/features')
    features.value = data.features
    void fetchFeatureRisks(data.features)
  } catch {
    toast.error('Failed to load features')
    features.value = []
    featureRiskMap.value = {}
  } finally {
    loading.value = false
  }
}

async function fetchFeatureRisks(featureList: Feature[]) {
  if (featureList.length === 0) {
    featureRiskMap.value = {}
    return
  }

  const settled = await Promise.allSettled(
    featureList.map(async (feature) => {
      const response = await $fetch<TraceabilityResponse>(`/api/specs/traceability/${feature.id}`)
      const critical = response.alerts.filter(alert => alert.severity === 'critical').length
      const major = response.alerts.filter(alert => alert.severity === 'major').length
      return { featureId: feature.id, critical, major }
    }),
  )

  const nextMap: Record<string, { critical: number; major: number }> = {}
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      nextMap[result.value.featureId] = {
        critical: result.value.critical,
        major: result.value.major,
      }
    }
  }
  featureRiskMap.value = nextMap
}

// Fetch skills from API
async function fetchSkills() {
  try {
    const data = await $fetch<{ skills: SkillMetadata[] }>('/api/skills')
    skills.value = data.skills
  } catch {
    skills.value = []
  }
}

onMounted(() => {
  fetchFeatures()
  fetchSkills()
  window.addEventListener('keydown', handleGlobalShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalShortcut)
})

// Open modal on feature card click
function handleSelectFeature(featureId: string, options: { openViewer?: boolean } = {}) {
  selectedFeatureId.value = featureId
  selectedFileName.value = null
  currentView.value = 'files'
  gitGraphStore.setSelectedFeatureId(featureId)

  if (options.openViewer !== false) {
    const feature = features.value.find(f => f.id === featureId)
    if (feature) {
      modalFeature.value = feature
      showModal.value = true
    }
  }
}

function handleSelectFile(filename: string) {
  selectedFileName.value = filename
  currentView.value = 'content'
}

function handleBack() {
  if (currentView.value === 'content') {
    selectedFileName.value = null
    currentView.value = 'files'
  } else if (currentView.value === 'files') {
    selectedFeatureId.value = null
    currentView.value = 'features'
    gitGraphStore.setSelectedFeatureId(null)
  }
}

function handleCloseModal() {
  showModal.value = false
  modalFeature.value = null
}

function handleGlobalShortcut(event: KeyboardEvent) {
  const isOpenShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
  if (!isOpenShortcut) return

  event.preventDefault()
  if (!showFeatureSearchModal.value) {
    showFeatureSearchModal.value = true
  }
}

function handleFeatureSearchClose() {
  showFeatureSearchModal.value = false
}

function handleFeatureSearchSelect(featureId: string) {
  handleSelectFeature(featureId, { openViewer: false })
  showFeatureSearchModal.value = false
}

function openFeatureSearchModal() {
  showFeatureSearchModal.value = true
}

const availableFeatureIds = computed(() => features.value.map(feature => feature.id))

function getFeatureRisk(featureId: string): { critical: number; major: number } {
  return featureRiskMap.value[featureId] ?? { critical: 0, major: 0 }
}

// Cascade pipeline
const CASCADE_STEPS: Record<string, string[]> = {
  plan: ['tasks', 'implement'],
  tasks: ['implement'],
  implement: [],
  clarify: [],
  analyze: [],
}

// Prerequisites: skill steps to run BEFORE the command itself
// 'skill:better-spec' runs the better-spec validation before analyze
const PREREQUISITE_STEPS: Record<string, string[]> = {
  analyze: ['skill:better-spec'],
}

/** Resolve the prompt for a cascade/prerequisite step.
 *  skill: prefixed steps fetch the rendered prompt from the API.
 *  speckit steps use the /speckit.{step} command format. */
async function resolveStepPrompt(step: string, featureId: string, conversationId?: string): Promise<string> {
  if (step.startsWith('skill:')) {
    const skillId = step.replace('skill:', '')
    const conv = conversationId
      ? chatStore.conversations.find(c => c.id === conversationId)
      : null
    const rendered = await $fetch<{ prompt: string }>(`/api/skills/${skillId}/prompt`, {
      method: 'POST',
      body: { featureId, cwd: conv?.worktreePath },
    })
    return rendered.prompt
  }
  return `/speckit.${step} ${featureId}`
}

function findReusableConversationId(featureId: string, forceNew: boolean): string | null {
  if (forceNew) return null
  const existing = chatStore.findConversationByFeature(featureId)
  if (existing && !chatStore.isConversationStreaming(existing.id) && !existing.finalized) {
    chatStore.selectConversation(existing.id)
    return existing.id
  }
  return null
}

function checkForFinalizedConversation(featureId: string): boolean {
  const existing = chatStore.findConversationByFeature(featureId)
  if (existing && existing.finalized) {
    toast.error(
      `This feature has a finalized conversation "${existing.title}". ` +
      'Please archive it first to start a new conversation.'
    )
    // Select the finalized conversation to help user find it
    chatStore.selectConversation(existing.id)
    return true
  }
  return false
}

async function createFeatureConversation(featureId: string, title: string, baseBranch: string): Promise<string> {
  const conversationId = await chatStore.createConversation({ featureId, baseBranch })
  if (!conversationId) {
    throw new Error('Failed to create conversation')
  }
  chatStore.renameConversation(conversationId, title)
  chatStore.selectConversation(conversationId)
  return conversationId
}

async function streamPrompt(conversationId: string, prompt: string) {
  chatStore.addUserMessage(prompt, conversationId)
  chatStore.saveConversation(conversationId, true)

  const conv = chatStore.conversations.find(c => c.id === conversationId)
  const assistantMessage = chatStore.addAssistantMessage(conversationId)
  chatStore.startSession(`session-${Date.now()}`, conversationId)
  chatStore.startConversationStreaming(conversationId)

  const streamOpts: { cwd?: string; worktreeBranch?: string; featureId?: string } = {}
  if (conv?.worktreePath) {
    streamOpts.cwd = conv.worktreePath
    streamOpts.worktreeBranch = conv.worktreeBranch
  }
  if (conv?.featureId) {
    streamOpts.featureId = conv.featureId
  }
  await streamMessage(
    prompt,
    assistantMessage.id,
    conversationId,
    Object.keys(streamOpts).length > 0 ? streamOpts : undefined,
  )
}

async function executeCascadeAction(featureId: string, command: string, conversationId: string) {
  // Check if this command has prerequisite steps (e.g. analyze needs better-spec first)
  const prerequisites = PREREQUISITE_STEPS[command]
  let prompt: string
  if (prerequisites && prerequisites.length > 0) {
    // Queue: remaining prerequisites, then the command itself, then any follow-up cascade steps
    const fullQueue = [...prerequisites.slice(1), command, ...(CASCADE_STEPS[command] || [])]
    enableCascade(featureId, conversationId, fullQueue)

    // Start with the first prerequisite step (fetch skill prompt if needed)
    const firstStep = prerequisites[0]
    try {
      prompt = await resolveStepPrompt(firstStep, featureId, conversationId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve prerequisite step')
      return
    }
  } else {
    const remainingSteps = CASCADE_STEPS[command] || []
    if (remainingSteps.length > 0) {
      enableCascade(featureId, conversationId, remainingSteps)
    }

    prompt = `/speckit.${command} ${featureId}`
  }

  await streamPrompt(conversationId, prompt)
}

async function handleCascade(event: MouseEvent, featureId: string, command: string) {
  const forceNew = event.shiftKey

  // Check for finalized conversation first (unless force-creating new)
  if (!forceNew && checkForFinalizedConversation(featureId)) {
    return
  }

  const reusableConversationId = findReusableConversationId(featureId, forceNew)

  if (reusableConversationId) {
    try {
      await executeCascadeAction(featureId, command, reusableConversationId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run cascade action')
    }
    return
  }

  pendingFeatureAction.value = {
    type: 'cascade',
    featureId,
    command,
    title: `${command}: ${featureId}`,
  }
  showCreateModal.value = true
}

// Open spec chat
async function handleOpenChat(event: MouseEvent, featureId: string) {
  void event

  // Check for finalized conversation
  if (checkForFinalizedConversation(featureId)) {
    return
  }

  pendingFeatureAction.value = {
    type: 'open-chat',
    featureId,
    title: `spec: ${featureId}`,
  }
  showCreateModal.value = true
}

async function executeSkillAction(featureId: string, skillId: string, conversationId: string) {
  let rendered: SkillPromptResponse
  try {
    const conv = chatStore.conversations.find(c => c.id === conversationId)
    rendered = await $fetch<SkillPromptResponse>(`/api/skills/${skillId}/prompt`, {
      method: 'POST',
      body: { featureId, cwd: conv?.worktreePath },
    })
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to render skill prompt')
  }

  await streamPrompt(conversationId, rendered.prompt)
}

// Skill execution
async function handleSkill(event: MouseEvent, featureId: string, skillId: string) {
  const forceNew = event.shiftKey

  // Check for finalized conversation first (unless force-creating new)
  if (!forceNew && checkForFinalizedConversation(featureId)) {
    return
  }

  const reusableConversationId = findReusableConversationId(featureId, forceNew)

  if (reusableConversationId) {
    try {
      await executeSkillAction(featureId, skillId, reusableConversationId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run skill')
    }
    return
  }

  pendingFeatureAction.value = {
    type: 'skill',
    featureId,
    skillId,
    title: `skill: ${skillId} — ${featureId}`,
  }
  showCreateModal.value = true
}

function handleCreateModalClose() {
  showCreateModal.value = false
  pendingFeatureAction.value = null
}

async function handleCreateConfirm(baseBranch: string) {
  if (!pendingFeatureAction.value) return

  creatingConversation.value = true
  try {
    const action = pendingFeatureAction.value
    const conversationId = await createFeatureConversation(action.featureId, action.title, baseBranch)
    if (action.type === 'cascade') {
      await executeCascadeAction(action.featureId, action.command, conversationId)
    } else if (action.type === 'skill') {
      await executeSkillAction(action.featureId, action.skillId, conversationId)
    }
    showCreateModal.value = false
    pendingFeatureAction.value = null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to create conversation')
  } finally {
    creatingConversation.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-retro-black">
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-retro-border">
      <div class="flex items-center gap-2 min-w-0">
        <AutoModeToggle />
      </div>

      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
          title="Search (Ctrl/Cmd+K)"
          @click="openFeatureSearchModal"
        >
          <MagnifyingGlassIcon class="h-4 w-4" />
        </button>

        <!-- Refresh button -->
        <button
          type="button"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
          title="Refresh"
          @click="fetchFeatures"
        >
          <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
    </div>

    <!-- Search input -->
    <div class="flex-shrink-0 px-3 pt-3">
      <div class="relative">
        <MagnifyingGlassIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-retro-subtle" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search features..."
          class="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded border border-retro-border bg-retro-panel text-retro-text placeholder:text-retro-subtle focus:outline-none focus:border-retro-cyan transition-colors"
        />
      </div>
    </div>

    <!-- Feature list view -->
    <div class="flex-1 overflow-y-auto p-3">
      <div class="space-y-2">
        <div
          v-for="feature in filteredFeatures"
          :key="feature.id"
          :ref="(el) => { featureRefs[feature.id] = el as HTMLElement }"
        >
          <FeatureCard
            :feature="feature"
            :skills="skills"
            :is-active="highlightedFeatureId === feature.id"
            :critical-alerts="getFeatureRisk(feature.id).critical"
            :major-alerts="getFeatureRisk(feature.id).major"
            @select="(featureId) => handleSelectFeature(featureId, { openViewer: true })"
            @cascade="handleCascade"
            @open-chat="handleOpenChat"
            @skill="handleSkill"
          />
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading && features.length === 0" class="flex items-center justify-center py-12">
        <span class="text-sm font-mono text-retro-muted animate-pulse">Loading features...</span>
      </div>

      <!-- No search results -->
      <div
        v-if="!loading && features.length > 0 && filteredFeatures.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <MagnifyingGlassIcon class="h-10 w-10 text-retro-subtle mb-3" />
        <p class="text-sm font-mono text-retro-muted">No matching features</p>
        <p class="mt-1 text-xs font-mono text-retro-subtle">
          Try a different search term
        </p>
      </div>

      <!-- Empty state -->
      <div
        v-if="!loading && features.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <FolderOpenIcon class="h-10 w-10 text-retro-subtle mb-3" />
        <p class="text-sm font-mono text-retro-muted">No features found</p>
        <p class="mt-1 text-xs font-mono text-retro-subtle">
          Create a feature in specs/ to get started
        </p>
      </div>
    </div>

    <!-- Spec viewer modal -->
    <SpecViewerModal
      v-if="showModal && modalFeature"
      :feature="modalFeature"
      @close="handleCloseModal"
    />

    <FeatureSearchModal
      v-if="showFeatureSearchModal"
      :available-feature-ids="availableFeatureIds"
      @close="handleFeatureSearchClose"
      @select="handleFeatureSearchSelect"
    />

    <NewConversationModal
      :show="showCreateModal"
      :creating="creatingConversation"
      @close="handleCreateModalClose"
      @create="handleCreateConfirm"
    />
  </div>
</template>
