<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline'
import ConversationItem from '~/components/chat/ConversationItem.vue'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatSessionInit from '~/components/chat/ChatSessionInit.vue'
import ChatTextBlock from '~/components/chat/ChatTextBlock.vue'
import ChatThinkingBlock from '~/components/chat/ChatThinkingBlock.vue'
import ChatToolBlock from '~/components/chat/ChatToolBlock.vue'
import ChatResultSummary from '~/components/chat/ChatResultSummary.vue'
import type {
  Conversation,
  ChatMessage as ChatMessageType,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ResultSummaryBlock,
  SessionInitBlock,
} from '~/types/chat'
import { useTheme } from '~/composables/useTheme'
import { useSettingsStore } from '~/stores/settings'

definePageMeta({ layout: false })

const { isDark, toggleTheme } = useTheme()
const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.hydrate()
})

const mockMessages: ChatMessageType[] = [
  { id: 'm1', role: 'user', content: 'Design System Validation Message', timestamp: new Date().toISOString() }
]

// ===== Chat Component Sample Data =====

// Session Init block
const sampleSessionInit: SessionInitBlock = {
  id: 'blk-session-1',
  type: 'session_init',
  model: 'claude-sonnet-4-6',
  tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent'],
  permissionMode: 'auto',
  cwd: '/Users/red/src/brick',
}

// Text blocks
const sampleTextShort: TextBlock = {
  id: 'blk-text-1',
  type: 'text',
  text: 'Here is a simple text response from the assistant.',
}

const sampleTextMarkdown: TextBlock = {
  id: 'blk-text-2',
  type: 'text',
  text: `## Markdown Rendering

This block demonstrates **bold**, *italic*, \`inline code\`, and:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

- List item one
- List item two
- List item three`,
}

// Thinking blocks
const sampleThinkingShort: ThinkingBlock = {
  id: 'blk-think-1',
  type: 'thinking',
  thinking: 'Let me check the file structure first.',
}

const sampleThinkingLong: ThinkingBlock = {
  id: 'blk-think-2',
  type: 'thinking',
  thinking: `I need to analyze the component architecture here. The user wants to add a design guide section for chat components. Let me look at the existing design-guide.vue to understand the current structure, then examine each chat component to understand their props and rendering logic. I should create sample data that covers all content block types: text, thinking, tool_use, tool_result, result_summary, and session_init. Each sample should demonstrate the component in a realistic state.

For tool blocks specifically, I need to cover:
- Read tool with file path
- Write tool with content preview
- Edit tool with before/after
- Command (bash) tool with command string
- Various statuses: running, pending, complete, error`,
}

// Tool Use blocks — various tool types and statuses
const sampleToolRead: ToolUseBlock = {
  id: 'blk-tool-read',
  type: 'tool_use',
  toolUseId: 'tu-read-1',
  name: 'read',
  input: { file_path: '/Users/red/src/brick/pages/design-guide.vue', offset: 1, limit: 50 },
  inputSummary: 'Read design-guide.vue (lines 1-50)',
  status: 'complete',
}

const sampleToolReadResult: ToolResultBlock = {
  id: 'blk-tr-read',
  type: 'tool_result',
  toolUseId: 'tu-read-1',
  content: 'import { computed } from \'vue\'\n\nconst items = computed(() => [\n  { id: 1, name: \'alpha\' },\n  { id: 2, name: \'beta\' },\n])\n\n// ... 42 more lines ...',
  isError: false,
}

const sampleToolWrite: ToolUseBlock = {
  id: 'blk-tool-write',
  type: 'tool_use',
  toolUseId: 'tu-write-1',
  name: 'write',
  input: { file_path: '/Users/red/src/brick/utils/helpers.ts', content: 'export function formatDuration(ms: number): string {\n  const s = Math.floor(ms / 1000)\n  const m = Math.floor(s / 60)\n  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`\n}' },
  inputSummary: 'Write utils/helpers.ts',
  status: 'complete',
}

const sampleToolWriteResult: ToolResultBlock = {
  id: 'blk-tr-write',
  type: 'tool_result',
  toolUseId: 'tu-write-1',
  content: 'File written successfully.',
  isError: false,
}

const sampleToolEdit: ToolUseBlock = {
  id: 'blk-tool-edit',
  type: 'tool_use',
  toolUseId: 'tu-edit-1',
  name: 'edit',
  input: { file_path: '/Users/red/src/brick/components/chat/ChatMessage.vue', old_string: 'text-retro-green', new_string: 'text-retro-cyan' },
  inputSummary: 'Edit ChatMessage.vue',
  status: 'complete',
}

const sampleToolEditResult: ToolResultBlock = {
  id: 'blk-tr-edit',
  type: 'tool_result',
  toolUseId: 'tu-edit-1',
  content: '--- a/components/chat/ChatMessage.vue\n+++ b/components/chat/ChatMessage.vue\n@@ -12,7 +12,7 @@\n-        class="text-retro-green"\n+        class="text-retro-cyan"',
  isError: false,
}

const sampleToolBash: ToolUseBlock = {
  id: 'blk-tool-bash',
  type: 'tool_use',
  toolUseId: 'tu-bash-1',
  name: 'bash',
  input: { command: 'pnpm typecheck' },
  inputSummary: '$ pnpm typecheck',
  status: 'complete',
}

const sampleToolBashResult: ToolResultBlock = {
  id: 'blk-tr-bash',
  type: 'tool_result',
  toolUseId: 'tu-bash-1',
  content: '$ pnpm typecheck\n\n> brick@0.3.0 typecheck\n> nuxt typecheck\n\n✔ No type errors found',
  isError: false,
}

const sampleToolRunning: ToolUseBlock = {
  id: 'blk-tool-running',
  type: 'tool_use',
  toolUseId: 'tu-run-1',
  name: 'bash',
  input: { command: 'pnpm test' },
  inputSummary: '$ pnpm test',
  status: 'running',
}

const sampleToolPending: ToolUseBlock = {
  id: 'blk-tool-pending',
  type: 'tool_use',
  toolUseId: 'tu-pend-1',
  name: 'write',
  input: { file_path: '/Users/red/src/brick/server/api/deploy.ts', content: '// deploy logic' },
  inputSummary: 'Write server/api/deploy.ts',
  status: 'pending',
}

const sampleToolError: ToolUseBlock = {
  id: 'blk-tool-error',
  type: 'tool_use',
  toolUseId: 'tu-err-1',
  name: 'bash',
  input: { command: 'git push origin main' },
  inputSummary: '$ git push origin main',
  status: 'error',
}

const sampleToolErrorResult: ToolResultBlock = {
  id: 'blk-tr-err',
  type: 'tool_result',
  toolUseId: 'tu-err-1',
  content: 'Error: Permission denied. Authentication failed for remote.',
  isError: true,
}

// Result Summary block
const sampleResultSummary: ResultSummaryBlock = {
  id: 'blk-summary-1',
  type: 'result_summary',
  totalCostUsd: 0.0342,
  durationMs: 45200,
  numTurns: 3,
  usage: {
    inputTokens: 12450,
    outputTokens: 3280,
    cacheCreationInputTokens: 8000,
    cacheReadInputTokens: 4200,
  },
}

// Active tab
const activeTab = ref<'conversation' | 'message' | 'blocks'>('conversation')
const tabs = [
  { key: 'conversation' as const, label: 'ConversationItem' },
  { key: 'message' as const, label: 'ChatMessage' },
  { key: 'blocks' as const, label: 'Content Blocks' },
]

// Full assistant messages with various statuses
const sampleUserMessage: ChatMessageType = {
  id: 'msg-user-1',
  role: 'user',
  content: 'Can you read the design guide file and fix the color from green to cyan?',
  timestamp: new Date().toISOString(),
}

const sampleUserMessageWithImages: ChatMessageType = {
  id: 'msg-user-img',
  role: 'user',
  content: 'Here is a screenshot of the current UI. Please fix the layout issue.',
  timestamp: new Date().toISOString(),
  attachments: [
    { id: 'att-1', name: 'screenshot.png', mimeType: 'image/png', size: 245000, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==' },
  ],
}

const sampleAssistantComplete: ChatMessageType = {
  id: 'msg-asst-1',
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
  status: 'complete',
  contentBlocks: [
    sampleSessionInit,
    sampleThinkingShort,
    sampleTextShort,
    sampleToolRead,
    sampleToolEdit,
    sampleTextMarkdown,
    sampleResultSummary,
  ],
}

const sampleAssistantStreaming: ChatMessageType = {
  id: 'msg-asst-stream',
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
  status: 'streaming',
  contentBlocks: [
    sampleThinkingLong,
    { ...sampleTextShort, id: 'blk-text-stream', text: 'I am currently analyzing the codebase to find the relevant files...' } as TextBlock,
  ],
}

const sampleAssistantError: ChatMessageType = {
  id: 'msg-asst-err',
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
  status: 'error',
  contentBlocks: [
    { ...sampleTextShort, id: 'blk-text-err', text: 'I encountered an error while processing your request.' } as TextBlock,
  ],
}

const sampleAssistantStopped: ChatMessageType = {
  id: 'msg-asst-stop',
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
  status: 'stopped',
  contentBlocks: [
    { ...sampleTextShort, id: 'blk-text-stop', text: 'I was working on the refactor when the operation was' } as TextBlock,
  ],
}

const combinations = computed(() => {
  const results = []
  for (const active of [true, false]) {
    results.push({
      id: `finalized-${active}`,
      label: `Finalized | ${active ? 'Active' : 'Inactive'}`,
      state: { isActive: active, isFinalized: true, isPreviewing: false, isStreaming: false },
      conversation: {
        id: `c-f-${active}`,
        title: `Finalized Case (${active ? 'Active' : 'Idle'})`,
        messages: mockMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cwd: '/repo',
        finalized: true
      } as Conversation
    })
  }
  for (const active of [true, false]) {
    for (const preview of [true, false]) {
      for (const stream of [true, false]) {
        results.push({
          id: `normal-${active}-${preview}-${stream}`,
          label: `${active ? 'Active' : 'Idle'} | ${preview ? 'Preview' : 'Normal'} | ${stream ? 'Streaming' : 'Static'}`,
          state: { isActive: active, isFinalized: false, isPreviewing: preview, isStreaming: stream },
          conversation: {
            id: `c-n-${active}-${preview}-${stream}`,
            title: `${preview ? 'Preview' : 'Normal'} (${active ? 'Active' : 'Idle'})`,
            messages: mockMessages,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cwd: '/repo',
            finalized: false,
            worktreeBranch: preview ? 'feature/ui-fix' : undefined,
            hasWorktree: preview
          } as Conversation
        })
      }
    }
  }
  return results
})
</script>

<template>
  <div class="h-screen flex flex-col bg-retro-black text-retro-text font-mono overflow-hidden">
    <!-- Header -->
    <header class="h-14 shrink-0 border-b border-retro-border bg-retro-panel/50 px-8 flex items-center justify-between">
      <h1 class="text-lg font-bold text-retro-cyan uppercase tracking-widest">Design Guide</h1>
      <button @click="toggleTheme" class="p-2 rounded border border-retro-border hover:border-retro-cyan transition-colors bg-retro-black">
        <SunIcon v-if="isDark" class="w-5 h-5 text-retro-yellow" />
        <MoonIcon v-else class="w-5 h-5 text-retro-cyan" />
      </button>
    </header>

    <!-- Tab bar -->
    <nav class="shrink-0 flex border-b border-retro-border bg-retro-panel/30">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-6 py-2.5 text-xs font-bold uppercase tracking-widest border-r border-retro-border transition-colors"
        :class="activeTab === tab.key
          ? 'text-retro-cyan bg-retro-black border-b-2 border-b-retro-cyan'
          : 'text-retro-muted hover:text-retro-text hover:bg-retro-panel/50'"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Tab content -->
    <div class="flex-1 min-h-0 overflow-y-auto">

      <!-- ===== Tab: ConversationItem ===== -->
      <section v-if="activeTab === 'conversation'" class="p-8">
        <div class="grid grid-cols-2 gap-4">
          <div v-for="item in combinations" :key="item.id" class="space-y-1.5 p-3 border border-retro-border rounded-lg">
            <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">
              {{ item.label }}
            </span>
            <ConversationItem
              :conversation="item.conversation"
              :is-active="item.state.isActive"
              :is-streaming="item.state.isStreaming"
              :is-previewing="item.state.isPreviewing"
            />
          </div>
        </div>
      </section>

      <!-- ===== Tab: ChatMessage ===== -->
      <section v-else-if="activeTab === 'message'" class="p-8 space-y-6 max-w-2xl mx-auto">
        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">User Message</span>
          <ChatMessage :message="sampleUserMessage" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">User Message + Image Attachment</span>
          <ChatMessage :message="sampleUserMessageWithImages" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">Assistant | Complete</span>
          <ChatMessage :message="sampleAssistantComplete" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">Assistant | Streaming</span>
          <ChatMessage :message="sampleAssistantStreaming" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">Assistant | Error</span>
          <ChatMessage :message="sampleAssistantError" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">Assistant | Stopped</span>
          <ChatMessage :message="sampleAssistantStopped" />
        </div>
      </section>

      <!-- ===== Tab: Content Blocks ===== -->
      <section v-else-if="activeTab === 'blocks'" class="p-8 space-y-8 max-w-2xl mx-auto">
        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">SessionInit</span>
          <ChatSessionInit :block="sampleSessionInit" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">TextBlock | Short</span>
          <ChatTextBlock :block="sampleTextShort" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">TextBlock | Markdown</span>
          <ChatTextBlock :block="sampleTextMarkdown" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ThinkingBlock | Short (auto-expanded)</span>
          <ChatThinkingBlock :block="sampleThinkingShort" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ThinkingBlock | Long (collapsed)</span>
          <ChatThinkingBlock :block="sampleThinkingLong" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Read [OK]</span>
          <ChatToolBlock :block="sampleToolRead" :result="sampleToolReadResult" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Write [OK]</span>
          <ChatToolBlock :block="sampleToolWrite" :result="sampleToolWriteResult" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Edit [OK] + Diff</span>
          <ChatToolBlock :block="sampleToolEdit" :result="sampleToolEditResult" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Bash [OK]</span>
          <ChatToolBlock :block="sampleToolBash" :result="sampleToolBashResult" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Bash [RUN]</span>
          <ChatToolBlock :block="sampleToolRunning" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Write [WAIT]</span>
          <ChatToolBlock :block="sampleToolPending" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ToolBlock | Bash [ERR]</span>
          <ChatToolBlock :block="sampleToolError" :result="sampleToolErrorResult" />
        </div>

        <div class="space-y-2">
          <span class="px-2 py-0.5 bg-retro-panel border border-retro-border text-[10px] text-retro-muted font-bold rounded uppercase tracking-tight">ResultSummary</span>
          <ChatResultSummary :block="sampleResultSummary" />
        </div>
      </section>
    </div>
  </div>
</template>
