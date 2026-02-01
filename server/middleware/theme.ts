/**
 * Server middleware that reads theme from settings.json and sets a cookie.
 * This allows the client-side inline script to apply the correct theme
 * before hydration, preventing theme flash.
 */

import { readSpecCatStore } from '../utils/specCatStore'

export default defineEventHandler(async (event) => {
  // Only set cookie on HTML page requests (not API or asset requests)
  const url = getRequestURL(event)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_nuxt/')) return

  try {
    const settings = await readSpecCatStore<{ theme?: string }>('settings.json', {})
    const theme = settings.theme === 'light' ? 'light' : 'dark'
    setCookie(event, 'spec-cat-theme', theme, { path: '/', httpOnly: false, sameSite: 'lax' })
  } catch {
    // Default to dark if settings can't be read
    setCookie(event, 'spec-cat-theme', 'dark', { path: '/', httpOnly: false, sameSite: 'lax' })
  }
})
