import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildProviderCommand,
  buildProviderQueryCommand,
  encodeClaudeProjectDir,
  extractCodexAgentText,
  findClaudeSessionId,
  findCodexSessionId,
  listCodexSessionIds,
  readLastCodexAgentMessage
} from '../server/utils/provider-resume'

// The command builder and the session-file finders resolve binaries and roots
// from the environment at call time, so pin them for deterministic assertions.
const savedEnv = {
  CLAUDE_BIN: process.env.CLAUDE_BIN,
  CODEX_BIN: process.env.CODEX_BIN,
  CODEX_CLI_PATH: process.env.CODEX_CLI_PATH,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CODEX_HOME: process.env.CODEX_HOME
}
delete process.env.CLAUDE_BIN
delete process.env.CODEX_BIN
delete process.env.CODEX_CLI_PATH

const claudeRoot = await mkdtemp(join(tmpdir(), 'provider-resume-claude-'))
const codexRoot = await mkdtemp(join(tmpdir(), 'provider-resume-codex-'))
process.env.CLAUDE_CONFIG_DIR = claudeRoot
process.env.CODEX_HOME = codexRoot

afterAll(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(claudeRoot, { recursive: true, force: true })
  await rm(codexRoot, { recursive: true, force: true })
})

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000'

async function writeSessionFile(path: string, cwd: string, mtimeMs: number) {
  await writeFile(path, `${JSON.stringify({ type: 'meta', cwd })}\n`)
  await utimes(path, new Date(mtimeMs), new Date(mtimeMs))
}

describe('buildProviderCommand', () => {
  test('returns the plain launch commands without a resume id', () => {
    expect(buildProviderCommand('claude')).toBe('claude --dangerously-skip-permissions')
    expect(buildProviderCommand('codex')).toBe('codex --dangerously-bypass-approvals-and-sandbox')
  })

  test('treats null and undefined resume ids as absent', () => {
    expect(buildProviderCommand('claude', null)).toBe('claude --dangerously-skip-permissions')
    expect(buildProviderCommand('codex', undefined)).toBe('codex --dangerously-bypass-approvals-and-sandbox')
  })

  test('builds resume commands with a quoted session id', () => {
    expect(buildProviderCommand('claude', SESSION_ID))
      .toBe(`claude --resume '${SESSION_ID}' --dangerously-skip-permissions`)
    expect(buildProviderCommand('codex', SESSION_ID))
      .toBe(`codex resume '${SESSION_ID}' --dangerously-bypass-approvals-and-sandbox`)
  })

  test.each([
    ['not-a-uuid'],
    [`${'123e4567-e89b-42d3-a456-426614174000'}; rm -rf ~`],
    ['$(touch pwned)'],
    ['`id`'],
    ["'; echo injected; '"],
    ['123e4567-e89b-42d3-a456-42661417400g']
  ])('rejects a non-uuid resume id: %p', (value) => {
    expect(() => buildProviderCommand('claude', value)).toThrow('Invalid provider resume session id')
    expect(() => buildProviderCommand('codex', value)).toThrow('Invalid provider resume session id')
  })
})

describe('buildProviderQueryCommand', () => {
  test('launches claude with the explicit query session id', () => {
    expect(buildProviderQueryCommand('claude', SESSION_ID))
      .toBe(`claude --session-id '${SESSION_ID}' --dangerously-skip-permissions`)
  })

  test('launches codex plain — it has no session-id flag', () => {
    expect(buildProviderQueryCommand('codex', SESSION_ID))
      .toBe('codex --dangerously-bypass-approvals-and-sandbox')
  })

  test('rejects a non-uuid claude session id', () => {
    expect(() => buildProviderQueryCommand('claude', '$(touch pwned)'))
      .toThrow('Invalid provider resume session id')
  })
})

describe('encodeClaudeProjectDir', () => {
  test('replaces slashes and dots with dashes', () => {
    expect(encodeClaudeProjectDir('/home/user/src/my.app')).toBe('-home-user-src-my-app')
  })

  test('keeps other characters intact', () => {
    expect(encodeClaudeProjectDir('/tmp/work_tree-1')).toBe('-tmp-work_tree-1')
  })
})

describe('findClaudeSessionId', () => {
  test('returns null when no session file exists yet', async () => {
    expect(await findClaudeSessionId('/nowhere/never', Date.now())).toBeNull()
  })

  test('picks the newest session whose recorded cwd matches', async () => {
    const cwd = '/work/claude-newest'
    const dir = join(claudeRoot, 'projects', encodeClaudeProjectDir(cwd))
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now() - 10_000
    const olderId = '11111111-1111-4111-8111-111111111111'
    const newerId = '22222222-2222-4222-8222-222222222222'
    const otherCwdId = '33333333-3333-4333-8333-333333333333'
    await writeSessionFile(join(dir, `${olderId}.jsonl`), cwd, afterMs + 1_000)
    await writeSessionFile(join(dir, `${newerId}.jsonl`), cwd, afterMs + 5_000)
    await writeSessionFile(join(dir, `${otherCwdId}.jsonl`), '/work/other', afterMs + 9_000)

    expect(await findClaudeSessionId(cwd, afterMs)).toBe(newerId)
  })

  test('ignores session files older than afterMs', async () => {
    const cwd = '/work/claude-stale'
    const dir = join(claudeRoot, 'projects', encodeClaudeProjectDir(cwd))
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now()
    const staleId = '44444444-4444-4444-8444-444444444444'
    await writeSessionFile(join(dir, `${staleId}.jsonl`), cwd, afterMs - 60_000)

    expect(await findClaudeSessionId(cwd, afterMs)).toBeNull()
  })

  test('matches on the recorded cwd even when the directory encoding differs', async () => {
    const cwd = '/work/claude-moved'
    const dir = join(claudeRoot, 'projects', 'some-unrelated-encoding')
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now() - 10_000
    const movedId = '55555555-5555-4555-8555-555555555555'
    await writeSessionFile(join(dir, `${movedId}.jsonl`), cwd, afterMs + 1_000)

    expect(await findClaudeSessionId(cwd, afterMs)).toBe(movedId)
  })
})

describe('findCodexSessionId', () => {
  test('finds the newest rollout for the cwd under the dated layout', async () => {
    const cwd = '/work/codex-newest'
    const dir = join(codexRoot, 'sessions', '2026', '07', '13')
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now() - 10_000
    const olderId = '66666666-6666-4666-8666-666666666666'
    const newerId = '77777777-7777-4777-8777-777777777777'
    const otherCwdId = '88888888-8888-4888-8888-888888888888'
    await writeSessionFile(join(dir, `rollout-2026-07-13T09-00-00-${olderId}.jsonl`), cwd, afterMs + 1_000)
    await writeSessionFile(join(dir, `rollout-2026-07-13T10-00-00-${newerId}.jsonl`), cwd, afterMs + 5_000)
    await writeSessionFile(join(dir, `rollout-2026-07-13T11-00-00-${otherCwdId}.jsonl`), '/work/other', afterMs + 9_000)

    expect(await findCodexSessionId(cwd, afterMs)).toBe(newerId)
  })

  test('ignores rollouts older than afterMs and unknown cwds', async () => {
    const cwd = '/work/codex-stale'
    const dir = join(codexRoot, 'sessions', '2026', '07', '12')
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now()
    const staleId = '99999999-9999-4999-8999-999999999999'
    await writeSessionFile(join(dir, `rollout-2026-07-12T10-00-00-${staleId}.jsonl`), cwd, afterMs - 60_000)

    expect(await findCodexSessionId(cwd, afterMs)).toBeNull()
    expect(await findCodexSessionId('/work/never-used', afterMs - 120_000)).toBeNull()
  })

  test('skips excluded ids so a concurrent pre-existing session is never picked', async () => {
    const cwd = '/work/codex-excluded'
    const dir = join(codexRoot, 'sessions', '2026', '07', '14')
    await mkdir(dir, { recursive: true })

    const afterMs = Date.now() - 10_000
    // The pre-existing session keeps being written to, so its mtime also
    // passes the afterMs filter — only the exclusion set can rule it out.
    const preexistingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const queryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await writeSessionFile(join(dir, `rollout-2026-07-14T10-00-00-${preexistingId}.jsonl`), cwd, afterMs + 9_000)
    await writeSessionFile(join(dir, `rollout-2026-07-14T10-00-01-${queryId}.jsonl`), cwd, afterMs + 5_000)

    expect(await findCodexSessionId(cwd, afterMs)).toBe(preexistingId)
    expect(await findCodexSessionId(cwd, afterMs, new Set([preexistingId]))).toBe(queryId)
    expect(await findCodexSessionId(cwd, afterMs, new Set([preexistingId, queryId]))).toBeNull()
  })
})

describe('listCodexSessionIds', () => {
  test('returns lowercased ids of every rollout on disk regardless of age', async () => {
    const cwd = '/work/codex-list'
    const dir = join(codexRoot, 'sessions', '2026', '07', '15')
    await mkdir(dir, { recursive: true })

    const oldId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    await writeSessionFile(join(dir, `rollout-2026-07-15T10-00-00-${oldId.toUpperCase()}.jsonl`), cwd, Date.now() - 600_000)

    const ids = await listCodexSessionIds()
    expect(ids.has(oldId)).toBe(true)
  })
})

describe('extractCodexAgentText', () => {
  test('reads a task_complete last_agent_message', () => {
    const entry = { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Resolved conflicts.' } }
    expect(extractCodexAgentText(entry)).toBe('Resolved conflicts.')
  })

  test('reads an agent_message event', () => {
    const entry = { type: 'event_msg', payload: { type: 'agent_message', message: '  done  ' } }
    expect(extractCodexAgentText(entry)).toBe('done')
  })

  test('joins output_text blocks of an assistant message', () => {
    const entry = {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'line one' },
          { type: 'reasoning', text: 'ignored' },
          { type: 'output_text', text: 'line two' }
        ]
      }
    }
    expect(extractCodexAgentText(entry)).toBe('line one\nline two')
  })

  test('returns undefined for unrelated or malformed lines', () => {
    expect(extractCodexAgentText({ type: 'event_msg', payload: { type: 'token_count' } })).toBeUndefined()
    expect(extractCodexAgentText({ payload: { type: 'message', role: 'user', content: [] } })).toBeUndefined()
    expect(extractCodexAgentText(null)).toBeUndefined()
    expect(extractCodexAgentText('nope')).toBeUndefined()
  })
})

describe('readLastCodexAgentMessage', () => {
  test('returns the last agent message from the newest matching rollout', async () => {
    const cwd = '/work/codex-report'
    const dir = join(codexRoot, 'sessions', '2026', '07', '13')
    await mkdir(dir, { recursive: true })
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const path = join(dir, `rollout-2026-07-13T12-00-00-${id}.jsonl`)
    const lines = [
      JSON.stringify({ type: 'session_meta', payload: { cwd } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'intermediate' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'Fixed the merge conflict in a.ts' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Fixed the merge conflict in a.ts' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } })
    ]
    await writeFile(path, `${lines.join('\n')}\n`)

    expect(await readLastCodexAgentMessage(cwd)).toBe('Fixed the merge conflict in a.ts')
    // The session_meta records cwd on the head line, so an id-based lookup finds
    // the same file.
    expect(await readLastCodexAgentMessage(cwd, id)).toBe('Fixed the merge conflict in a.ts')
  })

  test('returns undefined when no rollout matches the cwd', async () => {
    expect(await readLastCodexAgentMessage('/work/no-such-codex-cwd')).toBeUndefined()
  })
})
