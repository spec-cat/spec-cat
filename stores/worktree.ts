/**
 * Worktree Store
 * Manages git worktrees for vibe-kanban workflow
 */

import { defineStore } from 'pinia'
import type {
  Worktree,
  WorktreeListResponse,
  WorktreeCreateRequest,
  WorktreeCreateResponse,
  WorktreeDeleteResponse,
  WorktreeSwitchResponse,
} from '~/types/worktree'

interface WorktreeState {
  worktrees: Worktree[]
  currentBranch: string
  mainWorktree: string
  workingDirectory: string
  loading: boolean
  error: string | null
}

export const useWorktreeStore = defineStore('worktree', {
  state: (): WorktreeState => ({
    worktrees: [],
    currentBranch: '',
    mainWorktree: '',
    workingDirectory: '',
    loading: false,
    error: null,
  }),

  getters: {
    activeWorktree: (state): Worktree | undefined => {
      return state.worktrees.find(w => w.isCurrent)
    },

    featureWorktrees: (state): Worktree[] => {
      return state.worktrees.filter(w => !w.isMain)
    },

    mainWorktreeInfo: (state): Worktree | undefined => {
      return state.worktrees.find(w => w.isMain)
    },

    hasWorktrees: (state): boolean => {
      return state.worktrees.length > 1
    },

    dirtyWorktrees: (state): Worktree[] => {
      return state.worktrees.filter(w => w.status === 'dirty')
    },
  },

  actions: {
    async initialize() {
      if (!this.workingDirectory) {
        try {
          const { cwd } = await $fetch<{ cwd: string }>('/api/cwd')
          this.workingDirectory = cwd
        } catch (error) {
          console.error('Failed to get working directory:', error)
          this.workingDirectory = ''
        }
      }
    },

    async fetchWorktrees() {
      await this.initialize()

      this.loading = true
      this.error = null

      try {
        const response = await $fetch<WorktreeListResponse>('/api/worktrees', {
          query: { workingDirectory: this.workingDirectory },
        })

        this.worktrees = response.worktrees
        this.currentBranch = response.currentBranch
        this.mainWorktree = response.mainWorktree
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch worktrees'
        console.error('Failed to fetch worktrees:', error)
      } finally {
        this.loading = false
      }
    },

    async createWorktree(request: WorktreeCreateRequest): Promise<WorktreeCreateResponse> {
      await this.initialize()

      this.loading = true
      this.error = null

      try {
        const response = await $fetch<WorktreeCreateResponse>('/api/worktrees', {
          method: 'POST',
          query: { workingDirectory: this.workingDirectory },
          body: request,
        })

        if (response.success && response.worktree) {
          this.worktrees.push(response.worktree)
        } else if (response.error) {
          this.error = response.error
        }

        return response
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create worktree'
        this.error = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        this.loading = false
      }
    },

    async deleteWorktree(name: string, deleteBranch: boolean = false): Promise<WorktreeDeleteResponse> {
      await this.initialize()

      this.loading = true
      this.error = null

      try {
        const response = await $fetch<WorktreeDeleteResponse>(`/api/worktrees/${name}`, {
          method: 'DELETE',
          query: {
            workingDirectory: this.workingDirectory,
            deleteBranch: deleteBranch.toString(),
          },
        })

        if (response.success) {
          this.worktrees = this.worktrees.filter(w => w.name !== name)
        } else if (response.error) {
          this.error = response.error
        }

        return response
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete worktree'
        this.error = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        this.loading = false
      }
    },

    async switchWorktree(name: string): Promise<WorktreeSwitchResponse> {
      await this.initialize()

      this.loading = true
      this.error = null

      try {
        const response = await $fetch<WorktreeSwitchResponse>(`/api/worktrees/${name}/switch`, {
          method: 'POST',
          query: { workingDirectory: this.workingDirectory },
        })

        if (response.success) {
          // Update current state
          this.worktrees = this.worktrees.map(w => ({
            ...w,
            isCurrent: w.name === name,
          }))
          this.currentBranch = name
        } else if (response.error) {
          this.error = response.error
        }

        return response
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to switch worktree'
        this.error = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        this.loading = false
      }
    },

    clearError() {
      this.error = null
    },
  },
})
