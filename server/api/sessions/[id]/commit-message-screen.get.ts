import { captureActiveQueryScreen } from '../../../utils/provider-query'

/**
 * Returns the live terminal screen of the ephemeral provider-query session
 * currently drafting a commit message for this conversation, or null when no
 * query is running. Lets the UI show the CLI while it works, so a stuck or
 * misbehaving generation can be diagnosed instead of failing opaquely.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation id' })
  }
  return { screen: await captureActiveQueryScreen(id) }
})
