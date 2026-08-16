<script setup lang="ts">
import type { SessionListItem } from '~/server/utils/session-store'
import type { CascadeState, SkillInfo, SpecFeature, TraceabilityInfo } from '~/types/app'

defineProps<{
  collapsed: boolean
  mobile: boolean
  features: SpecFeature[]
  filteredFeatures: SpecFeature[]
  loading: boolean
  selectedFeatureId: string
  sessionId: string
  featureSessionMap: Map<string, SessionListItem>
  traceability: Map<string, TraceabilityInfo>
  cascade: CascadeState | null
  skills: SkillInfo[]
  speckitSteps: string[]
}>()

const searchQuery = defineModel<string>('searchQuery', { required: true })

defineEmits<{
  refresh: []
  openFeature: [feature: SpecFeature]
  openConversation: [feature: SpecFeature]
  runSpeckitStep: [feature: SpecFeature, step: string, event: MouseEvent]
  startCascade: [feature: SpecFeature, event: MouseEvent]
  cancelCascade: []
  runSkill: [skill: SkillInfo, feature: SpecFeature, event: MouseEvent]
}>()

function featureRiskClass(risk: TraceabilityInfo['risk']) {
  if (risk === 'high') return 'border-[#f03e5f] text-[#f03e5f]'
  if (risk === 'medium') return 'border-[#f7b83d] text-[#f7b83d]'
  return 'border-[#bcd42a] text-[#bcd42a]'
}
</script>

<template>
  <aside
    v-show="!collapsed"
    class="brick-specs grid min-h-0 min-w-0 overflow-hidden grid-rows-[35px_44px_minmax(0,1fr)] border-r border-black/40 bg-[var(--rg-sidebar)]"
    :class="mobile ? 'absolute inset-y-0 left-12 right-0 z-30' : ''"
  >
    <div class="flex min-w-0 items-center justify-between gap-2 border-b border-black/30 px-4 text-[11px] font-bold uppercase tracking-wide text-[var(--rg-foreground)]">
      <span class="truncate">Spec Browser</span>
    </div>
    <div class="flex min-w-0 items-center gap-2 border-b border-black/30 bg-[var(--rg-sidebar-header)] px-3">
      <input
        v-model="searchQuery"
        type="search"
        class="h-7 min-w-0 flex-1 border border-[var(--rg-border)] bg-[var(--rg-input)] px-2 text-xs text-[var(--rg-foreground)] outline-none placeholder:text-[#88857c] focus:border-[var(--rg-accent)]"
        placeholder="Search specs"
        aria-label="Search specs"
      >
      <button
        type="button"
        class="h-7 border border-[var(--rg-border)] bg-[var(--rg-input)] px-3 text-xs font-bold text-[var(--rg-foreground)] hover:border-[var(--rg-accent)]"
        @click="$emit('refresh')"
      >
        Refresh
      </button>
    </div>

    <div class="min-h-0 overflow-auto p-2">
      <div class="mb-2 flex h-6 items-center px-1 text-[11px] font-bold uppercase text-[#a0988e]">
        Spec Directories ({{ filteredFeatures.length }})
      </div>
      <div class="grid gap-2">
        <div
          v-for="feature in filteredFeatures"
          :key="feature.id"
          class="grid gap-1.5 border bg-[var(--rg-editor-group)] p-2.5 text-left text-[12px] text-[var(--rg-foreground)]"
          :class="selectedFeatureId === feature.id
            ? 'border-[var(--rg-accent)]'
            : 'border-[var(--rg-border)] hover:border-[#a0988e]'"
          :title="`${feature.id} — open spec files`"
          role="button"
          tabindex="0"
          @click="$emit('openFeature', feature)"
          @keydown.enter="$emit('openFeature', feature)"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono font-semibold">{{ feature.id }}</span>
            <span
              v-if="featureSessionMap.get(feature.id)"
              class="shrink-0 border px-1 text-[9px] font-bold uppercase"
              :class="sessionId === featureSessionMap.get(feature.id)!.id
                ? 'border-[var(--rg-accent)] bg-[var(--rg-accent)] text-white'
                : 'border-[var(--rg-accent)] text-[var(--rg-accent)]'"
              :title="`Actions run in: ${featureSessionMap.get(feature.id)!.title || featureSessionMap.get(feature.id)!.id} (${featureSessionMap.get(feature.id)!.worktreeBranch || 'no branch'})`"
            >
              active
            </span>
          </div>
          <p class="truncate text-[11px] text-[#a0988e]">{{ feature.name }}</p>
          <div class="flex min-w-0 flex-wrap gap-1 text-[9px] font-bold uppercase">
            <span v-if="feature.hasSpec" class="border border-[var(--rg-border)] px-1 text-[var(--rg-accent)]">spec</span>
            <span v-if="feature.hasPlan" class="border border-[var(--rg-border)] px-1 text-[#f7b83d]">plan</span>
            <span v-if="feature.hasTasks" class="border border-[var(--rg-border)] px-1 text-[#ff5d38]">tasks {{ feature.completedTasks }}/{{ feature.totalTasks }}</span>
            <span
              v-if="traceability.get(feature.id) && traceability.get(feature.id)!.risk !== 'none'"
              class="border px-1"
              :class="featureRiskClass(traceability.get(feature.id)!.risk)"
              :title="traceability.get(feature.id)!.alerts.join('\n')"
            >
              FR {{ traceability.get(feature.id)!.counts.total - traceability.get(feature.id)!.counts.uncovered }}/{{ traceability.get(feature.id)!.counts.total }}
            </span>
            <span class="ml-auto border border-transparent px-1 text-[#88857c]">{{ feature.files.length }} files</span>
          </div>
          <div class="flex flex-wrap items-center gap-1 border-t border-black/30 pt-1.5">
            <button
              type="button"
              class="border border-[var(--rg-accent)] bg-[var(--rg-accent)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--rg-accent)] hover:bg-[var(--rg-accent)] hover:text-white"
              :title="featureSessionMap.get(feature.id)
                ? `Attach to ${featureSessionMap.get(feature.id)!.title || featureSessionMap.get(feature.id)!.id} and start a clean context`
                : `Create a conversation from ${feature.id} and start a clean context`"
              @click.stop="$emit('openConversation', feature)"
            >
              chat
            </button>
            <button
              v-for="step in speckitSteps"
              :key="step"
              type="button"
              class="border border-[var(--rg-border)] bg-[var(--rg-input)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--rg-foreground)] hover:border-[var(--rg-accent)] disabled:opacity-40"
              :disabled="Boolean(cascade)"
              :title="(featureSessionMap.get(feature.id)
                ? `Send /speckit.${step} ${feature.id} to ${featureSessionMap.get(feature.id)!.title || featureSessionMap.get(feature.id)!.id}`
                : `Send /speckit.${step} ${feature.id} in a new conversation`) + ' (Shift+click: new conversation)'"
              @click.stop="$emit('runSpeckitStep', feature, step, $event)"
            >
              {{ step }}
            </button>
            <button
              v-if="!cascade || cascade.featureId !== feature.id"
              type="button"
              class="border border-[var(--rg-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--rg-accent)] hover:bg-[var(--rg-accent)] hover:text-white disabled:opacity-40"
              :disabled="Boolean(cascade)"
              title="Run the remaining speckit steps sequentially in the conversation on this feature's branch, waiting for the CLI to go idle between steps (Shift+click: new conversation)"
              @click.stop="$emit('startCascade', feature, $event)"
            >
              ▶ auto
            </button>
            <span
              v-else
              class="flex items-center gap-1 text-[9px] font-bold uppercase text-[var(--rg-accent)]"
            >
              <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--rg-accent)]" />
              {{ cascade.steps[cascade.index] }} ({{ cascade.index + 1 }}/{{ cascade.steps.length }})
              <button
                type="button"
                class="border border-[var(--rg-border)] px-1 text-[9px] text-[var(--rg-foreground)] hover:border-[#f03e5f] hover:text-[#f03e5f]"
                @click.stop="$emit('cancelCascade')"
              >
                cancel
              </button>
            </span>
            <button
              v-for="skill in skills"
              :key="skill.id"
              type="button"
              class="border border-[var(--rg-border)] bg-[var(--rg-input)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#d7e67e] hover:border-[var(--rg-accent)]"
              :title="`${skill.description || `Run skill ${skill.id} on ${feature.id}`} (Shift+click: new conversation)`"
              @click.stop="$emit('runSkill', skill, feature, $event)"
            >
              ✦ {{ skill.id }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="loading && !features.length" class="px-2 py-3 text-[12px] text-[#88857c]">
        Loading specs...
      </p>
      <p v-else-if="!filteredFeatures.length" class="px-2 py-3 text-[12px] text-[#88857c]">
        No spec directories found.
      </p>
    </div>
  </aside>
</template>
