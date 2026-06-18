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

async function writeRollout(home: string, dateParts: string[], filename: string, cwd: string, mtimeMs: number) {
  const dir = join(home, '.codex', 'sessions', ...dateParts)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, filename)
  const meta = {
    timestamp: '2026-06-20T01:00:00.000Z',
    type: 'session_meta',
    payload: { id: 'ignored-here', cwd, base_instructions: { text: 'x'.repeat(20000) } },
  }
  await writeFile(filePath, JSON.stringify(meta) + '\n{"type":"event_msg"}\n', 'utf-8')
  const seconds = mtimeMs / 1000
  await utimes(filePath, seconds, seconds)
  return filePath
}

describe('findLatestCodexSessionIdForCwd', () => {
  let previousHome: string | undefined

  beforeEach(async () => {
    testHome.path = await mkdtemp(join('/tmp', 'spec-cat-rollout-'))
    previousHome = process.env.HOME
    process.env.HOME = testHome.path
    delete process.env.CODEX_HOME
  })

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (testHome.path) {
      await rm(testHome.path, { recursive: true, force: true })
      testHome.path = ''
    }
  })

  it('returns the session id of the newest rollout matching the cwd', async () => {
    const { findLatestCodexSessionIdForCwd } = await import('~/server/utils/codexRollout')
    const cwd = '/home/khan/.spec-cat/tmp/sc-conv-abc'

    await writeRollout(
      testHome.path,
      ['2026', '06', '20'],
      'rollout-2026-06-20T01-00-00-019ee0c5-df1d-7751-ad14-e6573629fb76.jsonl',
      cwd,
      1_000_000,
    )
    await writeRollout(
      testHome.path,
      ['2026', '06', '20'],
      'rollout-2026-06-20T02-00-00-019ee111-aaaa-7777-8888-999999999999.jsonl',
      cwd,
      2_000_000,
    )

    const result = findLatestCodexSessionIdForCwd(cwd, 500_000)
    expect(result).toBe('019ee111-aaaa-7777-8888-999999999999')
  })

  it('ignores rollouts for a different cwd', async () => {
    const { findLatestCodexSessionIdForCwd } = await import('~/server/utils/codexRollout')
    await writeRollout(
      testHome.path,
      ['2026', '06', '20'],
      'rollout-2026-06-20T01-00-00-019ee0c5-df1d-7751-ad14-e6573629fb76.jsonl',
      '/some/other/cwd',
      1_000_000,
    )
    const result = findLatestCodexSessionIdForCwd('/home/khan/.spec-cat/tmp/sc-conv-abc', 500_000)
    expect(result).toBeNull()
  })

  it('ignores rollouts older than the afterMs cutoff', async () => {
    const { findLatestCodexSessionIdForCwd } = await import('~/server/utils/codexRollout')
    const cwd = '/home/khan/.spec-cat/tmp/sc-conv-old'
    await writeRollout(
      testHome.path,
      ['2026', '06', '20'],
      'rollout-2026-06-20T01-00-00-019ee0c5-df1d-7751-ad14-e6573629fb76.jsonl',
      cwd,
      1_000_000,
    )
    const result = findLatestCodexSessionIdForCwd(cwd, 5_000_000)
    expect(result).toBeNull()
  })
})
