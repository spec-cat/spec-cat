import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCodexHooksJson, writeClaudeLocalSettings, writeCodexHooks } from '~/server/utils/cliHookInjection'

vi.mock('~/server/utils/projectDir', () => ({
  getProjectDir: () => '/tmp/spec-cat-test-project',
}))

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spec-cat-hooks-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('cliHookInjection', () => {
  it('builds Codex hook config for lifecycle events', () => {
    const config = buildCodexHooksJson('/tmp/spec-cat-hook-runner.cjs') as { hooks: Record<string, unknown[]> }

    expect(Object.keys(config.hooks)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PostToolUse',
      'PostToolUseFailure',
      'Stop',
      'SubagentStop',
    ])
    expect(JSON.stringify(config.hooks.Stop)).toContain('spec-cat-hook-runner.cjs')
  })

  it('writes Codex hooks into the supplied Codex home', () => {
    const dir = tempDir()
    writeCodexHooks(dir, '/tmp/spec-cat-hook-runner.cjs')

    const raw = readFileSync(join(dir, 'hooks.json'), 'utf-8')
    expect(raw).toContain('Stop')
    expect(raw).toContain('spec-cat-hook-runner.cjs')
  })

  it('merges Claude local settings without dropping existing hooks', () => {
    const dir = tempDir()
    writeClaudeLocalSettings(dir, '/tmp/spec-cat-hook-runner.cjs')
    writeClaudeLocalSettings(dir, '/tmp/spec-cat-hook-runner.cjs')

    const parsed = JSON.parse(readFileSync(join(dir, '.claude', 'settings.local.json'), 'utf-8'))
    expect(parsed.hooks.Stop).toHaveLength(1)
    expect(JSON.stringify(parsed.hooks.PostToolUse)).toContain('spec-cat-hook-runner.cjs')
  })
})
