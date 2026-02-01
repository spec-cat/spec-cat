<script setup lang="ts">
import GitDialog from '~/components/git/GitDialog.vue'

interface TagDetail {
  tagger?: {
    name: string
    email: string
    date: string
  }
  message?: string
  hash: string
  isAnnotated: boolean
}

interface Props {
  visible: boolean
  tagName: string
  tagDetail: TagDetail | null
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <GitDialog
    title="Tag Details"
    :visible="visible"
    :loading="loading"
    confirm-label="Close"
    cancel-label="Close"
    @close="emit('close')"
    @confirm="emit('close')"
  >
    <!-- Tag name -->
    <div class="mb-4">
      <label class="block text-retro-muted text-xs font-mono mb-1">Tag</label>
      <p class="text-retro-cyan text-sm font-mono">{{ tagName }}</p>
    </div>

    <template v-if="tagDetail">
      <!-- Tag type -->
      <div class="mb-4">
        <label class="block text-retro-muted text-xs font-mono mb-1">Type</label>
        <p class="text-retro-text text-sm font-mono">
          {{ tagDetail.isAnnotated ? 'Annotated' : 'Lightweight' }}
        </p>
      </div>

      <!-- Hash -->
      <div class="mb-4">
        <label class="block text-retro-muted text-xs font-mono mb-1">Hash</label>
        <p class="text-retro-text text-sm font-mono break-all select-all">{{ tagDetail.hash }}</p>
      </div>

      <!-- Tagger info (annotated tags only) -->
      <template v-if="tagDetail.tagger">
        <div class="mb-4">
          <label class="block text-retro-muted text-xs font-mono mb-1">Tagger</label>
          <p class="text-retro-text text-sm font-mono">
            {{ tagDetail.tagger.name }}
            <span class="text-retro-muted">&lt;{{ tagDetail.tagger.email }}&gt;</span>
          </p>
        </div>

        <div class="mb-4">
          <label class="block text-retro-muted text-xs font-mono mb-1">Date</label>
          <p class="text-retro-text text-sm font-mono">{{ tagDetail.tagger.date }}</p>
        </div>
      </template>

      <!-- Message (annotated tags only) -->
      <div v-if="tagDetail.message" class="mb-2">
        <label class="block text-retro-muted text-xs font-mono mb-1">Message</label>
        <div class="p-2 text-sm font-mono text-retro-text bg-retro-panel border border-retro-border rounded whitespace-pre-wrap">
          {{ tagDetail.message }}
        </div>
      </div>
    </template>

    <!-- Loading state -->
    <div v-else-if="loading" class="text-retro-muted text-sm font-mono text-center py-4">
      Loading tag details...
    </div>
  </GitDialog>
</template>
