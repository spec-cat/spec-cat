import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testHome = vi.hoisted(() => ({ path: '' }))
const projectDir = '/tmp/spec-cat-recovery-project'

async function waitForCondition(predicate: () => Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for condition')
}

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => testHome.path,
    },
    homedir: () => testHome.path,
  }
})

vi.mock('~/server/utils/projectDir', () => ({
  getProjectDir: () => projectDir,
}))

describe('markInterruptedStreamingConversations', () => {
  beforeEach(async () => {
    testHome.path = await mkdtemp(join('/tmp', 'spec-cat-recovery-home-'))
  })

  afterEach(async () => {
    if (testHome.path) {
      await rm(testHome.path, { recursive: true, force: true })
      testHome.path = ''
    }
  })

  it('marks persisted streaming assistant turns as stopped after restart reconciliation', async () => {
    const {
      markInterruptedStreamingConversations,
      updateConversationProviderSessionInStorage,
    } = await import('~/server/utils/conversationStore')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-restart.json')

    await mkdir(conversationDir, { recursive: true })
    await writeFile(conversationPath, JSON.stringify({
      id: 'conv-restart',
      title: 'Restart test',
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          content: 'continue this',
          timestamp: '2026-06-19T00:00:00.000Z',
        },
        {
          id: 'msg-assistant',
          role: 'assistant',
          content: 'partial response',
          status: 'streaming',
          timestamp: '2026-06-19T00:00:01.000Z',
          contentBlocks: [
            { id: 'block-text', type: 'text', text: 'partial response' },
            { id: 'block-tool', type: 'tool_use', toolUseId: 'tool-1', name: 'Edit', input: {}, inputSummary: '', status: 'running' },
          ],
        },
      ],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:01.000Z',
      cwd: projectDir,
      providerId: 'codex',
      providerSessionId: 'thread-123',
    }, null, 2), 'utf-8')

    const changedCount = await markInterruptedStreamingConversations()

    expect(changedCount).toBe(1)

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    const assistant = saved.messages[1]
    expect(assistant.status).toBe('stopped')
    expect(assistant.content).toContain('server restarted')
    expect(assistant.contentBlocks.at(-1)).toMatchObject({
      type: 'text',
      text: expect.stringContaining('server restarted'),
    })
    expect(assistant.contentBlocks[1].status).toBe('error')
    expect(saved.providerSessionId).toBe('thread-123')

    await updateConversationProviderSessionInStorage('conv-restart', 'thread-456')
    const updated = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(updated.providerSessionId).toBe('thread-456')
    expect(updated.messages).toHaveLength(2)
  })

  it('does not let an older empty conversation snapshot erase persisted messages', async () => {
    const { upsertConversationInStorage } = await import('~/server/utils/conversationStore')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-race.json')

    await mkdir(conversationDir, { recursive: true })

    await upsertConversationInStorage({
      id: 'conv-race',
      title: 'hi',
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          content: 'hi',
          timestamp: '2026-06-19T00:00:01.000Z',
        },
        {
          id: 'msg-assistant',
          role: 'assistant',
          content: 'hello',
          status: 'complete',
          timestamp: '2026-06-19T00:00:02.000Z',
        },
      ],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:03.000Z',
      cwd: projectDir,
    })

    await upsertConversationInStorage({
      id: 'conv-race',
      title: 'New Conversation',
      messages: [],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.500Z',
      cwd: projectDir,
    })

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(saved.title).toBe('hi')
    expect(saved.messages).toHaveLength(2)
    expect(saved.messages[0].content).toBe('hi')
    expect(saved.messages[1].content).toBe('hello')
  })

  it('does not let a conversation snapshot without providerSessionId erase the persisted session', async () => {
    const { upsertConversationInStorage } = await import('~/server/utils/conversationStore')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-session.json')

    await mkdir(conversationDir, { recursive: true })

    await upsertConversationInStorage({
      id: 'conv-session',
      title: 'Session test',
      messages: [],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:01.000Z',
      cwd: projectDir,
      providerSessionId: 'thread-persisted',
    })

    await upsertConversationInStorage({
      id: 'conv-session',
      title: 'Session test',
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          content: 'follow up',
          timestamp: '2026-06-19T00:00:02.000Z',
        },
      ],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:02.000Z',
      cwd: projectDir,
    })

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(saved.providerSessionId).toBe('thread-persisted')
    expect(saved.messages).toHaveLength(1)
  })

  it('preserves persisted provider id and session when a snapshot blanks them', async () => {
    const { upsertConversationInStorage } = await import('~/server/utils/conversationStore')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-provider.json')

    await mkdir(conversationDir, { recursive: true })

    await upsertConversationInStorage({
      id: 'conv-provider',
      title: 'Provider test',
      messages: [],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:01.000Z',
      cwd: projectDir,
      providerId: 'codex',
      providerSessionId: 'thread-codex',
    })

    // A client snapshot that carries empty provider fields must not flip a Codex
    // conversation to the default provider or wipe its resumable session.
    await upsertConversationInStorage({
      id: 'conv-provider',
      title: 'Provider test',
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          content: 'follow up',
          timestamp: '2026-06-19T00:00:02.000Z',
        },
      ],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:02.000Z',
      cwd: projectDir,
      providerId: '',
      providerSessionId: '',
    })

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(saved.providerId).toBe('codex')
    expect(saved.providerSessionId).toBe('thread-codex')
    expect(saved.messages).toHaveLength(1)
  })

  it('does not let a full conversation list save erase persisted provider session fields', async () => {
    const { upsertConversationInStorage, writeConversationStorageState } = await import('~/server/utils/conversationStore')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-list-save.json')

    await mkdir(conversationDir, { recursive: true })

    await upsertConversationInStorage({
      id: 'conv-list-save',
      title: 'List save test',
      messages: [],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:01.000Z',
      cwd: projectDir,
      providerId: 'codex',
      providerModelKey: 'gpt-5.4',
      providerSessionId: 'thread-list-save',
    })

    await writeConversationStorageState({
      version: 2,
      conversations: [
        {
          id: 'conv-list-save',
          title: 'List save test',
          messages: [
            {
              id: 'msg-user',
              role: 'user',
              content: 'follow up',
              timestamp: '2026-06-19T00:00:02.000Z',
            },
          ],
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-19T00:00:02.000Z',
          cwd: projectDir,
        },
      ],
      archivedConversations: [],
    })

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(saved.providerId).toBe('codex')
    expect(saved.providerModelKey).toBe('gpt-5.4')
    expect(saved.providerSessionId).toBe('thread-list-save')
    expect(saved.messages).toHaveLength(1)
  })

  it('persists browser jobs into the exact assistant placeholder supplied by the client', async () => {
    const { startPersisting } = await import('~/server/utils/jobPersister')
    const { eventBus } = await import('~/server/utils/eventBus')
    const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
    const conversationDir = join(testHome.path, '.spec-cat', 'projects', projectHash, 'conversations')
    const conversationPath = join(conversationDir, 'conv-exact-message.json')

    await mkdir(conversationDir, { recursive: true })
    await writeFile(conversationPath, JSON.stringify({
      id: 'conv-exact-message',
      title: 'Exact message test',
      messages: [
        {
          id: 'msg-user-1',
          role: 'user',
          content: 'first prompt',
          timestamp: '2026-06-19T00:00:00.000Z',
        },
        {
          id: 'msg-assistant-client',
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: '2026-06-19T00:00:01.000Z',
        },
        {
          id: 'msg-user-2',
          role: 'user',
          content: 'newer prompt',
          timestamp: '2026-06-19T00:00:02.000Z',
        },
        {
          id: 'msg-assistant-newer',
          role: 'assistant',
          content: 'do not touch',
          status: 'streaming',
          timestamp: '2026-06-19T00:00:03.000Z',
        },
      ],
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:03.000Z',
      cwd: projectDir,
    }, null, 2), 'utf-8')

    startPersisting('conv-exact-message', 'first prompt', 'msg-assistant-client')
    eventBus.emit('conv-exact-message', {
      type: 'ui_event',
      event: {
        type: 'block_start',
        blockId: 'block-text',
        blockType: 'text',
        text: 'persisted response',
      },
    })
    eventBus.emit('conv-exact-message', {
      type: 'ui_event',
      event: {
        type: 'block_end',
        blockId: 'block-text',
      },
    })
    eventBus.emit('conv-exact-message', { type: 'done', requestId: 'req-1' })

    await waitForCondition(async () => {
      const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
      return saved.messages[1].status === 'complete'
    })

    const saved = JSON.parse(await readFile(conversationPath, 'utf-8'))
    expect(saved.messages[1]).toMatchObject({
      id: 'msg-assistant-client',
      content: 'persisted response',
      status: 'complete',
    })
    expect(saved.messages[3]).toMatchObject({
      id: 'msg-assistant-newer',
      content: 'do not touch',
      status: 'streaming',
    })
  })
})
