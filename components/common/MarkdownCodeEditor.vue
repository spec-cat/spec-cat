<script setup lang="ts">
import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

const props = withDefaults(defineProps<{
  modelValue: string
  readOnly?: boolean
  lineToReveal?: number | null
}>(), {
  readOnly: false,
  lineToReveal: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
let suppressEmit = false
let clearHighlightTimer: ReturnType<typeof setTimeout> | null = null

const setHighlightLineEffect = StateEffect.define<number>()
const clearHighlightEffect = StateEffect.define<void>()

const highlightLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes)

    for (const effect of transaction.effects) {
      if (effect.is(clearHighlightEffect)) {
        nextDecorations = Decoration.none
      }

      if (effect.is(setHighlightLineEffect)) {
        const lineNumber = Math.max(1, Math.min(effect.value, transaction.state.doc.lines))
        const line = transaction.state.doc.line(lineNumber)
        nextDecorations = Decoration.set([
          Decoration.line({ class: 'cm-target-line' }).range(line.from),
        ])
      }
    }

    return nextDecorations
  },
  provide: field => EditorView.decorations.from(field),
})

function clearLineHighlightDelayed() {
  if (!view) return
  if (clearHighlightTimer) {
    clearTimeout(clearHighlightTimer)
  }

  clearHighlightTimer = setTimeout(() => {
    if (!view) return
    view.dispatch({ effects: clearHighlightEffect.of(undefined) })
  }, 1600)
}

function revealLine(lineNumber: number) {
  if (!view) return

  const clamped = Math.max(1, Math.min(lineNumber, view.state.doc.lines))
  const line = view.state.doc.line(clamped)

  view.dispatch({
    selection: { anchor: line.from },
    effects: [
      EditorView.scrollIntoView(line.from, { y: 'center' }),
      setHighlightLineEffect.of(clamped),
    ],
  })

  view.focus()
  clearLineHighlightDelayed()
}

function buildState(doc: string, readOnly: boolean): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      markdown(),
      oneDark,
      EditorView.lineWrapping,
      highlightLineField,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || suppressEmit) return
        emit('update:modelValue', update.state.doc.toString())
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          fontSize: '13px',
          backgroundColor: 'rgb(var(--color-retro-black))',
          color: 'rgb(var(--color-retro-text))',
        },
        '.cm-scroller': {
          overflow: 'auto',
          lineHeight: '1.6',
        },
        '.cm-gutters': {
          backgroundColor: 'rgb(var(--color-retro-dark))',
          color: 'rgb(var(--color-retro-subtle))',
          borderRight: '1px solid rgb(var(--color-retro-border))',
        },
        '.cm-content': {
          caretColor: 'rgb(var(--color-retro-cyan))',
          padding: '12px 0',
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(34, 211, 238, 0.08)',
        },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'rgba(34, 211, 238, 0.22)',
        },
      }),
      EditorState.readOnly.of(readOnly),
    ],
  })
}

onMounted(() => {
  if (!rootRef.value) return

  view = new EditorView({
    state: buildState(props.modelValue, props.readOnly),
    parent: rootRef.value,
  })

  if (props.lineToReveal) {
    revealLine(props.lineToReveal)
  }
})

watch(() => props.modelValue, (nextValue) => {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === nextValue) return

  suppressEmit = true
  view.dispatch({
    changes: {
      from: 0,
      to: current.length,
      insert: nextValue,
    },
  })
  suppressEmit = false
})

watch(() => props.lineToReveal, (line) => {
  if (!line) return
  revealLine(line)
})

onBeforeUnmount(() => {
  if (clearHighlightTimer) {
    clearTimeout(clearHighlightTimer)
  }
  if (view) {
    view.destroy()
    view = null
  }
})
</script>

<template>
  <div ref="rootRef" class="h-full w-full" />
</template>

<style scoped>
:deep(.cm-target-line) {
  background: linear-gradient(90deg, rgba(244, 63, 94, 0.28) 0%, rgba(244, 63, 94, 0.08) 75%, transparent 100%);
  transition: background-color 240ms ease;
}
</style>
