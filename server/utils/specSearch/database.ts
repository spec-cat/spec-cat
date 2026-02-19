import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { SearchMode, SearchResult, SpecChunk, SourceFile } from '~/types/specSearch'
import { getSpecCatStorePath } from '../specCatStore'
import { logger } from '../logger'

const require = createRequire(import.meta.url)
const packageRootRequire = createPackageRootRequire()
const projectRequire = createProjectRequire()

function createPackageRootRequire(): NodeRequire | null {
  const explicitRoot = process.env.SPEC_CAT_PACKAGE_ROOT
  if (explicitRoot && existsSync(resolve(explicitRoot, 'package.json'))) {
    return createRequire(resolve(explicitRoot, 'package.json'))
  }

  const entry = process.argv[1]
  if (entry) {
    const inferredRoot = resolve(dirname(entry), '..', '..')
    if (existsSync(resolve(inferredRoot, 'package.json'))) {
      return createRequire(resolve(inferredRoot, 'package.json'))
    }
  }

  return null
}

function createProjectRequire(): NodeRequire | null {
  const projectPackagePath = resolve(process.cwd(), 'package.json')
  if (!existsSync(projectPackagePath)) return null
  return createRequire(projectPackagePath)
}

function requireFromRuntimeOrProject(moduleName: string): any {
  try {
    return require(moduleName)
  } catch (runtimeError) {
    try {
      if (packageRootRequire) {
        return packageRootRequire(moduleName)
      }
      throw new Error('package root require unavailable')
    } catch (packageRootError) {
      try {
        if (projectRequire) {
          return projectRequire(moduleName)
        }
        throw new Error('project require unavailable')
      } catch (projectError) {
        const runtimeMsg = runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
        const packageRootMsg = packageRootError instanceof Error ? packageRootError.message : String(packageRootError)
        const projectMsg = projectError instanceof Error ? projectError.message : String(projectError)
        throw new Error(`Failed to load ${moduleName} (runtime: ${runtimeMsg}; packageRoot: ${packageRootMsg}; project: ${projectMsg})`)
      }
    }
  }
}

interface ChunkRow {
  id: number
  source_path: string
  feature_id: string
  file_type: string
  heading_hierarchy: string
  content: string
  line_start: number
  line_end: number
  fr_tags: string
  task_tags: string
}

interface SearchFilters {
  featureId?: string
  fileType?: string
  limit: number
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const size = Math.min(a.length, b.length)
  for (let i = 0; i < size; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 1
  return 1 - (dot / (Math.sqrt(na) * Math.sqrt(nb)))
}

function toChunk(row: ChunkRow): SpecChunk {
  return {
    id: row.id,
    sourcePath: row.source_path,
    featureId: row.feature_id,
    fileType: row.file_type,
    headingHierarchy: JSON.parse(row.heading_hierarchy || '[]'),
    content: row.content,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    frTags: JSON.parse(row.fr_tags || '[]'),
    taskTags: JSON.parse(row.task_tags || '[]'),
  }
}

class MemoryStore {
  sourceFiles = new Map<string, SourceFile>()
  chunks = new Map<number, SpecChunk>()
  vectors = new Map<number, number[]>()
  nextId = 1

  deleteChunksForSource(sourcePath: string): number[] {
    const deletedIds: number[] = []
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.sourcePath === sourcePath) {
        this.chunks.delete(id)
        this.vectors.delete(id)
        deletedIds.push(id)
      }
    }
    return deletedIds
  }
}

export class SpecSearchDatabase {
  private log = logger.specSearch
  private dbPath = getSpecCatStorePath('specs-index.db')
  private sqlite: any | null = null
  private vectorEnabled = false
  private sqliteReady = false
  private memory = new MemoryStore()
  private initError: string | null = null

  getPath(): string {
    return this.dbPath
  }

  getVectorEnabled(): boolean {
    return this.vectorEnabled
  }

  getInitError(): string | null {
    return this.initError
  }

  isSqliteAvailable(): boolean {
    return this.sqliteReady && Boolean(this.sqlite)
  }

  async init(): Promise<void> {
    if (this.sqliteReady || this.sqlite) {
      this.log.debug('SQLite init skipped (already ready)', {
        dbPath: this.dbPath,
        sqliteReady: this.sqliteReady,
        hasSqliteHandle: Boolean(this.sqlite),
        existsOnDisk: existsSync(this.dbPath),
      })
      return
    }

    const dir = dirname(this.dbPath)
    const dirExisted = existsSync(dir)
    if (!dirExisted) mkdirSync(dir, { recursive: true })

    this.log.debug('Initializing spec search database', {
      dbPath: this.dbPath,
      dbDir: dir,
      dbDirExisted: dirExisted,
      dbExistedBeforeOpen: existsSync(this.dbPath),
    })

    try {
      const BetterSqlite3 = requireFromRuntimeOrProject('better-sqlite3')
      this.sqlite = new BetterSqlite3(this.dbPath)
      this.sqlite.pragma('journal_mode = WAL')

      this.bootstrapSchema()
      this.bootstrapVector()
      this.sqliteReady = true
      this.initError = null

      this.log.info('Spec search SQLite initialized', {
        dbPath: this.dbPath,
        dbExistsAfterOpen: existsSync(this.dbPath),
        vectorEnabled: this.vectorEnabled,
      })
    } catch (error) {
      this.sqlite = null
      this.sqliteReady = false
      this.initError = error instanceof Error ? error.message : String(error)

      this.log.error('Spec search SQLite initialization failed, using memory fallback', {
        dbPath: this.dbPath,
        error: this.initError,
      })
    }
  }

  private bootstrapSchema(): void {
    if (!this.sqlite) return

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS source_files (
        path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        feature_id TEXT NOT NULL,
        file_type TEXT NOT NULL,
        heading_hierarchy TEXT,
        content TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        fr_tags TEXT,
        task_tags TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_feature ON chunks(feature_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_path);

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        feature_id,
        file_type,
        content='chunks',
        content_rowid='id'
      );

      CREATE TABLE IF NOT EXISTS chunk_vectors (
        chunk_id INTEGER PRIMARY KEY,
        embedding_json TEXT NOT NULL
      );
    `)
  }

  private bootstrapVector(): void {
    if (!this.sqlite) return

    try {
      const sqliteVec = requireFromRuntimeOrProject('sqlite-vec')
      const hasLoadExtension = typeof this.sqlite.loadExtension === 'function'
      if (!hasLoadExtension) {
        throw new Error('SQLite loadExtension API unavailable')
      }

      if (typeof sqliteVec?.load === 'function') {
        sqliteVec.load(this.sqlite)
      } else if (typeof sqliteVec?.getLoadablePath === 'function') {
        this.sqlite.loadExtension(sqliteVec.getLoadablePath())
      } else {
        throw new Error('sqlite-vec package missing load/getLoadablePath API')
      }

      this.vectorEnabled = true
      this.log.debug('sqlite-vec extension loaded')
    } catch (error) {
      this.vectorEnabled = false
      const message = error instanceof Error ? error.message : String(error)
      if (!this.initError) {
        this.initError = message
      }
      this.log.warn('sqlite-vec unavailable, semantic vector table will stay disabled', {
        dbPath: this.dbPath,
        error: message,
      })
    }
  }

  private recoverIfCorrupt(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error)
    if (!/malformed|corrupt|disk image is malformed/i.test(msg)) return

    this.log.warn('Detected corrupt SQLite database, recreating', {
      dbPath: this.dbPath,
      error: msg,
      dbExistsBeforeDelete: existsSync(this.dbPath),
    })

    try {
      this.sqlite?.close?.()
    } catch {
      // noop
    }
    this.sqlite = null
    this.sqliteReady = false

    if (existsSync(this.dbPath)) {
      rmSync(this.dbPath, { force: true })
    }

    this.log.warn('Corrupt SQLite database removed; switched to memory store until next init', {
      dbPath: this.dbPath,
      dbExistsAfterDelete: existsSync(this.dbPath),
    })

    this.memory = new MemoryStore()
  }

  private asFilters(limit = 20, featureId?: string, fileType?: string): SearchFilters {
    return {
      limit: Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20)),
      featureId,
      fileType,
    }
  }

  async upsertSourceFile(file: SourceFile): Promise<void> {
    await this.init()

    if (!this.sqlite) {
      this.memory.sourceFiles.set(file.path, file)
      return
    }

    try {
      this.sqlite.prepare(`
        INSERT INTO source_files(path, content_hash, indexed_at)
        VALUES (?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          content_hash = excluded.content_hash,
          indexed_at = excluded.indexed_at
      `).run(file.path, file.contentHash, file.indexedAt)
    } catch (error) {
      this.recoverIfCorrupt(error)
      this.memory.sourceFiles.set(file.path, file)
    }
  }

  async getSourceFiles(): Promise<SourceFile[]> {
    await this.init()

    if (!this.sqlite) {
      return [...this.memory.sourceFiles.values()]
    }

    try {
      return this.sqlite.prepare('SELECT path, content_hash, indexed_at FROM source_files').all()
        .map((r: any) => ({
          path: r.path,
          contentHash: r.content_hash,
          indexedAt: r.indexed_at,
        }))
    } catch (error) {
      this.recoverIfCorrupt(error)
      return [...this.memory.sourceFiles.values()]
    }
  }

  async deleteSourceFile(path: string): Promise<void> {
    await this.init()

    if (!this.sqlite) {
      this.memory.sourceFiles.delete(path)
      this.memory.deleteChunksForSource(path)
      return
    }

    try {
      this.sqlite.prepare('DELETE FROM source_files WHERE path = ?').run(path)
      const rows = this.sqlite.prepare('SELECT id FROM chunks WHERE source_path = ?').all(path) as Array<{ id: number }>
      const deleteFts = this.sqlite.prepare('DELETE FROM chunks_fts WHERE rowid = ?')
      this.sqlite.prepare('DELETE FROM chunks WHERE source_path = ?').run(path)
      const deleteVector = this.sqlite.prepare('DELETE FROM chunk_vectors WHERE chunk_id = ?')
      for (const row of rows) {
        deleteFts.run(row.id)
        deleteVector.run(row.id)
      }
    } catch (error) {
      this.recoverIfCorrupt(error)
      this.memory.sourceFiles.delete(path)
      this.memory.deleteChunksForSource(path)
    }
  }

  async replaceChunksForFile(sourcePath: string, chunks: SpecChunk[], embeddings?: number[][]): Promise<number> {
    await this.init()

    if (!this.sqlite) {
      this.memory.deleteChunksForSource(sourcePath)
      chunks.forEach((chunk, index) => {
        const id = this.memory.nextId++
        this.memory.chunks.set(id, { ...chunk, id })
        const embedding = embeddings?.[index]
        if (embedding) this.memory.vectors.set(id, embedding)
      })
      return chunks.length
    }

    try {
      const existingRows = this.sqlite.prepare('SELECT id FROM chunks WHERE source_path = ?').all(sourcePath) as Array<{ id: number }>
      const deleteChunkRows = this.sqlite.prepare('DELETE FROM chunks WHERE source_path = ?')
      const deleteVector = this.sqlite.prepare('DELETE FROM chunk_vectors WHERE chunk_id = ?')
      const insertChunk = this.sqlite.prepare(`
        INSERT INTO chunks (
          source_path, feature_id, file_type, heading_hierarchy, content,
          line_start, line_end, fr_tags, task_tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertFts = this.sqlite.prepare('INSERT INTO chunks_fts(rowid, content, feature_id, file_type) VALUES (?, ?, ?, ?)')
      const insertVector = this.sqlite.prepare('INSERT OR REPLACE INTO chunk_vectors(chunk_id, embedding_json) VALUES (?, ?)')
      const runReplace = this.sqlite.transaction(() => {
        deleteChunkRows.run(sourcePath)
        for (const row of existingRows) {
          deleteVector.run(row.id)
        }
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          const result = insertChunk.run(
            chunk.sourcePath,
            chunk.featureId,
            chunk.fileType,
            JSON.stringify(chunk.headingHierarchy),
            chunk.content,
            chunk.lineStart,
            chunk.lineEnd,
            JSON.stringify(chunk.frTags),
            JSON.stringify(chunk.taskTags),
          )

          const rowId = Number(result.lastInsertRowid)
          insertFts.run(rowId, chunk.content, chunk.featureId, chunk.fileType)

          const embedding = embeddings?.[i]
          if (embedding?.length) {
            insertVector.run(rowId, JSON.stringify(embedding))
          }
        }
      })

      runReplace()

      return chunks.length
    } catch (error) {
      this.recoverIfCorrupt(error)
      this.memory.deleteChunksForSource(sourcePath)
      chunks.forEach((chunk, index) => {
        const id = this.memory.nextId++
        this.memory.chunks.set(id, { ...chunk, id })
        const embedding = embeddings?.[index]
        if (embedding) this.memory.vectors.set(id, embedding)
      })
      return chunks.length
    }
  }

  async searchKeyword(query: string, filters: { featureId?: string; fileType?: string; limit?: number }): Promise<SearchResult[]> {
    await this.init()
    const normalized = this.asFilters(filters.limit, filters.featureId, filters.fileType)

    if (!this.sqlite) {
      const lowered = query.toLowerCase()
      const rows = [...this.memory.chunks.values()].filter((chunk) => {
        if (normalized.featureId && chunk.featureId !== normalized.featureId) return false
        if (normalized.fileType && chunk.fileType !== normalized.fileType) return false
        return chunk.content.toLowerCase().includes(lowered)
      })
      return rows.slice(0, normalized.limit).map((chunk) => ({
        chunk,
        score: 1,
        matchType: 'keyword',
      }))
    }

    try {
      const where: string[] = ['chunks_fts MATCH ?']
      const params: unknown[] = [query]

      if (normalized.featureId) {
        where.push('c.feature_id = ?')
        params.push(normalized.featureId)
      }
      if (normalized.fileType) {
        where.push('c.file_type = ?')
        params.push(normalized.fileType)
      }
      params.push(normalized.limit)

      const sql = `
        SELECT
          c.id,
          c.source_path,
          c.feature_id,
          c.file_type,
          c.heading_hierarchy,
          c.content,
          c.line_start,
          c.line_end,
          c.fr_tags,
          c.task_tags,
          bm25(chunks_fts) AS score
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        WHERE ${where.join(' AND ')}
        ORDER BY score ASC
        LIMIT ?
      `

      const rows = this.sqlite.prepare(sql).all(...params) as ChunkRow[]
      return rows.map((row) => ({
        chunk: toChunk(row),
        score: Number((row as any).score) || 0,
        ftsScore: Number((row as any).score) || 0,
        matchType: 'keyword' as const,
      }))
    } catch (error) {
      this.recoverIfCorrupt(error)
      return []
    }
  }

  async searchSemantic(
    embedding: number[],
    filters: { featureId?: string; fileType?: string; limit?: number },
  ): Promise<SearchResult[]> {
    await this.init()
    const normalized = this.asFilters(filters.limit, filters.featureId, filters.fileType)

    if (!this.sqlite) {
      const results: SearchResult[] = []
      for (const [id, vector] of this.memory.vectors.entries()) {
        const chunk = this.memory.chunks.get(id)
        if (!chunk) continue
        if (normalized.featureId && chunk.featureId !== normalized.featureId) continue
        if (normalized.fileType && chunk.fileType !== normalized.fileType) continue
        const distance = cosineDistance(embedding, vector)
        results.push({
          chunk,
          score: 1 - distance,
          vectorDistance: distance,
          matchType: 'semantic',
        })
      }
      return results.sort((a, b) => (a.vectorDistance ?? 1) - (b.vectorDistance ?? 1)).slice(0, normalized.limit)
    }

    try {
      const where: string[] = []
      const params: unknown[] = []

      if (normalized.featureId) {
        where.push('c.feature_id = ?')
        params.push(normalized.featureId)
      }
      if (normalized.fileType) {
        where.push('c.file_type = ?')
        params.push(normalized.fileType)
      }

      const sql = `
        SELECT
          c.id,
          c.source_path,
          c.feature_id,
          c.file_type,
          c.heading_hierarchy,
          c.content,
          c.line_start,
          c.line_end,
          c.fr_tags,
          c.task_tags,
          v.embedding_json
        FROM chunk_vectors v
        JOIN chunks c ON c.id = v.chunk_id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      `
      const rows = this.sqlite.prepare(sql).all(...params) as Array<ChunkRow & { embedding_json: string }>

      return rows
        .map((row) => {
          const vector = JSON.parse(row.embedding_json || '[]') as number[]
          const distance = cosineDistance(embedding, vector)
          return {
            chunk: toChunk(row),
            score: 1 - distance,
            vectorDistance: distance,
            matchType: 'semantic' as const,
          }
        })
        .sort((a, b) => (a.vectorDistance ?? 1) - (b.vectorDistance ?? 1))
        .slice(0, normalized.limit)
    } catch (error) {
      this.recoverIfCorrupt(error)
      return []
    }
  }

  async searchHybrid(
    query: string,
    embedding: number[],
    filters: { featureId?: string; fileType?: string; limit?: number },
  ): Promise<SearchResult[]> {
    const normalized = this.asFilters(filters.limit, filters.featureId, filters.fileType)
    const keyword = await this.searchKeyword(query, normalized)
    const semantic = await this.searchSemantic(embedding, normalized)

    const rrfK = 60
    const merged = new Map<number, SearchResult & { rrfScore: number }>()

    keyword.forEach((result, index) => {
      const id = result.chunk.id
      if (!id) return
      const rrf = 1 / (rrfK + index + 1)
      merged.set(id, {
        ...result,
        matchType: 'hybrid',
        rrfScore: rrf,
      })
    })

    semantic.forEach((result, index) => {
      const id = result.chunk.id
      if (!id) return
      const rrf = 1 / (rrfK + index + 1)
      const existing = merged.get(id)
      if (existing) {
        existing.rrfScore += rrf
        existing.vectorDistance = result.vectorDistance
      } else {
        merged.set(id, {
          ...result,
          matchType: 'hybrid',
          rrfScore: rrf,
        })
      }
    })

    return [...merged.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, normalized.limit)
      .map(({ rrfScore, ...result }) => ({ ...result, score: rrfScore }))
  }

  async getCounts(): Promise<{ fileCount: number; chunkCount: number; lastIndexedAt: string | null }> {
    await this.init()

    if (!this.sqlite) {
      const files = [...this.memory.sourceFiles.values()]
      const lastIndexedAt = files
        .map(file => file.indexedAt)
        .sort()
        .at(-1) || null
      return {
        fileCount: files.length,
        chunkCount: this.memory.chunks.size,
        lastIndexedAt,
      }
    }

    try {
      const fileCount = this.sqlite.prepare('SELECT COUNT(*) AS n FROM source_files').get() as { n: number }
      const chunkCount = this.sqlite.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }
      const indexed = this.sqlite.prepare('SELECT MAX(indexed_at) AS ts FROM source_files').get() as { ts: string | null }
      return {
        fileCount: fileCount.n,
        chunkCount: chunkCount.n,
        lastIndexedAt: indexed.ts,
      }
    } catch (error) {
      this.recoverIfCorrupt(error)
      return {
        fileCount: this.memory.sourceFiles.size,
        chunkCount: this.memory.chunks.size,
        lastIndexedAt: null,
      }
    }
  }

  async clearAll(): Promise<void> {
    await this.init()

    this.log.debug('Clearing spec search index data', {
      dbPath: this.dbPath,
      sqliteAvailable: Boolean(this.sqlite),
      dbExistsOnDisk: existsSync(this.dbPath),
    })

    if (!this.sqlite) {
      this.memory = new MemoryStore()
      return
    }

    try {
      this.sqlite.exec('DELETE FROM source_files; DELETE FROM chunks; DELETE FROM chunk_vectors; DELETE FROM chunks_fts;')
      this.log.info('Spec search index cleared from SQLite', { dbPath: this.dbPath })
    } catch (error) {
      this.recoverIfCorrupt(error)
      this.memory = new MemoryStore()
      this.log.error('Failed clearing SQLite index; reset in-memory store', {
        dbPath: this.dbPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

let databaseSingleton: SpecSearchDatabase | null = null

export function getSpecSearchDatabase(): SpecSearchDatabase {
  if (!databaseSingleton) {
    databaseSingleton = new SpecSearchDatabase()
  }
  return databaseSingleton
}

export async function runSearch(
  mode: SearchMode,
  query: string,
  options: { limit?: number; featureId?: string; fileType?: string; embedding?: number[] },
): Promise<SearchResult[]> {
  const db = getSpecSearchDatabase()

  if (mode === 'semantic') {
    if (!options.embedding) return []
    return db.searchSemantic(options.embedding, options)
  }

  if (mode === 'hybrid') {
    if (!options.embedding) {
      return db.searchKeyword(query, options)
    }
    return db.searchHybrid(query, options.embedding, options)
  }

  return db.searchKeyword(query, options)
}
