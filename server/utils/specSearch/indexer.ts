import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { ReindexResponse, SourceFile } from '~/types/specSearch'
import { chunkMarkdown } from './chunker'
import { getEmbeddings } from './embeddings'
import { getSpecSearchDatabase } from './database'
import { getProjectDir } from '../projectDir'
import { logger } from '../logger'

interface ScannedFile {
  absPath: string
  relPath: string
  hash: string
}

const log = logger.specSearch
const INDEX_YIELD_EVERY_FILES = 1

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function walkMarkdownFiles(dir: string, files: string[] = []): Promise<string[]> {
  let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string | Buffer }> = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const name = typeof entry.name === 'string' ? entry.name : entry.name.toString()
    const fullPath = join(dir, name)
    if (entry.isDirectory()) {
      await walkMarkdownFiles(fullPath, files)
      continue
    }
    if (entry.isFile() && name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files
}

async function scanSpecFiles(projectDir: string): Promise<ScannedFile[]> {
  const specsDir = join(projectDir, 'specs')
  const markdownFiles = await walkMarkdownFiles(specsDir)
  log.debug('Scanned specs directory for markdown files', {
    projectDir,
    specsDir,
    markdownFileCount: markdownFiles.length,
  })

  const out: ScannedFile[] = []
  for (const absPath of markdownFiles) {
    try {
      const content = await readFile(absPath, 'utf-8')
      out.push({
        absPath,
        relPath: relative(projectDir, absPath).replace(/\\/g, '/'),
        hash: sha256(content),
      })
    } catch {
      // skip unreadable file
    }
  }

  const scanned = out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  log.debug('Prepared scanned file metadata', {
    projectDir,
    scannedFileCount: scanned.length,
  })
  return scanned
}

export async function reindexFile(projectDir: string, relPath: string, contentHash: string): Promise<{ chunksCreated: number }> {
  return reindexFileWithOptions(projectDir, relPath, contentHash, { allowModelLoad: true })
}

async function reindexFileWithOptions(
  projectDir: string,
  relPath: string,
  contentHash: string,
  options: { allowModelLoad: boolean },
): Promise<{ chunksCreated: number }> {
  const db = getSpecSearchDatabase()
  const absPath = join(projectDir, relPath)
  const content = await readFile(absPath, 'utf-8')

  const chunks = chunkMarkdown(relPath, content)
  log.debug('Reindexing file', {
    relPath,
    absPath,
    contentHash,
    chunkCount: chunks.length,
    allowModelLoad: options.allowModelLoad,
  })
  const embeddings = await getEmbeddings(chunks.map(chunk => chunk.content), {
    allowModelLoad: options.allowModelLoad,
  })

  await db.replaceChunksForFile(relPath, chunks, embeddings)
  await db.upsertSourceFile({
    path: relPath,
    contentHash,
    indexedAt: new Date().toISOString(),
  })

  return { chunksCreated: chunks.length }
}

export async function deleteFileChunks(relPath: string): Promise<void> {
  const db = getSpecSearchDatabase()
  await db.deleteSourceFile(relPath)
}

export async function reindexAll(projectDir = getProjectDir()): Promise<ReindexResponse> {
  const start = Date.now()
  const db = getSpecSearchDatabase()
  const scanned = await scanSpecFiles(projectDir)
  const previous = await db.getSourceFiles()
  const previousMap = new Map(previous.map(file => [file.path, file]))

  let filesIndexed = 0
  let chunksCreated = 0
  let skippedUnchanged = 0
  let processedChanged = 0

  log.info('Starting full spec reindex', {
    projectDir,
    scannedFiles: scanned.length,
    previouslyIndexedFiles: previous.length,
  })

  for (const file of scanned) {
    const existing = previousMap.get(file.relPath)
    if (existing && existing.contentHash === file.hash) {
      skippedUnchanged += 1
      continue
    }

    const result = await reindexFile(projectDir, file.relPath, file.hash)
    filesIndexed += 1
    chunksCreated += result.chunksCreated
    processedChanged += 1
    if (processedChanged % INDEX_YIELD_EVERY_FILES === 0) {
      await yieldToEventLoop()
    }
  }

  const currentPaths = new Set(scanned.map(file => file.relPath))
  const deleted = previous.filter(file => !currentPaths.has(file.path))
  for (const file of deleted) {
    await deleteFileChunks(file.path)
    await yieldToEventLoop()
  }

  log.info('Completed full spec reindex', {
    projectDir,
    filesIndexed,
    chunksCreated,
    skippedUnchanged,
    deletedFiles: deleted.length,
    durationMs: Date.now() - start,
  })

  return {
    success: true,
    filesIndexed,
    chunksCreated,
    skippedUnchanged,
    duration: Date.now() - start,
    status: 'completed',
  }
}

export async function reconcileIndexedFiles(projectDir = getProjectDir()): Promise<{
  newOrChanged: number
  deleted: number
}> {
  return reconcileIndexedFilesWithOptions(projectDir, { allowModelLoad: true })
}

export async function reconcileIndexedFilesWithOptions(
  projectDir = getProjectDir(),
  options: { allowModelLoad: boolean },
): Promise<{
  newOrChanged: number
  deleted: number
}> {
  const db = getSpecSearchDatabase()
  const scanned = await scanSpecFiles(projectDir)
  const previous = await db.getSourceFiles()
  const previousMap = new Map(previous.map(file => [file.path, file]))

  let newOrChanged = 0

  log.debug('Starting reconcile scan', {
    projectDir,
    scannedFiles: scanned.length,
    previouslyIndexedFiles: previous.length,
  })

  for (const file of scanned) {
    const existing = previousMap.get(file.relPath)
    if (existing?.contentHash === file.hash) {
      continue
    }
    await reindexFileWithOptions(projectDir, file.relPath, file.hash, options)
    newOrChanged += 1
    if (newOrChanged % INDEX_YIELD_EVERY_FILES === 0) {
      await yieldToEventLoop()
    }
  }

  const currentPaths = new Set(scanned.map(file => file.relPath))
  const removed = previous.filter(file => !currentPaths.has(file.path))

  for (const file of removed) {
    await deleteFileChunks(file.path)
    await yieldToEventLoop()
  }

  return {
    newOrChanged,
    deleted: removed.length,
  }
}

export async function getSpecsDiskTimestamp(projectDir = getProjectDir()): Promise<string | null> {
  const specsDir = join(projectDir, 'specs')
  try {
    const stats = await stat(specsDir)
    return stats.mtime.toISOString()
  } catch {
    return null
  }
}
