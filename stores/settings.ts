/**
 * Settings Store
 * Manages global application settings with server-side file persistence
 */

import { defineStore } from 'pinia'
import type { PermissionMode } from '~/types/chat'
import type { AIProviderSelection } from '~/types/aiProvider'
import { DEFAULT_MODEL_KEY, DEFAULT_PROVIDER_ID } from '~/types/aiProvider'
import { normalizeSettings } from '~/utils/settings'

export type Theme = 'dark' | 'light'

interface SettingsStoreState {
  providerId: string
  providerModelKey: string
  theme: Theme
  permissionMode: PermissionMode
  autoGenerateCommitMessages: boolean
  _hydrated: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsStoreState => ({
    providerId: DEFAULT_PROVIDER_ID,
    providerModelKey: DEFAULT_MODEL_KEY,
    theme: 'dark',
    permissionMode: 'ask',
    autoGenerateCommitMessages: false,
    _hydrated: false,
  }),

  getters: {
    providerSelection: (state) => ({ providerId: state.providerId, modelKey: state.providerModelKey }) as AIProviderSelection,
  },

  actions: {
    /**
     * Initialize store from server-side settings (call on client mount)
     */
    async hydrate() {
      if (import.meta.server || this._hydrated) return

      try {
        const saved = await $fetch<Record<string, unknown>>('/api/settings')
        const normalized = normalizeSettings(saved)
        if (normalized.providerId !== undefined) {
          this.providerId = normalized.providerId
        }
        if (normalized.providerModelKey !== undefined) {
          this.providerModelKey = normalized.providerModelKey
        }
        if (normalized.theme !== undefined) {
          this.theme = normalized.theme
        }
        if (normalized.permissionMode !== undefined) {
          this.permissionMode = normalized.permissionMode
        }
        if (normalized.autoGenerateCommitMessages !== undefined) {
          this.autoGenerateCommitMessages = normalized.autoGenerateCommitMessages
        }
        this._hydrated = true
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    },

    setTheme(theme: Theme) {
      this.theme = theme
      this._saveToServer()
    },

    setProviderSelection(selection: AIProviderSelection) {
      this.providerId = selection.providerId
      this.providerModelKey = typeof selection.modelKey === 'string' && selection.modelKey.length > 0
        ? selection.modelKey
        : DEFAULT_MODEL_KEY
      this._saveToServer(true)
    },


    setPermissionMode(mode: PermissionMode) {
      this.permissionMode = mode
      this._saveToServer()
    },

    setAutoGenerateCommitMessages(enabled: boolean) {
      this.autoGenerateCommitMessages = enabled
      this._saveToServer()
    },

    resetToDefaults() {
      this.providerId = DEFAULT_PROVIDER_ID
      this.providerModelKey = DEFAULT_MODEL_KEY
      this.theme = 'dark'
      this.permissionMode = 'ask'
      this.autoGenerateCommitMessages = false
      this._saveToServer()
    },

    _saveToServer(syncProviderSelection = false) {
      if (import.meta.server) return

      const data = {
        providerId: this.providerId,
        providerModelKey: this.providerModelKey,
        claudeModel: this.providerId === 'claude' ? this.providerModelKey : undefined,
        theme: this.theme,
        permissionMode: this.permissionMode,
        autoGenerateCommitMessages: this.autoGenerateCommitMessages,
      }
      $fetch<{ success: boolean; settings?: Record<string, unknown> }>('/api/settings', { method: 'POST', body: data })
        .then((response) => {
          if (!syncProviderSelection || !response?.settings) return
          const providerId = response.settings.providerId
          const providerModelKey = response.settings.providerModelKey
          if (typeof providerId === 'string') {
            this.providerId = providerId
          }
          if (typeof providerModelKey === 'string' && providerModelKey.length > 0) {
            this.providerModelKey = providerModelKey
          }
        })
        .catch((error) => {
          console.error('Failed to save settings:', error)
        })
    },
  },
})
