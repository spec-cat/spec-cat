<script setup lang="ts">
import { PlusIcon, ArrowPathIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useWorktreeStore } from '~/stores/worktree'

const worktreeStore = useWorktreeStore()

const showCreateModal = ref(false)

onMounted(() => {
  worktreeStore.fetchWorktrees()
})

const handleRefresh = () => {
  worktreeStore.fetchWorktrees()
}

const handleCreate = () => {
  showCreateModal.value = true
}

const handleSwitch = async (name: string) => {
  await worktreeStore.switchWorktree(name)
}

const handleDelete = async (name: string) => {
  if (confirm(`Delete worktree "${name}"? This will remove the worktree directory.`)) {
    await worktreeStore.deleteWorktree(name, false)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-retro-black">
    <!-- Header -->
    <div class="flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-retro-border bg-retro-dark">
      <h2 class="text-sm font-mono text-retro-text">Worktrees</h2>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="p-1.5 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-panel transition-colors"
          title="Refresh"
          @click="handleRefresh"
        >
          <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': worktreeStore.loading }" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded text-retro-muted hover:text-retro-green hover:bg-retro-panel transition-colors"
          title="Create worktree"
          @click="handleCreate"
        >
          <PlusIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="worktreeStore.error" class="px-4 py-2 bg-retro-red/20 border-b border-retro-red/50">
      <p class="text-xs font-mono text-retro-red">{{ worktreeStore.error }}</p>
    </div>

    <!-- Worktree list -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-for="worktree in worktreeStore.worktrees"
        :key="worktree.name"
        class="group p-3 rounded-md border transition-colors"
        :class="[
          worktree.isCurrent
            ? 'bg-retro-cyan/10 border-retro-cyan'
            : 'bg-retro-panel border-retro-border hover:border-retro-muted'
        ]"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <!-- Branch name -->
            <div class="flex items-center gap-2">
              <span
                class="font-mono text-sm truncate"
                :class="worktree.isCurrent ? 'text-retro-cyan' : 'text-retro-text'"
              >
                {{ worktree.name }}
              </span>
              <WorktreeStatusBadge :status="worktree.status" />
              <span
                v-if="worktree.isMain"
                class="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-retro-yellow/20 text-retro-yellow rounded"
              >
                main
              </span>
              <span
                v-if="worktree.isCurrent"
                class="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-retro-cyan/20 text-retro-cyan rounded"
              >
                current
              </span>
            </div>

            <!-- Last commit -->
            <div v-if="worktree.lastCommit" class="mt-1 text-xs font-mono text-retro-muted truncate">
              <span class="text-retro-subtle">{{ worktree.lastCommit.shortHash }}</span>
              <span class="mx-1">·</span>
              <span>{{ worktree.lastCommit.message }}</span>
            </div>

            <!-- Path -->
            <div class="mt-1 text-[10px] font-mono text-retro-subtle truncate">
              {{ worktree.path }}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              v-if="!worktree.isCurrent && !worktree.isMain"
              type="button"
              class="p-1 rounded text-retro-muted hover:text-retro-cyan hover:bg-retro-dark transition-colors"
              title="Switch to this worktree"
              @click.stop="handleSwitch(worktree.name)"
            >
              <ArrowPathIcon class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="!worktree.isMain"
              type="button"
              class="p-1 rounded text-retro-muted hover:text-retro-red hover:bg-retro-dark transition-colors"
              title="Delete worktree"
              @click.stop="handleDelete(worktree.name)"
            >
              <TrashIcon class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Commit count -->
        <div v-if="worktree.commitCount > 0" class="mt-2 text-[10px] font-mono text-retro-green">
          {{ worktree.commitCount }} commit{{ worktree.commitCount > 1 ? 's' : '' }} ahead
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="!worktreeStore.loading && worktreeStore.worktrees.length === 0"
        class="flex flex-col items-center justify-center py-8 text-center"
      >
        <p class="text-sm font-mono text-retro-muted">No worktrees found</p>
        <p class="mt-1 text-xs font-mono text-retro-subtle">Create a new worktree to start working on a feature</p>
      </div>
    </div>

    <!-- Create modal -->
    <WorktreeCreateModal v-model="showCreateModal" />
  </div>
</template>
