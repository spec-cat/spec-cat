export type SearchMode = 'keyword' | 'semantic' | 'hybrid'
export type SearchMatchType = SearchMode

export interface SpecChunk {
  id?: number
  sourcePath: string
  featureId: string
  fileType: string
  headingHierarchy: string[]
  content: string
  lineStart: number
  lineEnd: number
  frTags: string[]
  taskTags: string[]
}

export interface SourceFile {
  path: string
  contentHash: string
  indexedAt: string
}

export interface SearchResult {
  chunk: SpecChunk
  score: number
  matchType: SearchMatchType
  ftsScore?: number
  vectorDistance?: number
}

export interface SearchRequest {
  q: string
  mode?: SearchMode
  featureId?: string
  fileType?: string
  limit?: number
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  searchTime: number
  mode: SearchMode
  warning?: string
}

export interface SearchResultViewModel {
  featureId: string
  sourcePath: string
  headingHierarchy: string[]
  snippet: string
  matchType: SearchMatchType
  score: number
  lineStart: number
  lineEnd: number
}

export interface CommandPaletteState {
  isOpen: boolean
  query: string
  debounceMs: number
  isSearching: boolean
  highlightedIndex: number
  feedbackState: 'idle' | 'empty-query' | 'no-results' | 'error' | 'results'
  errorMessage: string | null
}

export interface IndexStatus {
  fileCount: number
  chunkCount: number
  lastIndexedAt: string | null
  lastScanAt: string | null
  isIndexing: boolean
  currentJob: 'startup-reconcile' | 'poll-scan' | 'manual-reindex' | null
  schedulerActive: boolean
  pollIntervalSeconds: number
  modelLoaded: boolean
  vectorEnabled: boolean
  dbPath: string
  dbExists: boolean
  sqliteAvailable: boolean
  initError: string | null
}

export interface ReindexResponse {
  success: boolean
  filesIndexed: number
  chunksCreated: number
  skippedUnchanged: number
  duration: number
  status: 'completed' | 'already-indexing' | 'failed'
  error?: string
}

export interface IndexRuntimeState {
  isIndexing: boolean
  currentJob: 'startup-reconcile' | 'poll-scan' | 'manual-reindex' | null
  lastScanAt: string | null
  lastIndexedAt: string | null
  schedulerActive: boolean
  pollIntervalSeconds: number
}

export interface SearchWarning {
  code: 'VECTOR_UNAVAILABLE' | 'MODEL_UNAVAILABLE' | 'DB_RECOVERED'
  message: string
}
