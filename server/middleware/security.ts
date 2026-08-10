const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  const isTerminalUpgrade = event.path.startsWith('/api/terminal') && Boolean(getHeader(event, 'upgrade'))
  if (SAFE_METHODS.has(event.method) && !isTerminalUpgrade) return
  if (!origin || !host) return

  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Invalid request origin' })
  }
  if (originHost !== host) throw createError({ statusCode: 403, statusMessage: 'Cross-origin request denied' })
})
