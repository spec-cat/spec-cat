import { mkdir, mkdtemp, rm, writeFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testHome = vi.hoisted(() => ({ path: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    default: { ...actual, homedir: () => testHome.path },
    homedir: () => testHome.path,
  }
})

async function writeSession(home: string, encodedDir: string, uuid: string, cwd: string | null, mtimeMs: number) {
  const dir = join(home, '.claude', 'projects', encodedDir)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `${uuid}.jsonl`)
  const firstLine = JSON.stringify({ type: 'mode', mode: 'default', sessionId: uuid })
  const secondLine = cwd ? JSON.stringify({ type: 'user', cwd }) : '{"type":"user"}'
  await writeFile(filePath, `${firstLine}\n${secondLine}\n`, 'utf-8')
  const seconds = mtimeMs / 1000
  await utimes(filePath, seconds, seconds)
  return filePath
}

describe('findLatestClaudeSessionIdForCwd', () => {
  let previousHome: string | undefined

  beforeEach(async () => {
    testHome.path = await mkdtemp(join('/tmp', 'spec-cat-claude-'))
    previousHome = process.env.HOME
    process.env.HOME = testHome.path
    delete process.env.CLAUDE_CONFIG_DIR
  })

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (testHome.path) {
      await rm(testHome.path, { recursive: true, force: true })
      testHome.path = ''
    }
  })

  it('encodes cwd by replacing / and . with -', async () => {
    const { encodeClaudeProjectDir } = await import('~/server/utils/claudeSession')
    expect(encodeClaudeProjectDir('/home/khan/.spec-cat/tmp/sc-conv-abc'))
      .toBe('-home-khan--spec-cat-tmp-sc-conv-abc')
  })

  it('returns the newest session id in the cwd-derived directory', async () => {
    const { findLatestClaudeSessionIdForCwd } = await import('~/server/utils/claudeSession')
    const cwd = '/home/khan/.spec-cat/tmp/sc-conv-abc'
    const encoded = '-home-khan--spec-cat-tmp-sc-conv-abc'

    await writeSession(testHome.path, encoded, 'aaf90469-488a-4478-a64f-89f4eb341484', cwd, 1_000_000)
    await writeSession(testHome.path, encoded, 'bbb11111-2222-3333-4444-555555555555', cwd, 2_000_000)

    const result = findLatestClaudeSessionIdForCwd(cwd, 500_000)
    expect(result).toBe('bbb11111-2222-3333-4444-555555555555')
  })

  it('skips a session whose recorded cwd disagrees (encoding collision guard)', async () => {
    const { findLatestClaudeSessionIdForCwd } = await import('~/server/utils/claudeSession')
    // Both '/a/b.c' and '/a/b/c' encode to '-a-b-c'.
    const encoded = '-a-b-c'
    await writeSession(testHome.path, encoded, 'aaaaaaaa-1111-2222-3333-444444444444', '/a/b/c', 2_000_000)
    await writeSession(testHome.path, encoded, 'bbbbbbbb-1111-2222-3333-444444444444', '/a/b.c', 1_000_000)

    const result = findLatestClaudeSessionIdForCwd('/a/b.c', 500_000)
    expect(result).toBe('bbbbbbbb-1111-2222-3333-444444444444')
  })

  it('finds a session by recorded cwd even when the directory encoding differs', async () => {
    const { findLatestClaudeSessionIdForCwd } = await import('~/server/utils/claudeSession')
    const cwd = '/home/khan/.spec-cat/tmp/sc-conv-drift'
    // Stored under an unexpected directory name (simulated encoding drift); the
    // derived directory does not exist, so only a recorded-cwd scan can find it.
    await writeSession(testHome.path, 'some-unexpected-encoding', 'dddddddd-1111-2222-3333-444444444444', cwd, 2_000_000)
    const result = findLatestClaudeSessionIdForCwd(cwd, 500_000)
    expect(result).toBe('dddddddd-1111-2222-3333-444444444444')
  })

  it('does not match a different cwd during the broad fallback scan', async () => {
    const { findLatestClaudeSessionIdForCwd } = await import('~/server/utils/claudeSession')
    await writeSession(testHome.path, 'some-unexpected-encoding', 'eeeeeeee-1111-2222-3333-444444444444', '/other/cwd', 2_000_000)
    const result = findLatestClaudeSessionIdForCwd('/home/khan/.spec-cat/tmp/sc-conv-missing', 500_000)
    expect(result).toBeNull()
  })

  it('ignores sessions older than the afterMs cutoff', async () => {
    const { findLatestClaudeSessionIdForCwd } = await import('~/server/utils/claudeSession')
    const cwd = '/home/khan/.spec-cat/tmp/sc-conv-old'
    await writeSession(testHome.path, '-home-khan--spec-cat-tmp-sc-conv-old', 'cccccccc-1111-2222-3333-444444444444', cwd, 1_000_000)
    const result = findLatestClaudeSessionIdForCwd(cwd, 5_000_000)
    expect(result).toBeNull()
  })
})
