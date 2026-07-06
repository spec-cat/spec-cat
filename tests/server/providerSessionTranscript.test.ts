import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeClaudeProjectDir } from '~/server/utils/claudeSession'
import { readProviderSessionMarkedText } from '~/server/utils/providerSessionTranscript'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalCodexHome = process.env.CODEX_HOME

afterEach(() => {
  process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  process.env.CODEX_HOME = originalCodexHome
})

describe('readProviderSessionMarkedText', () => {
  it('reads marked Claude assistant text without PTY rendering loss', () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-cat-claude-transcript-'))
    const cwd = '/tmp/spec-cat-worktree'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const projectDir = join(root, 'projects', encodeClaudeProjectDir(cwd))
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, `${sessionId}.jsonl`),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{
            type: 'text',
            text: [
              '===BEGIN===',
              'feat(c): 재고 현황 페이지 DataGrid 표시 개선',
              '',
              'CurrentInventoryPage의 조회 로직과 레이아웃을 정리하고',
              'DataGrid 컴포넌트의 렌더링 및 컬럼 처리를 개선했다.',
              '===FINISH===',
            ].join('\n'),
          }],
        },
      }),
    )

    process.env.CLAUDE_CONFIG_DIR = root

    expect(readProviderSessionMarkedText({
      providerId: 'claude',
      cwd,
      providerSessionId: sessionId,
      startMarker: '===BEGIN===',
      endMarker: '===FINISH===',
    })).toBe([
      'feat(c): 재고 현황 페이지 DataGrid 표시 개선',
      '',
      'CurrentInventoryPage의 조회 로직과 레이아웃을 정리하고',
      'DataGrid 컴포넌트의 렌더링 및 컬럼 처리를 개선했다.',
    ].join('\n'))

    rmSync(root, { recursive: true, force: true })
  })

  it('reads marked Codex assistant text from rollout jsonl', () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-cat-codex-transcript-'))
    const sessionId = '22222222-2222-4222-8222-222222222222'
    const sessionDir = join(root, 'sessions', '2026', '07', '06')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(
      join(sessionDir, `rollout-2026-07-06T12-00-00-${sessionId}.jsonl`),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: [
              '===BEGIN===',
              'fix(c): 재고 현황 커밋 메시지 공백 보존',
              '',
              '대화형 세션 원문에서 응답을 읽어 한글 공백을 유지한다.',
              '===FINISH===',
            ].join('\n'),
          }],
        },
      }),
    )

    process.env.CODEX_HOME = root

    expect(readProviderSessionMarkedText({
      providerId: 'codex',
      cwd: '/tmp/unused',
      providerSessionId: sessionId,
      startMarker: '===BEGIN===',
      endMarker: '===FINISH===',
    })).toBe([
      'fix(c): 재고 현황 커밋 메시지 공백 보존',
      '',
      '대화형 세션 원문에서 응답을 읽어 한글 공백을 유지한다.',
    ].join('\n'))

    rmSync(root, { recursive: true, force: true })
  })
})
