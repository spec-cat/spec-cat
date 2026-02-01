import { computed, watch } from 'vue'
import { useSettingsStore, type Theme } from '~/stores/settings'

function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  // Sync cookie for SSR theme flash prevention
  document.cookie = `spec-cat-theme=${theme};path=/;SameSite=Lax`
}

export function useTheme() {
  const settingsStore = useSettingsStore()

  const theme = computed(() => settingsStore.theme)
  const isDark = computed(() => settingsStore.theme === 'dark')

  function toggleTheme() {
    const next: Theme = settingsStore.theme === 'dark' ? 'light' : 'dark'
    settingsStore.setTheme(next)
    applyThemeClass(next)
  }

  // Sync <html> class whenever store theme changes
  watch(() => settingsStore.theme, (newTheme) => {
    applyThemeClass(newTheme)
  }, { immediate: true })

  return { theme, isDark, toggleTheme }
}
