<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ConflictFile } from '~/types/chat'

const props = defineProps<{
  file: ConflictFile
  resolved: boolean
  isAiResolving?: boolean
  strategy?: 'auto' | 'manual' | 'hybrid'
}>()

const emit = defineEmits<{
  resolve: [filePath: string, content: string]
  aiResolve: [filePath: string]
  retry: [filePath: string]
}>()

const editedContent = ref(props.file.content)
const isEditMode = ref(false)
const retryAttempts = ref(0)
const highlightedHtml = ref('')
const isHighlighting = ref(false)

watch(() => props.file.path, () => {
  highlightContent()
})

watch(() => props.file.content, () => {
  highlightContent()
})

const conflictBlockCount = computed(() => {
  const regex = /^<{7}\s/gm
  return (props.file.content.match(regex) || []).length
})

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
    const content = props.file.content
    const lines = content.split('\n')
    let lineHtml = ''
    let inOurs = false
    let inTheirs = false
    let lineNum = 0

    for (const line of lines) {
      lineNum++
      const isConflictStart = /^<{7}\s/.test(line)
      const isSeparator = /^={7}$/.test(line)
      const isConflictEnd = /^>{7}\s/.test(line)

      if (isConflictStart) {
        inOurs = true
        inTheirs = false
        lineHtml += `<div class="conflict-line conflict-marker-line" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content conflict-marker">${escapeHtml(line)}</span></div>\n`
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

      let highlighted = escapeHtml(line)
      try {
        const html = await codeToHtml(line || ' ', {
          lang,
          theme: 'vitesse-dark',
        })
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
    const lines = props.file.content.split('\n')
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
        <span v-if="resolved" class="text-xs font-mono text-retro-green">
          Resolved
        </span>
        <span v-else-if="conflictBlockCount > 0" class="text-[11px] font-mono text-retro-muted">
          {{ conflictBlockCount }} conflict {{ conflictBlockCount === 1 ? 'block' : 'blocks' }}
        </span>
      </div>
    </div>

    <!-- Read-only highlighted view -->
    <div
      class="flex-1 overflow-auto bg-retro-black conflict-viewer"
      :class="{ 'opacity-60': resolved }"
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

    <!-- Conflict marker info -->
    <div
      v-if="conflictBlockCount > 0 && !resolved"
      class="flex-shrink-0 px-4 py-2 border-t border-retro-border bg-retro-yellow/10 text-retro-yellow text-xs font-mono"
    >
      File contains {{ conflictBlockCount }} conflict {{ conflictBlockCount === 1 ? 'block' : 'blocks' }}. Use AI resolution to resolve.
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

/* Normal lines (no conflict) */
.conflict-line:not(.conflict-ours):not(.conflict-theirs):not(.conflict-marker-line) {
  border-left: 3px solid transparent;
}
</style>
