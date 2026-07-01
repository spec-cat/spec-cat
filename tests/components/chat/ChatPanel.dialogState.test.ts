// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive } from 'vue'
import ChatPanel from '~/components/chat/ChatPanel.vue'

const conversations = [
  {
    id: 'conv-1',
    title: 'Conversation 1',
    hasWorktree: true,
    finalized: false,
    worktreePath: '/tmp/worktree-1',
    worktreeBranch: 'sc/conv-1',
    baseBranch: 'main',
  },
  {
    id: 'conv-2',
    title: 'Conversation 2',
    hasWorktree: true,
    finalized: false,
    worktreePath: '/tmp/worktree-2',
    worktreeBranch: 'sc/conv-2',
    baseBranch: 'main',
  },
]

const chatStore = reactive({
  activeConversationId: 'conv-1',
  conversations,
  hasMessages: true,
  conflictState: null,
  isActiveConversationStreaming: false,
  get activeConversation() {
    return this.conversations.find(conversation => conversation.id === this.activeConversationId) ?? null
  },
  setCwd: vi.fn(),
  isConversationStreaming: vi.fn(() => false),
  deleteConversation: vi.fn(async () => {}),
  clearMessages: vi.fn(),
  finalizeConversation: vi.fn(async () => ({ success: true })),
  rebaseConversation: vi.fn(async () => ({ success: true })),
  togglePreview: vi.fn(async () => ({ success: true })),
})

vi.mock('~/stores/chat', () => ({
  useChatStore: () => chatStore,
}))

vi.mock('~/stores/layout', () => ({
  useLayoutStore: () => ({
    isChatFullscreen: false,
    toggleChatFullscreen: vi.fn(),
  }),
}))

vi.mock('~/composables/useChatStream', () => ({
  useChatStream: () => ({
    disconnectConversation: vi.fn(),
    abort: vi.fn(),
  }),
}))

const TerminalPanelStub = defineComponent({
  name: 'TerminalPanel',
  template: '<div data-testid="terminal-panel" />',
  setup() {
    return { focusTerminal: vi.fn() }
  },
})

const FinalizeConfirmStub = defineComponent({
  name: 'FinalizeConfirm',
  props: {
    conversationId: { type: String, required: true },
  },
  template: '<div data-testid="finalize-confirm">{{ conversationId }}</div>',
})

const RebaseConfirmStub = defineComponent({
  name: 'RebaseConfirm',
  template: '<div data-testid="rebase-confirm" />',
})

describe('ChatPanel conversation dialog state', () => {
  beforeEach(() => {
    chatStore.activeConversationId = 'conv-1'
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url === '/api/cwd') return { cwd: '/tmp' }
      if (url === '/api/chat/compare') return { ahead: 1, behind: 0 }
      return {}
    }))
  })

  it('keeps finalize and rebase panels scoped to each conversation', async () => {
    const wrapper = mount(ChatPanel, {
      global: {
        stubs: {
          TerminalPanel: TerminalPanelStub,
          FinalizeConfirm: FinalizeConfirmStub,
          RebaseConfirm: RebaseConfirmStub,
          ConflictResolutionModal: true,
          DeleteConfirmModal: true,
        },
      },
    })

    await nextTick()
    await wrapper.find('button[title="Finalize: squash & merge to base branch"]').trigger('click')
    expect(wrapper.find('[data-testid="finalize-confirm"]').text()).toBe('conv-1')

    chatStore.activeConversationId = 'conv-2'
    await nextTick()
    expect(wrapper.find('[data-testid="finalize-confirm"]').exists()).toBe(false)

    await wrapper.find('button[title="Rebase: sync worktree onto target base branch"]').trigger('click')
    expect(wrapper.find('[data-testid="rebase-confirm"]').exists()).toBe(true)

    chatStore.activeConversationId = 'conv-1'
    await nextTick()
    expect(wrapper.find('[data-testid="finalize-confirm"]').text()).toBe('conv-1')
    expect(wrapper.find('[data-testid="rebase-confirm"]').exists()).toBe(false)

    chatStore.activeConversationId = 'conv-2'
    await nextTick()
    expect(wrapper.find('[data-testid="finalize-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="rebase-confirm"]').exists()).toBe(true)
  })
})
