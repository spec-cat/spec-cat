import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from '../server/utils/atomic-write'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('atomic JSON writes', () => {
  test('preserves pretty JSON shape, newline, mode, and leaves no temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atomic-json-'))
    directories.push(directory)
    const target = join(directory, 'state.json')
    await writeJsonAtomic(target, { stable: true }, 0o600)
    expect(await readFile(target, 'utf8')).toBe('{\n  "stable": true\n}\n')
    expect((await stat(target)).mode & 0o777).toBe(0o600)
    expect(await readdir(directory)).toEqual(['state.json'])
  })

  test('atomically replaces an existing record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atomic-json-'))
    directories.push(directory)
    const target = join(directory, 'state.json')
    await writeJsonAtomic(target, { version: 1 })
    await writeJsonAtomic(target, { version: 2 })
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ version: 2 })
  })
})
