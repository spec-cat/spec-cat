<script setup lang="ts">
import type { ToolUseBlock, ToolResultBlock } from '~/types/chat'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ChevronRightIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
  block: ToolUseBlock
  result?: ToolResultBlock
}>()

const expanded = ref(false)
const resultExpanded = ref(false)

function pickString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return ''
}

function pickNumber(input: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function previewText(text: string, maxLines = 14, maxChars = 1400): { text: string, truncated: boolean } {
  if (!text) return { text: '', truncated: false }
  const lines = text.split('\n')
  let clipped = lines.slice(0, maxLines).join('\n')
  let truncated = lines.length > maxLines
  if (clipped.length > maxChars) {
    clipped = clipped.slice(0, maxChars)
    truncated = true
  }
  return { text: clipped, truncated }
}

const toolNameLower = computed(() => props.block.name.toLowerCase())
const toolNameCompact = computed(() => toolNameLower.value.replace(/[^a-z0-9]/g, ''))
const isRequestUserInputTool = computed(() => (
  toolNameCompact.value === 'requestuserinput'
  || toolNameCompact.value === 'askuserquestion'
))
const isReadTool = computed(() => toolNameLower.value === 'read')
const isWriteTool = computed(() => toolNameLower.value === 'write')
const isEditTool = computed(() => toolNameLower.value === 'edit' || toolNameLower.value === 'multiedit')
const isCommandTool = computed(() => ['bash', 'exec', 'execcommand', 'runcommand'].includes(toolNameLower.value))
const shouldAutoExpand = computed(() => (
  props.block.status === 'running'
  || props.block.status === 'error'
  || isWriteTool.value
  || isEditTool.value
  || isRequestUserInputTool.value
))

interface ClarificationOption {
  label?: string
  description?: string
}

interface ClarificationQuestion {
  header?: string
  id?: string
  question?: string
  prompt?: string
  message?: string
  options?: ClarificationOption[]
}

const clarificationQuestions = computed<ClarificationQuestion[]>(() => {
  if (!isRequestUserInputTool.value) return []
  const rawQuestions = props.block.input.questions
  if (Array.isArray(rawQuestions)) {
    return rawQuestions
      .map((item) => (item && typeof item === 'object' ? item as ClarificationQuestion : null))
      .filter((item): item is ClarificationQuestion => !!item)
  }

  // Fallback for single-question schemas
  const single: ClarificationQuestion = {
    header: pickString(props.block.input, ['header', 'title']),
    id: pickString(props.block.input, ['id']),
    question: pickString(props.block.input, ['question']),
    prompt: pickString(props.block.input, ['prompt']),
    message: pickString(props.block.input, ['message', 'text', 'description']),
    options: Array.isArray(props.block.input.options)
      ? (props.block.input.options as ClarificationOption[])
      : undefined,
  }

  if (!single.question && !single.prompt && !single.message && !single.header) return []
  return [single]
})

function previewInline(text: string, maxChars = 120): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}...` : compact
}

const clarificationSummary = computed(() => {
  const first = clarificationQuestions.value[0]
  if (!first) return ''
  return previewInline(first.question || first.prompt || first.message || first.header || '')
})

const targetPath = computed(() => pickString(props.block.input, [
  'file_path',
  'path',
  'file',
  'filepath',
  'target_file',
]))

const readRange = computed(() => {
  const offset = pickNumber(props.block.input, ['offset', 'start_line', 'line'])
  const limit = pickNumber(props.block.input, ['limit', 'lines', 'line_count'])
  const end = pickNumber(props.block.input, ['end_line'])
  if (offset !== null && limit !== null) return `from line ${offset}, ${limit} lines`
  if (offset !== null && end !== null) return `lines ${offset}-${end}`
  if (offset !== null) return `from line ${offset}`
  if (limit !== null) return `${limit} lines`
  return ''
})

const writeContent = computed(() => pickString(props.block.input, [
  'content',
  'text',
  'new_content',
]))

const editOldText = computed(() => pickString(props.block.input, [
  'old_string',
  'oldText',
  'old',
]))

const editNewText = computed(() => pickString(props.block.input, [
  'new_string',
  'newText',
  'new',
  'replacement',
]))
const commandText = computed(() => pickString(props.block.input, [
  'cmd',
  'command',
  'script',
  'chars',
]))

const writePreview = computed(() => previewText(writeContent.value))
const editOldPreview = computed(() => previewText(editOldText.value, 10, 1000))
const editNewPreview = computed(() => previewText(editNewText.value, 10, 1000))

const humanSummary = computed(() => {
  if (isRequestUserInputTool.value) {
    return clarificationSummary.value || 'Prompting user for clarification'
  }
  if (isReadTool.value) {
    if (targetPath.value && readRange.value) return `Read ${targetPath.value} (${readRange.value})`
    if (targetPath.value) return `Read ${targetPath.value}`
  }
  if (isWriteTool.value) {
    if (targetPath.value) return `Write ${targetPath.value}`
  }
  if (isEditTool.value) {
    if (targetPath.value) return `Edit ${targetPath.value}`
  }
  if (isCommandTool.value && commandText.value) {
    return `$ ${commandText.value}`
  }
  return props.block.inputSummary
})

const statusToken = computed(() => {
  switch (props.block.status) {
    case 'running': return '[RUN]'
    case 'pending': return '[WAIT]'
    case 'complete': return '[OK]'
    case 'error': return '[ERR]'
  }
})

const compactArgs = computed(() => {
  const entries = Object.entries(props.block.input)
    .filter(([key, value]) => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string') {
        if (!value.trim()) return false
        if (value.length > 90) return false
      }
      return !['content', 'new_content', 'text', 'old_string', 'new_string'].includes(key)
    })
    .slice(0, 6)

  return entries.map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value)}`)
})

const statusColor = computed(() => {
  switch (props.block.status) {
    case 'running': return 'text-retro-yellow'
    case 'pending': return 'text-retro-muted'
    case 'complete': return 'text-retro-green'
    case 'error': return 'text-retro-red'
  }
})

const resultContent = computed(() => props.result?.content ?? '')
const resultIsError = computed(() => props.result?.isError ?? false)
const resultLength = computed(() => resultContent.value.length)
const resultLines = computed(() => resultContent.value.split('\n'))
const visibleResultLines = computed(() => resultExpanded.value ? resultLines.value : resultLines.value.slice(0, 6))

const resultLooksLikeDiff = computed(() => {
  if (!resultContent.value) return false
  const hasDiffMarkers = /^diff --git\s|\+\+\+\s|---\s|@@\s/m.test(resultContent.value)
  if (!hasDiffMarkers) return false
  return /^[+\- ]/.test(resultLines.value.find(line => line.length > 0) || '')
    || resultLines.value.some(line => line.startsWith('@@'))
})

const diffStats = computed(() => {
  if (!resultLooksLikeDiff.value) return { added: 0, removed: 0 }
  let added = 0
  let removed = 0
  for (const line of resultLines.value) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) added += 1
    if (line.startsWith('-')) removed += 1
  }
  return { added, removed }
})

const resultPreview = computed(() => {
  if (!resultContent.value) return ''
  const lines = resultContent.value.split('\n').slice(0, 3)
  return lines.join('\n')
})

const isLongResult = computed(() => {
  if (!resultContent.value) return false
  return resultLines.value.length > 6 || resultContent.value.length > 320
})

const hasVisibleResult = computed(() => {
  return resultContent.value.trim().length > 0
})

function resultLineClass(line: string): string {
  if (line.startsWith('@@')) return 'text-retro-cyan bg-retro-cyan/10'
  if (line.startsWith('+') && !line.startsWith('+++')) return 'text-retro-green bg-retro-green/10'
  if (line.startsWith('-') && !line.startsWith('---')) return 'text-retro-red bg-retro-red/10'
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
    return 'text-retro-yellow'
  }
  return 'text-retro-muted'
}

watch(
  () => props.block.id,
  () => {
    expanded.value = shouldAutoExpand.value
    resultExpanded.value = false
  },
  { immediate: true }
)

watch(
  () => props.block.status,
  (status) => {
    if (status === 'running' || status === 'error') expanded.value = true
  }
)
</script>

<template>
  <div class="my-2 border border-retro-border/40 rounded bg-retro-dark/30">
    <!-- Header row -->
    <button
      class="flex items-center gap-2 w-full px-3 py-2 text-xs font-mono hover:bg-retro-dark/40 transition-colors text-left"
      @click="expanded = !expanded"
    >
      <!-- Status indicator -->
      <span
        v-if="block.status === 'running'"
        class="w-3 h-3 border-2 border-retro-yellow border-t-transparent rounded-full animate-spin flex-shrink-0"
      />
      <ClockIcon
        v-else-if="block.status === 'pending'"
        class="w-3.5 h-3.5 flex-shrink-0 text-retro-muted animate-pulse"
      />
      <CheckCircleIcon
        v-else-if="block.status === 'complete'"
        class="w-3.5 h-3.5 flex-shrink-0"
        :class="statusColor"
      />
      <ExclamationCircleIcon
        v-else
        class="w-3.5 h-3.5 flex-shrink-0"
        :class="statusColor"
      />

      <span class="text-retro-muted">{{ statusToken }}</span>
      <span class="text-retro-cyan font-bold">{{ block.name }}</span>

      <!-- Input summary -->
      <span class="text-retro-muted truncate">{{ humanSummary || block.inputSummary }}</span>

      <!-- Expand chevron -->
      <ChevronRightIcon
        class="w-3 h-3 ml-auto transition-transform text-retro-muted flex-shrink-0"
        :class="{ 'rotate-90': expanded }"
      />
    </button>

    <!-- Expanded: CLI-like details + raw JSON -->
    <div v-if="expanded" class="px-3 pb-2 border-t border-retro-border/20">
      <div v-if="compactArgs.length > 0" class="mt-2">
        <div class="text-[11px] font-mono text-retro-cyan mb-1">Args</div>
        <pre class="text-xs font-mono text-retro-muted bg-retro-panel p-2 rounded overflow-x-auto max-h-36 overflow-y-auto scrollbar-custom whitespace-pre-wrap">{{ compactArgs.join('\n') }}</pre>
      </div>

      <div class="text-xs font-mono text-retro-muted space-y-2 mt-2">
        <div v-if="targetPath" class="flex items-start gap-2">
          <span class="text-retro-muted/80 min-w-12">File</span>
          <code class="text-retro-cyan break-all">{{ targetPath }}</code>
        </div>
        <div v-if="isCommandTool && commandText" class="flex items-start gap-2">
          <span class="text-retro-muted/80 min-w-12">Cmd</span>
          <code class="text-retro-cyan break-all whitespace-pre-wrap">{{ commandText }}</code>
        </div>
        <div v-if="isReadTool && readRange" class="flex items-start gap-2">
          <span class="text-retro-muted/80 min-w-12">Range</span>
          <span>{{ readRange }}</span>
        </div>
      </div>

      <div v-if="isWriteTool && writePreview.text" class="mt-2">
        <div class="text-[11px] font-mono text-retro-cyan mb-1">New Content</div>
        <pre class="text-xs font-mono text-retro-muted bg-retro-panel p-2 rounded overflow-x-auto max-h-52 overflow-y-auto scrollbar-custom whitespace-pre-wrap">{{ writePreview.text }}</pre>
        <div v-if="writePreview.truncated" class="text-[10px] text-retro-muted mt-1">Truncated preview</div>
      </div>

      <div v-if="isEditTool && editOldPreview.text" class="mt-2">
        <div class="text-[11px] font-mono text-retro-yellow mb-1">Before</div>
        <pre class="text-xs font-mono text-retro-muted bg-retro-panel p-2 rounded overflow-x-auto max-h-40 overflow-y-auto scrollbar-custom whitespace-pre-wrap">{{ editOldPreview.text }}</pre>
        <div v-if="editOldPreview.truncated" class="text-[10px] text-retro-muted mt-1">Truncated preview</div>
      </div>

      <div v-if="isEditTool && editNewPreview.text" class="mt-2">
        <div class="text-[11px] font-mono text-retro-green mb-1">After</div>
        <pre class="text-xs font-mono text-retro-muted bg-retro-panel p-2 rounded overflow-x-auto max-h-40 overflow-y-auto scrollbar-custom whitespace-pre-wrap">{{ editNewPreview.text }}</pre>
        <div v-if="editNewPreview.truncated" class="text-[10px] text-retro-muted mt-1">Truncated preview</div>
      </div>

      <details class="mt-2">
        <summary class="text-[11px] font-mono text-retro-muted cursor-pointer hover:text-retro-cyan">Raw input JSON</summary>
        <pre class="text-xs font-mono text-retro-muted bg-retro-panel p-2 rounded mt-1 overflow-x-auto max-h-40 overflow-y-auto scrollbar-custom">{{ JSON.stringify(block.input, null, 2) }}</pre>
      </details>

      <div v-if="isRequestUserInputTool && clarificationQuestions.length > 0" class="mt-3">
        <div class="text-[11px] font-mono text-retro-cyan mb-1">Clarification Prompt</div>
        <div class="space-y-2">
          <div
            v-for="(q, index) in clarificationQuestions"
            :key="`${q.id || 'q'}-${index}`"
            class="rounded border border-retro-border/30 bg-retro-panel/40 p-2"
          >
            <div v-if="q.header" class="text-[11px] font-mono text-retro-yellow mb-1">{{ q.header }}</div>
            <div v-if="q.question || q.prompt || q.message" class="text-xs font-mono text-retro-text whitespace-pre-wrap">{{ q.question || q.prompt || q.message }}</div>
            <div v-if="Array.isArray(q.options) && q.options.length > 0" class="mt-2 space-y-1">
              <div
                v-for="(opt, optIndex) in q.options"
                :key="`${q.id || 'q'}-opt-${optIndex}`"
                class="text-xs font-mono text-retro-muted"
              >
                {{ opt.label || `Option ${optIndex + 1}` }}
                <span v-if="opt.description" class="text-retro-muted/80"> - {{ opt.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool result (CLI output style) -->
    <div v-if="hasVisibleResult" class="px-3 pb-2 border-t border-retro-border/20">
      <div
        class="text-xs font-mono rounded p-2 mt-1 overflow-y-auto scrollbar-custom border"
        :class="resultIsError ? 'text-retro-red bg-retro-red/5 border-retro-red/40' : 'text-retro-muted bg-retro-panel/60 border-retro-border/30'"
        :style="resultExpanded ? 'max-height: 20rem' : ''"
      >
        <template v-if="resultLooksLikeDiff">
          <div class="mb-1 text-[10px] text-retro-muted">
            Diff · <span class="text-retro-green">+{{ diffStats.added }}</span> / <span class="text-retro-red">-{{ diffStats.removed }}</span>
          </div>
          <div class="space-y-0.5">
            <div
              v-for="(line, index) in visibleResultLines"
              :key="`diff-${index}`"
              class="px-1 rounded whitespace-pre-wrap break-all"
              :class="resultLineClass(line)"
            >
              {{ line || ' ' }}
            </div>
          </div>
          <button
            v-if="!resultExpanded && isLongResult"
            class="text-retro-cyan hover:underline mt-1 text-[10px]"
            @click.stop="resultExpanded = true"
          >
            Show full diff ({{ resultLength }} chars)
          </button>
          <button
            v-else-if="isLongResult"
            class="text-retro-cyan hover:underline mt-1 text-[10px]"
            @click.stop="resultExpanded = false"
          >
            Collapse diff
          </button>
        </template>
        <template v-else-if="!resultExpanded && isLongResult">
          <pre class="whitespace-pre-wrap">{{ resultPreview }}</pre>
          <button
            class="text-retro-cyan hover:underline mt-1 text-[10px]"
            @click.stop="resultExpanded = true"
          >
            Show full ({{ resultLength }} chars)
          </button>
        </template>
        <template v-else>
          <pre class="whitespace-pre-wrap">{{ resultContent }}</pre>
          <button
            v-if="isLongResult"
            class="text-retro-cyan hover:underline mt-1 text-[10px]"
            @click.stop="resultExpanded = false"
          >
            Collapse
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
