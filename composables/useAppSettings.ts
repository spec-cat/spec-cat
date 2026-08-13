import type { Ref } from 'vue'
import type { ProviderId } from '~/server/utils/session-store'
import type { AppSettingsPayload } from '~/types/app'

export function useAppSettings(options: {
  selectedThemeName: Ref<string>
  gitGraphState: Ref<'floating' | 'pinned'>
  defaultProvider: Ref<ProviderId>
  newSessionProvider: Ref<ProviderId>
  isMobile: Ref<boolean>
  isKnownTheme: (name: string) => boolean
}) {
  let loaded = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  async function loadAppSettings() {
    try {
      const response = await $fetch<{ settings: AppSettingsPayload }>('/api/settings')
      const settings = response.settings || {}
      if (settings.theme && options.isKnownTheme(settings.theme)) options.selectedThemeName.value = settings.theme
      if ((settings.gitGraphState === 'floating' || settings.gitGraphState === 'pinned') && options.isMobile.value) options.gitGraphState.value = settings.gitGraphState
      if (settings.defaultProvider === 'claude' || settings.defaultProvider === 'codex') {
        options.defaultProvider.value = settings.defaultProvider
        options.newSessionProvider.value = settings.defaultProvider
      }
    } catch (error) { console.warn('Failed to load settings', error) }
    finally { loaded = true }
  }
  function persistAppSettings() {
    if (!loaded) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void $fetch('/api/settings', { method: 'POST', body: {
        theme: options.selectedThemeName.value,
        gitGraphState: options.gitGraphState.value,
        defaultProvider: options.defaultProvider.value
      } }).catch((error) => console.warn('Failed to save settings', error))
    }, 400)
  }
  function disposeAppSettings() { if (saveTimer) clearTimeout(saveTimer) }
  return { loadAppSettings, persistAppSettings, disposeAppSettings }
}
