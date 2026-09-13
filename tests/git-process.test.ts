import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeGit, gitErrorMessage, readGit } from '../server/utils/git-process'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Git process execution', () => {
  test('preserves argument ordering and optional output whitespace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-process-'))
    directories.push(directory)
    await executeGit(directory, ['init', '--quiet'])

    expect(await readGit(directory, ['rev-parse', '--is-inside-work-tree'])).toBe('true')
    expect(await readGit(directory, ['rev-parse', '--is-inside-work-tree'], { trim: false })).toBe('true\n')
  })

  test('retains numeric exit codes and normalizes stderr', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-process-'))
    directories.push(directory)
    await executeGit(directory, ['init', '--quiet'])

    try {
      await executeGit(directory, ['rev-parse', '--verify', 'refs/heads/missing'])
      throw new Error('Expected Git to fail')
    } catch (error) {
      expect(typeof (error as { code?: unknown }).code).toBe('number')
      expect(gitErrorMessage(error)).toContain('fatal:')
    }
  })

  test('uses the fallback for non-process failures', () => {
    expect(gitErrorMessage(null, 'Unable to run Git')).toBe('Unable to run Git')
  })
})
