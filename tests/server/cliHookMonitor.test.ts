import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { JobEvent } from '~/server/utils/eventBus'

const projectDir = mkdtempSync(join(tmpdir(), 'spec-cat-hook-monitor-project-'))

vi.mock('~/server/utils/projectDir', () => ({
  getProjectDir: () => projectDir,
}))

const { getCliHookSpoolPath } = await import('~/server/utils/cliHookInjection')
const { startCliHookMonitor } = await import('~/server/utils/cliHookMonitor')

afterEach(() => {
  vi.useRealTimers()
  try {
    rmSync(getCliHookSpoolPath('conv-1'), { force: true })
  } catch {}
})

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('cliHookMonitor', () => {
  it('emits normalized prompt, tool, and stop events for the active job', () => {
    vi.useFakeTimers()
    const events: JobEvent[] = []
    const monitor = startCliHookMonitor({
      conversationId: 'conv-1',
      jobId: 'job-1',
      emit: event => events.push(event),
    })

    const spool = getCliHookSpoolPath('conv-1')
    mkdirSync(dirname(spool), { recursive: true })
    appendFileSync(spool, `${JSON.stringify({
      providerId: 'codex',
      conversationId: 'conv-1',
      jobId: 'job-1',
      requestId: 'req-1',
      hookEventName: 'UserPromptSubmit',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'hello',
      },
    })}\n`)
    appendFileSync(spool, `${JSON.stringify({
      providerId: 'codex',
      conversationId: 'conv-1',
      jobId: 'job-ignored',
      requestId: 'req-ignored',
      hookEventName: 'Stop',
      payload: { hook_event_name: 'Stop' },
    })}\n`)
    appendFileSync(spool, `${JSON.stringify({
      providerId: 'codex',
      conversationId: 'conv-1',
      jobId: 'job-1',
      requestId: 'req-1',
      hookEventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
      },
    })}\n`)
    appendFileSync(spool, `${JSON.stringify({
      providerId: 'codex',
      conversationId: 'conv-1',
      jobId: 'job-1',
      requestId: 'req-1',
      hookEventName: 'Stop',
      payload: {
        hook_event_name: 'Stop',
        last_assistant_message: 'done',
      },
    })}\n`)

    vi.advanceTimersByTime(100)
    monitor.stop()

    expect(events.map(event => event.type)).toEqual([
      'cli_hook',
      'cli_prompt_submitted',
      'cli_hook',
      'cli_tool_completed',
      'cli_hook',
      'cli_turn_stop',
    ])
    expect(events.find(event => event.type === 'cli_prompt_submitted')?.prompt).toBe('hello')
    expect(events.find(event => event.type === 'cli_tool_completed')?.toolName).toBe('Bash')
    expect(events.find(event => event.type === 'cli_turn_stop')?.lastAssistantMessage).toBe('done')
    expect(monitor.sawStop()).toBe(true)
    vi.useRealTimers()
  })

  it('with requireArmedPromptSubmit, only finalizes a Stop that follows an armed UserPromptSubmit', () => {
    vi.useFakeTimers()
    const stops: (string | undefined)[] = []
    const monitor = startCliHookMonitor({
      conversationId: 'conv-1',
      emit: () => {},
      onStop: msg => stops.push(msg),
      isArmed: () => true,
      requireArmedPromptSubmit: true,
    })

    const spool = getCliHookSpoolPath('conv-1')
    mkdirSync(dirname(spool), { recursive: true })

    // A stray Stop from a superseded turn — no UserPromptSubmit seen yet.
    appendFileSync(spool, `${JSON.stringify({
      conversationId: 'conv-1', hookEventName: 'Stop',
      payload: { hook_event_name: 'Stop', last_assistant_message: 'stray' },
    })}\n`)
    vi.advanceTimersByTime(100)
    expect(stops).toEqual([])
    expect(monitor.sawStop()).toBe(false)

    // This turn's prompt, then its Stop — now it counts.
    appendFileSync(spool, `${JSON.stringify({
      conversationId: 'conv-1', hookEventName: 'UserPromptSubmit',
      payload: { hook_event_name: 'UserPromptSubmit', prompt: 'go' },
    })}\n`)
    appendFileSync(spool, `${JSON.stringify({
      conversationId: 'conv-1', hookEventName: 'Stop',
      payload: { hook_event_name: 'Stop', last_assistant_message: 'real' },
    })}\n`)
    vi.advanceTimersByTime(100)
    expect(stops).toEqual(['real'])
    expect(monitor.sawStop()).toBe(true)

    monitor.stop()
    vi.useRealTimers()
  })

  it('reassembles a multibyte UTF-8 prompt split across a read boundary', () => {
    vi.useFakeTimers()
    const prompts: (string | undefined)[] = []
    const monitor = startCliHookMonitor({
      conversationId: 'conv-1',
      emit: (event) => {
        if (event.type === 'cli_prompt_submitted') prompts.push(typeof event.prompt === 'string' ? event.prompt : undefined)
      },
    })

    const spool = getCliHookSpoolPath('conv-1')
    mkdirSync(dirname(spool), { recursive: true })

    const line = `${JSON.stringify({
      conversationId: 'conv-1', hookEventName: 'UserPromptSubmit',
      payload: { hook_event_name: 'UserPromptSubmit', prompt: '안녕하세요' },
    })}\n`
    const buf = Buffer.from(line, 'utf-8')
    // Split immediately after the lead byte of a 3-byte char → mid-character.
    let splitAt = buf.length
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] >= 0xe0) { splitAt = i + 1; break }
    }

    appendFileSync(spool, buf.subarray(0, splitAt))
    vi.advanceTimersByTime(100)
    expect(prompts).toEqual([]) // partial line, not yet emitted

    appendFileSync(spool, buf.subarray(splitAt))
    vi.advanceTimersByTime(100)
    expect(prompts).toEqual(['안녕하세요'])

    monitor.stop()
    vi.useRealTimers()
  })
})
