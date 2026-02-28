import { createHash } from 'node:crypto'
const EMBEDDING_DIMS = 384

let modelLoaded = false
let extractor: ((text: string) => Promise<number[]>) | null = null
let batchExtractor: ((texts: string[]) => Promise<number[][]>) | null = null
let modelLoadError: string | null = null

function formatModelLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const lowered = raw.toLowerCase()

  if (lowered.includes('something went wrong installing the "sharp" module') || lowered.includes('sharp-linux')) {
    return 'Missing sharp native binary. Run `pnpm rebuild sharp` (or `pnpm install`) and retry semantic search.'
  }

  return raw
}

function deterministicFallbackEmbedding(text: string): number[] {
  const bytes = createHash('sha256').update(text).digest()
  const out = new Array<number>(EMBEDDING_DIMS)
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    out[i] = (bytes[i % bytes.length] - 128) / 128
  }
  return out
}

async function loadExtractor(): Promise<void> {
  if ((extractor && batchExtractor) || modelLoadError) return

  try {
    const transformers = await import('@xenova/transformers')
    const pipeline = transformers.pipeline as ((task: string, model: string) => Promise<any>) | undefined
    if (!pipeline) {
      modelLoadError = 'Transformers pipeline API unavailable'
      return
    }

    const embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5')

    const extractOne = async (text: string): Promise<number[]> => {
      const output = await embedder(text, { pooling: 'mean', normalize: true })
      const vector = Array.isArray(output?.data) ? output.data : []
      if (vector.length >= EMBEDDING_DIMS) {
        return vector.slice(0, EMBEDDING_DIMS).map(Number)
      }
      return deterministicFallbackEmbedding(text)
    }

    const extractBatch = async (texts: string[]): Promise<number[][]> => {
      if (texts.length === 0) return []

      // Transformers supports array input. This avoids per-chunk call overhead.
      const output = await embedder(texts, { pooling: 'mean', normalize: true })
      const flat = Array.isArray(output?.data) ? output.data.map(Number) : []

      if (flat.length < texts.length * EMBEDDING_DIMS) {
        return Promise.all(texts.map(extractOne))
      }

      const vectors: number[][] = []
      for (let i = 0; i < texts.length; i++) {
        const start = i * EMBEDDING_DIMS
        const end = start + EMBEDDING_DIMS
        vectors.push(flat.slice(start, end))
      }
      return vectors
    }

    extractor = extractOne
    batchExtractor = extractBatch
    modelLoaded = true
  } catch (error) {
    modelLoadError = formatModelLoadError(error)
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  await loadExtractor()

  if (!extractor) {
    return deterministicFallbackEmbedding(text)
  }

  return extractor(text)
}

export async function getEmbeddings(
  texts: string[],
  options?: { allowModelLoad?: boolean },
): Promise<number[][]> {
  if (texts.length === 0) return []
  const allowModelLoad = options?.allowModelLoad !== false
  if (allowModelLoad) {
    await loadExtractor()
  }

  if (!batchExtractor) {
    return texts.map(deterministicFallbackEmbedding)
  }

  try {
    return await batchExtractor(texts)
  } catch {
    return texts.map(deterministicFallbackEmbedding)
  }
}

export function isEmbeddingModelLoaded(): boolean {
  return modelLoaded
}

export function getEmbeddingModelError(): string | null {
  return modelLoadError
}

export function getEmbeddingDims(): number {
  return EMBEDDING_DIMS
}
