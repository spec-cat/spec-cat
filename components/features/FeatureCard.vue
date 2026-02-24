<script setup lang="ts">
import {
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  PlayIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentListIcon,
  ListBulletIcon,
  DocumentCheckIcon,
  PuzzlePieceIcon,
  DocumentMagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  SparklesIcon,
  BeakerIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  CpuChipIcon,
  LightBulbIcon,
} from '@heroicons/vue/24/outline'
import type { Component } from 'vue'
import type { Feature } from '~/types/spec-viewer'
import type { SkillMetadata } from '~/types/skill'
import { useChatStore } from '~/stores/chat'

const SKILL_ICON_MAP: Record<string, Component> = {
  DocumentCheckIcon,
  PuzzlePieceIcon,
  DocumentMagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  SparklesIcon,
  BeakerIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  CpuChipIcon,
  LightBulbIcon,
}

const props = defineProps<{
  feature: Feature
  skills: SkillMetadata[]
  isActive: boolean
}>()

const emit = defineEmits<{
  select: [featureId: string]
  cascade: [event: MouseEvent, featureId: string, command: string]
  openChat: [event: MouseEvent, featureId: string]
  skill: [event: MouseEvent, featureId: string, skillId: string]
}>()

const chatStore = useChatStore()

function resolveIcon(iconName: string): Component {
  return SKILL_ICON_MAP[iconName] || PuzzlePieceIcon
}

function isSkillAvailable(skill: SkillMetadata): boolean {
  return skill.prerequisites.every(p => props.feature.files.some(f => f.filename === p))
}

function getMissingPrerequisites(skill: SkillMetadata): string[] {
  return skill.prerequisites.filter(p => !props.feature.files.some(f => f.filename === p))
}

function getSkillTooltip(skill: SkillMetadata): string {
  if (!isSkillAvailable(skill)) {
    const missing = getMissingPrerequisites(skill)
    return `Requires: ${missing.join(', ')}`
  }
  return `${skill.name} (Shift+click: new conversation)`
}

const isFeatureStreaming = computed(() => {
  const conv = chatStore.findConversationByFeature(props.feature.id)
  return conv ? chatStore.isConversationStreaming(conv.id) : false
})

const cardClass = computed(() => {
  if (props.isActive) {
    return [
      'border-retro-cyan shadow-retro',
      'feature-card-active',
      'dark:bg-gradient-to-br dark:from-retro-cyan/10 dark:via-retro-panel dark:to-retro-magenta/5',
    ]
  }
  return [
    'border-retro-border',
    'feature-card-light',
    'hover:border-retro-muted',
    'dark:bg-gradient-to-br',
    'dark:from-retro-panel dark:via-retro-panel dark:to-retro-cyan/5',
    'dark:hover:from-retro-cyan/5 dark:hover:via-retro-panel dark:hover:to-retro-magenta/5',
  ]
})
</script>

<template>
  <button
    type="button"
    class="w-full p-3 text-left rounded-lg border transition-all duration-200 group"
    :class="cardClass"
    @click="emit('select', feature.id)"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <DocumentTextIcon class="h-4 w-4 flex-shrink-0 transition-colors duration-200" :class="isActive ? 'text-retro-cyan' : 'text-retro-muted group-hover:text-retro-cyan'" />
          <span class="font-mono text-sm text-retro-text truncate">
            {{ feature.id }}
          </span>
        </div>
        <p class="text-sm font-mono text-retro-muted mt-1 truncate">
          {{ feature.name }}
        </p>
      </div>

      <!-- Task progress + status dots (top-right) -->
      <div class="flex items-center gap-1 flex-shrink-0">
        <span
          v-if="feature.hasTasks"
          class="text-[11px] font-mono text-retro-muted mr-1"
          title="Completed tasks / total tasks"
        >
          {{ feature.completedTasks }}/{{ feature.totalTasks }}
        </span>
        <span
          v-if="feature.hasSpec"
          class="w-2 h-2 rounded-full bg-retro-green"
          title="spec"
        />
        <span
          v-if="feature.hasPlan"
          class="w-2 h-2 rounded-full bg-retro-cyan"
          title="plan"
        />
        <span
          v-if="feature.hasTasks"
          class="w-2 h-2 rounded-full bg-retro-yellow"
          title="tasks"
        />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-wrap items-center justify-between gap-1 mt-2">
      <div
        v-if="feature.hasSpec"
        class="flex items-center gap-1"
      >
        <!-- Cascade action buttons -->
        <button
          type="button"
          class="flex items-center justify-center p-1 bg-retro-cyan/20 text-retro-cyan rounded hover:bg-retro-cyan/30 transition-colors"
          title="Clarify spec (Shift+click: new conversation)"
          @click.stop="emit('cascade', $event, feature.id, 'clarify')"
        >
          <QuestionMarkCircleIcon class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="flex items-center justify-center p-1 bg-retro-cyan/20 text-retro-cyan rounded hover:bg-retro-cyan/30 transition-colors"
          title="Plan → Tasks → Implement (Shift+click: new conversation)"
          @click.stop="emit('cascade', $event, feature.id, 'plan')"
        >
          <ClipboardDocumentListIcon class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="feature.hasPlan"
          type="button"
          class="flex items-center justify-center p-1 bg-retro-yellow/20 text-retro-yellow rounded hover:bg-retro-yellow/30 transition-colors"
          title="Tasks → Implement (Shift+click: new conversation)"
          @click.stop="emit('cascade', $event, feature.id, 'tasks')"
        >
          <ListBulletIcon class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="feature.hasTasks"
          type="button"
          class="flex items-center justify-center p-1 bg-retro-magenta/20 text-retro-magenta rounded hover:bg-retro-magenta/30 transition-colors"
          title="Implement (Shift+click: new conversation)"
          @click.stop="emit('cascade', $event, feature.id, 'implement')"
        >
          <PlayIcon class="h-3.5 w-3.5" />
        </button>

        <!-- Skill action buttons (visually separated) -->
        <template v-if="skills.length > 0">
          <div class="w-px h-4 bg-retro-border mx-0.5" />
          <button
            v-for="skill in skills"
            :key="skill.id"
            type="button"
            class="flex items-center justify-center p-1 rounded transition-colors"
            :class="[
              isSkillAvailable(skill) && !isFeatureStreaming
                ? 'bg-retro-pink/20 text-retro-pink hover:bg-retro-pink/30'
                : 'bg-retro-subtle/10 text-retro-subtle cursor-not-allowed',
              isFeatureStreaming ? 'animate-pulse' : '',
            ]"
            :title="getSkillTooltip(skill)"
            :disabled="!isSkillAvailable(skill) || isFeatureStreaming"
            @click.stop="emit('skill', $event, feature.id, skill.id)"
          >
            <component :is="resolveIcon(skill.icon)" class="h-3.5 w-3.5" />
          </button>
        </template>
      </div>

      <!-- Open new chat button (right-aligned) -->
      <button
        v-if="feature.hasSpec"
        type="button"
        class="flex items-center justify-center p-1 bg-retro-green/20 text-retro-green rounded hover:bg-retro-green/30 transition-colors"
        title="Open new chat linked to this spec"
        @click.stop="emit('openChat', $event, feature.id)"
      >
        <ChatBubbleLeftIcon class="h-3.5 w-3.5" />
      </button>
    </div>
  </button>
</template>
