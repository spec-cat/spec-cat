import type { SessionListItem } from '~/server/utils/session-store'

export function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function formatCommitDate(value: string) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  }).format(date)
}

export function shortId(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

export function displayBranch(value?: string) {
  if (!value) return '-'
  if (value.length <= 24) return value
  return `${value.slice(0, 11)}...${value.slice(-6)}`
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function formatRuntimeState(session: SessionListItem) {
  const state = session.runtime?.state || 'unknown'
  if (state === 'idle') return 'Idle'
  if (state === 'working') return 'Working'
  if (state === 'waiting_input') return 'Input'
  if (state === 'dead') return 'Dead'
  if (state === 'disconnected') return 'Offline'
  return 'Checking'
}

export function runtimeStateClass(session: SessionListItem) {
  const state = session.runtime?.state || 'unknown'

  if (state === 'working') return 'bg-[#bcd42a] text-[#2b2a27]'
  if (state === 'waiting_input') return 'bg-[#f7b83d] text-[#2b2a27]'
  if (state === 'idle') return 'bg-[#26a6a6] text-white'
  if (state === 'dead') return 'bg-[#e61f44] text-white'
  return 'bg-[#605e57] text-white'
}

export function stashName(index: number) {
  return `stash@{${index}}`
}
