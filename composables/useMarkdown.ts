import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function useMarkdown() {
  function renderMarkdown(content: string): string {
    const raw = marked.parse(content) as string
    return DOMPurify.sanitize(raw)
  }

  return { renderMarkdown }
}
