import { getEmbedding, getEmbeddingModelError } from './embeddings'
import { runSearch } from './database'

export interface InjectedSearchContext {
  injected: boolean
  warning?: string
  context?: string
}

export async function buildSearchContextForImplement(input: {
  query: string
  featureId?: string
  maxResults?: number
}): Promise<InjectedSearchContext> {
  const query = input.query.trim()
  if (!query) {
    return { injected: false }
  }

  const embedding = await getEmbedding(query)
  const results = await runSearch('hybrid', query, {
    embedding,
    featureId: input.featureId,
    limit: input.maxResults ?? 5,
  })

  if (results.length === 0) {
    return {
      injected: false,
      warning: 'Spec search index returned no relevant context.',
    }
  }

  const sections: string[] = []
  sections.push('## Retrieved Spec Context')
  sections.push('Use these snippets as supporting context for implementation decisions:')

  for (const [index, result] of results.entries()) {
    const chunk = result.chunk
    sections.push('')
    sections.push(`${index + 1}. ${chunk.sourcePath}:${chunk.lineStart}`)
    if (chunk.headingHierarchy.length > 0) {
      sections.push(`   Headings: ${chunk.headingHierarchy.join(' > ')}`)
    }
    sections.push(`   ${chunk.content.slice(0, 500).replace(/\n+/g, ' ')}`)
  }

  const modelError = getEmbeddingModelError()
  if (modelError) {
    sections.push('')
    sections.push(`Warning: semantic model unavailable (${modelError}); results may be keyword-biased.`)
  }

  return {
    injected: true,
    context: sections.join('\n'),
  }
}
