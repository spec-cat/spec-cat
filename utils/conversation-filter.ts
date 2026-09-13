import type { SessionListItem } from '~/types/session'

export function filterActiveConversations(sessions: SessionListItem[], search: string): SessionListItem[] {
  return filterConversations(sessions, search, true)
}

export function filterArchivedConversations(sessions: SessionListItem[], search: string): SessionListItem[] {
  return filterConversations(sessions, search, false)
}

function filterConversations(sessions: SessionListItem[], search: string, includeBranches: boolean) {
  const query = search.trim().toLowerCase()
  if (!query) return sessions
  return sessions.filter((session) => {
    const fields = [session.id, session.title || '', session.provider]
    if (includeBranches) fields.push(session.worktreeBranch || '', session.baseBranch || '')
    return fields.some((field) => field.toLowerCase().includes(query))
  })
}
