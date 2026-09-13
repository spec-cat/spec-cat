import { describe, expect, test } from 'bun:test'
import { filterActiveConversations, filterArchivedConversations } from '../utils/conversation-filter'
import type { SessionListItem } from '../server/utils/session-store'

const sessions = [
  { id: 'conv-alpha', title: 'Fix Unicode', provider: 'claude', worktreeBranch: 'feature/chat', baseBranch: 'main' },
  { id: 'conv-beta', title: 'Database', provider: 'codex', worktreeBranch: 'feature/sql', baseBranch: 'develop' }
] as SessionListItem[]

describe('conversation filtering contracts', () => {
  test('active search keeps id, title, provider, and branch fields searchable', () => {
    expect(filterActiveConversations(sessions, ' CHAT ')).toEqual([sessions[0]!])
    expect(filterActiveConversations(sessions, 'DEVELOP')).toEqual([sessions[1]!])
    expect(filterActiveConversations(sessions, 'codex')).toEqual([sessions[1]!])
  })

  test('archive search intentionally excludes branch fields', () => {
    expect(filterArchivedConversations(sessions, 'chat')).toEqual([])
    expect(filterArchivedConversations(sessions, 'unicode')).toEqual([sessions[0]!])
  })

  test('blank search returns the original list', () => {
    expect(filterActiveConversations(sessions, '  ')).toBe(sessions)
  })
})
