import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Make readonly() a pass-through so tests can seed state via the exposed refs.
// Production code doesn't depend on the readonly enforcement for correctness.
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, readonly: <T>(target: T): T => target }
})

const { useChatStore } = await import('~/stores/chat')
import type { Conversation, TextBlock, ToolUseBlock } from '~/types/chat'

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-test',
    title: 'Test',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cwd: '/tmp/test',
    providerId: 'claude',
    providerModelKey: 'sonnet',
    ...overrides,
  }
}

function seedConversation(store: ReturnType<typeof useChatStore>, conv?: Partial<Conversation>) {
  const c = makeConversation(conv)
  ;(store as any).conversations.push(c)
  ;(store as any).activeConversationId = c.id
  return c
}

describe('chat store — messages', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addUserMessage appends user message with generated id and timestamp', () => {
    const store = useChatStore()
    seedConversation(store)

    const msg = store.addUserMessage('hello')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
    expect(msg.id).toBeTruthy()
    expect(msg.timestamp).toBeTruthy()
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0]).toStrictEqual(msg)
  })

  it('addUserMessage includes attachments only when non-empty', () => {
    const store = useChatStore()
    seedConversation(store)

    const noAttach = store.addUserMessage('a')
    expect(noAttach.attachments).toBeUndefined()

    const emptyAttach = store.addUserMessage('b', undefined, [])
    expect(emptyAttach.attachments).toBeUndefined()

    const withAttach = store.addUserMessage('c', undefined, [
      { id: 'a1', dataUrl: 'data:image/png;base64,xxx', mimeType: 'image/png' } as any,
    ])
    expect(withAttach.attachments).toHaveLength(1)
  })

  it('addAssistantMessage starts with empty content and streaming status', () => {
    const store = useChatStore()
    seedConversation(store)

    const msg = store.addAssistantMessage()
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('')
    expect(msg.status).toBe('streaming')
  })

  it('addMessage is a no-op when there is no active conversation', () => {
    const store = useChatStore()
    const msg = { id: 'm1', role: 'user' as const, content: 'x', timestamp: 't' }
    store.addMessage(msg)
    expect(store.conversations).toHaveLength(0)
  })

  it('appendToMessage concatenates chunks in order', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()

    store.appendToMessage(msg.id, 'Hello ')
    store.appendToMessage(msg.id, 'world')
    store.appendToMessage(msg.id, '!')

    expect(store.messages[0].content).toBe('Hello world!')
  })

  it('appendToMessage silently ignores unknown message id', () => {
    const store = useChatStore()
    seedConversation(store)
    store.addAssistantMessage()

    expect(() => store.appendToMessage('nonexistent', 'data')).not.toThrow()
  })

  it('updateMessage applies partial updates and preserves other fields', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()

    store.updateMessage(msg.id, { status: 'complete', content: 'final' })

    const updated = store.messages[0]
    expect(updated.status).toBe('complete')
    expect(updated.content).toBe('final')
    expect(updated.role).toBe('assistant')
    expect(updated.id).toBe(msg.id)
  })

  it('resetMessageForReplay clears content and blocks, resets status to streaming', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    const msg = store.addAssistantMessage()
    store.updateMessage(msg.id, { content: 'partial', status: 'error' })

    const block: TextBlock = { id: 'b1', type: 'text', text: 'old' }
    store.appendContentBlock(msg.id, block)

    store.resetMessageForReplay(msg.id, conv.id)

    const reset = store.messages[0]
    expect(reset.content).toBe('')
    expect(reset.status).toBe('streaming')
    expect(reset.contentBlocks).toEqual([])
  })
})

describe('chat store — content blocks', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('appendContentBlock initializes contentBlocks array on first call', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()

    const block: TextBlock = { id: 'b1', type: 'text', text: 'first' }
    store.appendContentBlock(msg.id, block)

    expect(store.messages[0].contentBlocks).toEqual([block])
  })

  it('appendContentBlock preserves insertion order', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()

    const b1: TextBlock = { id: 'b1', type: 'text', text: '1' }
    const b2: TextBlock = { id: 'b2', type: 'text', text: '2' }
    const b3: TextBlock = { id: 'b3', type: 'text', text: '3' }
    store.appendContentBlock(msg.id, b1)
    store.appendContentBlock(msg.id, b2)
    store.appendContentBlock(msg.id, b3)

    expect(store.messages[0].contentBlocks?.map(b => b.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('updateBlockById invokes updater and replaces the block by reference', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()

    const block: ToolUseBlock = {
      id: 'tb1',
      type: 'tool_use',
      toolUseId: 'tu1',
      name: 'Read',
      input: { path: '/a' },
      inputSummary: '/a',
      status: 'pending',
    }
    store.appendContentBlock(msg.id, block)

    store.updateBlockById(msg.id, 'tb1', (b) => {
      if (b.type === 'tool_use') b.status = 'complete'
    })

    const updated = store.messages[0].contentBlocks?.[0] as ToolUseBlock
    expect(updated.status).toBe('complete')
    // Replacement by reference (updater copy, not mutation of original)
    expect(updated).not.toBe(block)
  })

  it('updateBlockById is a no-op for unknown block ids', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()
    const block: TextBlock = { id: 'b1', type: 'text', text: 'x' }
    store.appendContentBlock(msg.id, block)

    expect(() => store.updateBlockById(msg.id, 'missing', () => {})).not.toThrow()
    expect(store.messages[0].contentBlocks?.[0]).toEqual(block)
  })

  it('findToolUseBlock returns tool_use block matching toolUseId', () => {
    const store = useChatStore()
    seedConversation(store)
    const msg = store.addAssistantMessage()
    const tool: ToolUseBlock = {
      id: 'b1',
      type: 'tool_use',
      toolUseId: 'tu-42',
      name: 'Bash',
      input: {},
      inputSummary: '',
      status: 'running',
    }
    store.appendContentBlock(msg.id, tool)

    expect(store.findToolUseBlock(msg.id, 'tu-42')).toBe(store.messages[0].contentBlocks?.[0])
    expect(store.findToolUseBlock(msg.id, 'missing')).toBeNull()
  })
})

describe('chat store — permission state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setPendingPermission stores the request per-conversation', () => {
    const store = useChatStore()
    seedConversation(store)

    store.setPendingPermission({ tool: 'Write', filePath: '/a/b' })
    expect(store.pendingPermission).toEqual({ tool: 'Write', filePath: '/a/b' })
  })

  it('clearPendingPermission resets to null', () => {
    const store = useChatStore()
    seedConversation(store)

    store.setPendingPermission({ tool: 'Bash', command: 'ls' })
    store.clearPendingPermission()
    expect(store.pendingPermission).toBeNull()
  })

  it('permission state is isolated per conversation', () => {
    const store = useChatStore() as any
    seedConversation(store, { id: 'a' })
    store.conversations.push(makeConversation({ id: 'b' }))

    store.setPendingPermission({ tool: 'Write' }, 'a')
    store.setPendingPermission({ tool: 'Read' }, 'b')

    store.activeConversationId = 'a'
    expect(store.pendingPermission?.tool).toBe('Write')
    store.activeConversationId = 'b'
    expect(store.pendingPermission?.tool).toBe('Read')
  })

  it('setPendingPermission is no-op when there is no active conversation', () => {
    const store = useChatStore()
    store.setPendingPermission({ tool: 'Write' })
    expect(store.pendingPermission).toBeNull()
  })

  it('setPendingPlanApproval / clearPendingPlanApproval toggle approval state', () => {
    const store = useChatStore()
    seedConversation(store)

    store.setPendingPlanApproval({ allowedPrompts: [{ tool: 'Write', prompt: 'file.txt' }] })
    expect(store.pendingPlanApproval?.allowedPrompts).toHaveLength(1)

    store.clearPendingPlanApproval()
    expect(store.pendingPlanApproval).toBeNull()
  })
})

describe('chat store — isConversationStreaming', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns true when the conversation is in the explicit streaming set', () => {
    const store = useChatStore()
    const conv = seedConversation(store)

    store.startConversationStreaming(conv.id)
    expect(store.isConversationStreaming(conv.id)).toBe(true)

    store.endConversationStreaming(conv.id)
    expect(store.isConversationStreaming(conv.id)).toBe(false)
  })

  it('falls back to the last assistant message status when the set lost track', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    // Assistant message is mid-stream but the in-memory set was never populated
    // (e.g. observed CLI/server job, cross-tab activity, missed start call).
    store.addAssistantMessage(conv.id)

    expect(store.isConversationStreaming(conv.id)).toBe(true)
  })

  it('does not report streaming once the assistant message is finalized', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    const msg = store.addAssistantMessage(conv.id)

    store.updateMessage(msg.id, { status: 'complete' }, conv.id)
    expect(store.isConversationStreaming(conv.id)).toBe(false)
  })

  it('suppresses the streaming fallback while awaiting permission', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    store.addAssistantMessage(conv.id)
    store.setPendingPermission({ tool: 'Write', filePath: '/a/b' }, conv.id)

    // Paused for permission: message is still 'streaming' but the live
    // indicator is intentionally dropped.
    expect(store.isConversationStreaming(conv.id)).toBe(false)

    store.clearPendingPermission(conv.id)
    expect(store.isConversationStreaming(conv.id)).toBe(true)
  })

  it('suppresses the streaming fallback while awaiting plan approval', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    store.addAssistantMessage(conv.id)
    store.setPendingPlanApproval({ allowedPrompts: [{ tool: 'Write', prompt: 'x' }] }, conv.id)

    expect(store.isConversationStreaming(conv.id)).toBe(false)
  })

  it('returns false for an unknown conversation id', () => {
    const store = useChatStore()
    seedConversation(store)
    expect(store.isConversationStreaming('nope')).toBe(false)
  })
})

describe('chat store — isConversationActivelyStreaming (guard predicate)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reflects only the explicit streaming set, ignoring the message-status fallback', () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    // Last assistant message stuck at 'streaming' but the Set has no entry:
    // the display predicate reports true, the guard predicate must report false
    // so control-flow (archive, re-observe, reuse) is not wrongly suppressed.
    store.addAssistantMessage(conv.id)

    expect(store.isConversationStreaming(conv.id)).toBe(true)
    expect(store.isConversationActivelyStreaming(conv.id)).toBe(false)
  })

  it('returns true while the conversation is in the explicit streaming set', () => {
    const store = useChatStore()
    const conv = seedConversation(store)

    store.startConversationStreaming(conv.id)
    expect(store.isConversationActivelyStreaming(conv.id)).toBe(true)

    store.endConversationStreaming(conv.id)
    expect(store.isConversationActivelyStreaming(conv.id)).toBe(false)
  })

  it('allows archiving a conversation whose last message is stuck streaming but is not live', async () => {
    const store = useChatStore()
    const conv = seedConversation(store)
    store.addAssistantMessage(conv.id)

    // Guard uses the authoritative signal, so this is not blocked as "streaming".
    const result = await store.archiveConversation(conv.id)
    expect(result.error).not.toBe('Cannot archive while this conversation is streaming')
  })
})

describe('chat store — session state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('startSession initializes session with streaming status and clears lastError', () => {
    const store = useChatStore()
    seedConversation(store)

    store.setSessionError('previous failure')
    expect(store.lastError).toBe('previous failure')

    store.startSession('sess-1')
    expect(store.session?.sessionId).toBe('sess-1')
    expect(store.session?.status).toBe('streaming')
    expect(store.isStreaming).toBe(true)
    expect(store.lastError).toBeNull()
  })

  it('endSession transitions session to idle', () => {
    const store = useChatStore()
    seedConversation(store)
    store.startSession('sess-1')

    store.endSession()
    expect(store.session?.status).toBe('idle')
    expect(store.isStreaming).toBe(false)
  })

  it('setSessionStatus updates status on existing session only', () => {
    const store = useChatStore()
    seedConversation(store)

    // No session yet — setSessionStatus should be a no-op
    store.setSessionStatus('error')
    expect(store.session).toBeNull()

    store.startSession('s1')
    store.setSessionStatus('idle')
    expect(store.session?.status).toBe('idle')
  })

  it('setSessionError sets error status and lastError', () => {
    const store = useChatStore()
    seedConversation(store)
    store.startSession('s1')

    store.setSessionError('boom')
    expect(store.session?.status).toBe('error')
    expect(store.session?.error).toBe('boom')
    expect(store.lastError).toBe('boom')
  })
})

describe('chat store — conversations', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('uses the first user message as the conversation title', () => {
    const store = useChatStore()
    const conversation = seedConversation(store, { title: 'New Conversation' })

    store.addUserMessage('/implement 018-codex-provider-integration')

    expect(conversation.title).toBe('/implement 018-codex-provider-integration')
  })

  it('does not overwrite a custom conversation title from the first user message', () => {
    const store = useChatStore()
    const conversation = seedConversation(store, { title: 'spec: 031-spec-search-modal' })

    store.addUserMessage('/implement 031-spec-search-modal')

    expect(conversation.title).toBe('spec: 031-spec-search-modal')
  })

  it('updates default conversation titles regardless of casing', () => {
    const store = useChatStore()
    const conversation = seedConversation(store, { title: 'New conversation' })

    store.addUserMessage('/tasks 031-spec-search-modal')

    expect(conversation.title).toBe('/tasks 031-spec-search-modal')
  })

  it('keeps active conversations sorted by createdAt desc after archive', async () => {
    const store = useChatStore() as any
    const oldConversation = makeConversation({
      id: 'old',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const archivedConversation = makeConversation({
      id: 'archived',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    const newConversation = makeConversation({
      id: 'new',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })

    store.conversations.push(newConversation, archivedConversation, oldConversation)
    store.activeConversationId = archivedConversation.id

    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url === `/api/conversations/${archivedConversation.id}/archive`) {
        return {
          success: true,
          archived: {
            id: 'archive-1',
            sourceConversationId: archivedConversation.id,
            title: archivedConversation.title,
            messages: [],
            createdAt: archivedConversation.createdAt,
            updatedAt: archivedConversation.updatedAt,
            archivedAt: '2026-01-04T00:00:00.000Z',
            cwd: archivedConversation.cwd,
          },
          conversations: [oldConversation, newConversation],
          archivedConversations: [],
        }
      }
      return { success: true }
    }))

    await expect(store.archiveConversation(archivedConversation.id)).resolves.toEqual({ success: true })

    expect(store.conversations.map((conversation: Conversation) => conversation.id)).toEqual(['new', 'old'])
    expect(store.activeConversationId).toBe('new')
  })
})
