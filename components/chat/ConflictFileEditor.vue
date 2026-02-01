<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { SparklesIcon, PencilSquareIcon, EyeIcon } from '@heroicons/vue/24/outline'
import type { ConflictFile } from '~/types/chat'

const props = defineProps<{
  file: ConflictFile
  resolved: boolean
  aiResolving?: boolean
}>()

const emit = defineEmits<{
  resolve: [filePath: string, content: string]
  aiResolve: [filePath: string]
}>()

const editedContent = ref(props.file.content)
const isEditMode = ref(false)
const highlightedHtml = ref('')
const isHighlighting = ref(false)

watch(() => props.file.path, () => {
  editedContent.value = props.file.content
  isEditMode.value = false
  highlightContent()
})

watch(() => props.file.content, () => {
  if (!isEditMode.value) {
    editedContent.value = props.file.content
    highlightContent()
  }
})

const CONFLICT_REGEX = /^<{7}\s.*\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7}\s.*\n/gm
const CONFLICT_BLOCK_REGEX = /^<{7}[^\n]*\n([\s\S]*?)^={7}[^\n]*\n([\s\S]*?)^>{7}[^\n]*\n?/gm

const hasConflictMarkers = computed(() => {
  return /^<{7}\s/m.test(editedContent.value)
})
const conflictBlockCount = computed(() => getConflictBlocks(editedContent.value).length)

type ConflictAction = 'ours' | 'theirs' | 'both'

interface ConflictBlockMatch {
  index: number
  start: number
  end: number
  ours: string
  theirs: string
}

/** Detect language from file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    vue: 'vue', html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', swift: 'swift', sh: 'bash', zsh: 'bash',
    sql: 'sql', graphql: 'graphql', xml: 'xml', svg: 'xml',
    toml: 'toml', ini: 'ini', dockerfile: 'dockerfile',
  }
  return langMap[ext] || 'text'
}

/** Generate syntax-highlighted HTML with conflict section coloring */
async function highlightContent() {
  isHighlighting.value = true
  try {
    const { codeToHtml } = await import('shiki')
    const lang = detectLanguage(props.file.path)
    const content = editedContent.value

    // Split content into lines for processing
    const lines = content.split('\n')
    let lineHtml = ''
    let inOurs = false
    let inTheirs = false
    let lineNum = 0
    let conflictBlockIndex = -1

    for (const line of lines) {
      lineNum++
      const isConflictStart = /^<{7}\s/.test(line)
      const isSeparator = /^={7}$/.test(line)
      const isConflictEnd = /^>{7}\s/.test(line)

      if (isConflictStart) {
        conflictBlockIndex++
        inOurs = true
        inTheirs = false
        lineHtml += `<div class="conflict-line conflict-marker-line" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content conflict-marker">${escapeHtml(line)}</span></div>\n`
        if (!props.resolved) {
          lineHtml += getInlineConflictActionsHtml(conflictBlockIndex)
        }
        continue
      }
      if (isSeparator && inOurs) {
        inOurs = false
        inTheirs = true
        lineHtml += `<div class="conflict-line conflict-marker-line" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content conflict-marker">${escapeHtml(line)}</span></div>\n`
        continue
      }
      if (isConflictEnd) {
        inTheirs = false
        lineHtml += `<div class="conflict-line conflict-marker-line" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content conflict-marker">${escapeHtml(line)}</span></div>\n`
        continue
      }

      // Highlight individual line with shiki
      let highlighted = escapeHtml(line)
      try {
        const html = await codeToHtml(line || ' ', {
          lang,
          theme: 'vitesse-dark',
        })
        // Extract the inner tokens from shiki output
        const match = html.match(/<code[^>]*><span class="line">(.*?)<\/span><\/code>/s)
        if (match) {
          highlighted = match[1]
        }
      } catch {
        // fallback to escaped HTML
      }

      let sectionClass = ''
      if (inOurs) sectionClass = 'conflict-ours'
      else if (inTheirs) sectionClass = 'conflict-theirs'

      lineHtml += `<div class="conflict-line ${sectionClass}" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content">${highlighted}</span></div>\n`
    }

    highlightedHtml.value = lineHtml
  } catch {
    // Fallback: plain text with line numbers
    const lines = editedContent.value.split('\n')
    highlightedHtml.value = lines.map((line, i) => {
      const num = i + 1
      return `<div class="conflict-line" data-line="${num}"><span class="line-number">${num}</span><span class="line-content">${escapeHtml(line)}</span></div>`
    }).join('\n')
  } finally {
    isHighlighting.value = false
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function acceptOurs() {
  applyConflictAction('ours')
}

function acceptTheirs() {
  applyConflictAction('theirs')
}

function getConflictBlocks(content: string): ConflictBlockMatch[] {
  const blocks: ConflictBlockMatch[] = []
  const regex = new RegExp(CONFLICT_BLOCK_REGEX.source, CONFLICT_BLOCK_REGEX.flags)
  let match: RegExpExecArray | null = null
  let index = 0

  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      index,
      start: match.index,
      end: regex.lastIndex,
      ours: match[1] ?? '',
      theirs: match[2] ?? '',
    })
    index++
  }

  return blocks
}

function resolveBothSections(ours: string, theirs: string): string {
  if (!ours) return theirs
  if (!theirs) return ours
  if (ours.endsWith('\n') || theirs.startsWith('\n')) return `${ours}${theirs}`
  return `${ours}\n${theirs}`
}

function applyConflictAction(action: ConflictAction, blockIndex?: number) {
  const content = editedContent.value
  const blocks = getConflictBlocks(content)
  if (!blocks.length) return

  if (typeof blockIndex === 'number') {
    const block = blocks.find(b => b.index === blockIndex)
    if (!block) return
    const replacement = action === 'ours'
      ? block.ours
      : action === 'theirs'
        ? block.theirs
        : resolveBothSections(block.ours, block.theirs)
    editedContent.value = content.slice(0, block.start) + replacement + content.slice(block.end)
  } else {
    editedContent.value = content.replace(CONFLICT_REGEX, (_, ours: string, theirs: string) => {
      if (action === 'ours') return ours
      if (action === 'theirs') return theirs
      return resolveBothSections(ours, theirs)
    })
  }

  highlightContent()
}

function getInlineConflictActionsHtml(blockIndex: number): string {
  return `<div class="conflict-inline-actions" data-conflict-controls="${blockIndex}">
    <button type="button" class="conflict-inline-button conflict-inline-button-ours" data-conflict-index="${blockIndex}" data-conflict-action="ours">Accept Ours</button>
    <button type="button" class="conflict-inline-button conflict-inline-button-theirs" data-conflict-index="${blockIndex}" data-conflict-action="theirs">Accept Theirs</button>
    <button type="button" class="conflict-inline-button conflict-inline-button-both" data-conflict-index="${blockIndex}" data-conflict-action="both">Accept Both</button>
  </div>\n`
}

function onHighlightedClick(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-conflict-action]')
  if (!target || props.resolved) return

  const action = target.dataset.conflictAction as ConflictAction | undefined
  const blockIndexRaw = target.dataset.conflictIndex
  if (!action || blockIndexRaw === undefined) return

  const blockIndex = Number.parseInt(blockIndexRaw, 10)
  if (Number.isNaN(blockIndex)) return

  applyConflictAction(action, blockIndex)
}

function markResolved() {
  if (hasConflictMarkers.value) return
  emit('resolve', props.file.path, editedContent.value)
}

function handleAiResolve() {
  emit('aiResolve', props.file.path)
}

function toggleEditMode() {
  isEditMode.value = !isEditMode.value
  if (!isEditMode.value) {
    highlightContent()
  }
}

function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  editedContent.value = target.value
}

onMounted(() => {
  highlightContent()
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- File header -->
    <div class="flex-shrink-0 px-4 py-2 border-b border-retro-border flex items-center justify-between bg-retro-dark">
      <span class="text-xs font-mono text-retro-text truncate">{{ file.path }}</span>
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- View/Edit toggle -->
        <button
          v-if="!resolved"
          type="button"
          class="px-2 py-0.5 text-xs font-mono rounded border transition-colors"
          :class="isEditMode
            ? 'border-retro-yellow/50 text-retro-yellow hover:bg-retro-yellow/10'
            : 'border-retro-subtle/50 text-retro-muted hover:bg-retro-subtle/10'"
          :title="isEditMode ? 'Switch to highlighted view' : 'Switch to edit mode'"
          @click="toggleEditMode"
        >
          <EyeIcon v-if="isEditMode" class="w-3.5 h-3.5 inline-block" />
          <PencilSquareIcon v-else class="w-3.5 h-3.5 inline-block" />
        </button>
        <!-- AI Resolve -->
        <button
          v-if="!resolved && hasConflictMarkers"
          type="button"
          :disabled="aiResolving"
          class="flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border border-retro-orange/50 text-retro-orange hover:bg-retro-orange/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="handleAiResolve"
        >
          <SparklesIcon class="w-3.5 h-3.5" />
          {{ aiResolving ? 'Resolving...' : 'AI Resolve' }}
        </button>
        <button
          v-if="!resolved && hasConflictMarkers"
          type="button"
          class="px-2 py-0.5 text-xs font-mono rounded border border-retro-cyan/50 text-retro-cyan hover:bg-retro-cyan/10 transition-colors"
          @click="acceptOurs"
        >
          Accept All Ours
        </button>
        <button
          v-if="!resolved && hasConflictMarkers"
          type="button"
          class="px-2 py-0.5 text-xs font-mono rounded border border-retro-magenta/50 text-retro-magenta hover:bg-retro-magenta/10 transition-colors"
          @click="acceptTheirs"
        >
          Accept All Theirs
        </button>
        <button
          v-if="!resolved"
          type="button"
          :disabled="hasConflictMarkers"
          class="px-2 py-0.5 text-xs font-mono rounded border border-retro-green/50 text-retro-green hover:bg-retro-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="markResolved"
        >
          Mark Resolved
        </button>
        <span v-if="resolved" class="text-xs font-mono text-retro-green">
          Resolved
        </span>
        <span v-else-if="conflictBlockCount > 0" class="text-[11px] font-mono text-retro-muted">
          {{ conflictBlockCount }} conflict {{ conflictBlockCount === 1 ? 'block' : 'blocks' }}
        </span>
      </div>
    </div>

    <!-- Highlighted view (default) -->
    <div
      v-if="!isEditMode"
      class="flex-1 overflow-auto bg-retro-black conflict-viewer"
      :class="{ 'opacity-60': resolved }"
      @click="onHighlightedClick"
    >
      <div
        v-if="isHighlighting"
        class="flex items-center justify-center h-full text-retro-muted text-xs font-mono"
      >
        Highlighting...
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="conflict-code" v-html="highlightedHtml" />
    </div>

    <!-- Edit mode (textarea) -->
    <textarea
      v-if="isEditMode"
      :value="editedContent"
      :readonly="resolved"
      class="flex-1 w-full p-4 font-mono text-xs bg-retro-black text-retro-text resize-none focus:outline-none leading-relaxed"
      :class="{ 'opacity-60': resolved }"
      spellcheck="false"
      @input="onEditInput"
    />

    <!-- Conflict marker warning -->
    <div
      v-if="hasConflictMarkers && !resolved"
      class="flex-shrink-0 px-4 py-2 border-t border-retro-border bg-retro-yellow/10 text-retro-yellow text-xs font-mono"
    >
      File still contains conflict markers. Remove all &lt;&lt;&lt;&lt;&lt;&lt;&lt;, =======, &gt;&gt;&gt;&gt;&gt;&gt;&gt; markers to resolve.
    </div>
  </div>
</template>

<style>
.conflict-viewer {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.conflict-code {
  padding: 0;
  min-width: fit-content;
}

.conflict-line {
  display: flex;
  padding: 0 16px 0 0;
  min-height: 1.6em;
  white-space: pre;
}

.conflict-line .line-number {
  display: inline-block;
  min-width: 48px;
  padding: 0 12px 0 12px;
  text-align: right;
  color: rgb(var(--color-retro-muted) / 0.5);
  user-select: none;
  flex-shrink: 0;
}

.conflict-line .line-content {
  flex: 1;
  white-space: pre;
}

/* Ours section: cyan tint background */
.conflict-line.conflict-ours {
  background-color: rgb(var(--color-retro-cyan) / 0.08);
  border-left: 3px solid rgb(var(--color-retro-cyan) / 0.4);
}

.conflict-line.conflict-ours .line-number {
  color: rgb(var(--color-retro-cyan) / 0.6);
}

/* Theirs section: magenta tint background */
.conflict-line.conflict-theirs {
  background-color: rgb(var(--color-retro-magenta) / 0.08);
  border-left: 3px solid rgb(var(--color-retro-magenta) / 0.4);
}

.conflict-line.conflict-theirs .line-number {
  color: rgb(var(--color-retro-magenta) / 0.6);
}

/* Conflict marker lines */
.conflict-line.conflict-marker-line {
  background-color: rgb(var(--color-retro-yellow) / 0.1);
  border-left: 3px solid rgb(var(--color-retro-yellow) / 0.5);
}

.conflict-line.conflict-marker-line .line-content {
  color: rgb(var(--color-retro-yellow) / 0.7);
  font-style: italic;
}

.conflict-line.conflict-marker-line .line-number {
  color: rgb(var(--color-retro-yellow) / 0.5);
}

.conflict-inline-actions {
  display: flex;
  gap: 6px;
  padding: 4px 12px 6px 60px;
  background-color: rgb(var(--color-retro-yellow) / 0.06);
  border-left: 3px solid rgb(var(--color-retro-yellow) / 0.35);
}

.conflict-inline-button {
  border: 1px solid rgb(var(--color-retro-subtle) / 0.6);
  border-radius: 4px;
  padding: 0 8px;
  height: 20px;
  font-size: 11px;
  font-family: inherit;
  line-height: 18px;
  color: rgb(var(--color-retro-text));
  background: rgb(var(--color-retro-panel) / 0.6);
  cursor: pointer;
}

.conflict-inline-button:hover {
  background: rgb(var(--color-retro-panel));
}

.conflict-inline-button-ours {
  border-color: rgb(var(--color-retro-cyan) / 0.55);
  color: rgb(var(--color-retro-cyan));
}

.conflict-inline-button-theirs {
  border-color: rgb(var(--color-retro-magenta) / 0.55);
  color: rgb(var(--color-retro-magenta));
}

.conflict-inline-button-both {
  border-color: rgb(var(--color-retro-green) / 0.55);
  color: rgb(var(--color-retro-green));
}

/* Normal lines (no conflict) */
.conflict-line:not(.conflict-ours):not(.conflict-theirs):not(.conflict-marker-line) {
  border-left: 3px solid transparent;
}
</style>
