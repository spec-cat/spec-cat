/**
 * Spec Cat Store — Server-side JSON file persistence under $HOME/.spec-cat/projects/{hash}/
 * Generic read/write for any JSON data file.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { getProjectDir } from './projectDir'

/** Get per-project .spec-cat data directory under $HOME */
export function getSpecCatDataDir(): string {
  const projectDir = getProjectDir()
  const projectHash = createHash('sha256').update(projectDir).digest('hex').slice(0, 12)
  return join(homedir(), '.spec-cat', 'projects', projectHash)
}

/** Get full path for a file in the spec-cat data directory */
export function getSpecCatStorePath(filename: string): string {
  return join(getSpecCatDataDir(), filename)
}

/** Read a JSON file from spec-cat data directory. Returns fallback if file doesn't exist or is corrupt. */
export async function readSpecCatStore<T>(filename: string, fallback: T): Promise<T> {
  const path = getSpecCatStorePath(filename)
  if (!existsSync(path)) return fallback
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Write a JSON file to spec-cat data directory. Creates parent directories if needed. */
export async function writeSpecCatStore<T>(filename: string, data: T): Promise<void> {
  const path = getSpecCatStorePath(filename)
  const dir = dirname(path)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}
