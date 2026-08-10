import { describe, expect, test } from 'bun:test'
import { buildCommitMessagePrompt, sanitizeCommitMessage } from '../server/utils/provider-query'

// These tests cover only the pure helpers — they never invoke the provider
// CLIs. runProviderQuery is exercised manually against the real binaries.

describe('sanitizeCommitMessage', () => {
  test('strips a wrapping markdown fence', () => {
    const raw = '```\nfeat: add provider queries\n\n- run CLIs headlessly\n- add commit message endpoint\n```'
    expect(sanitizeCommitMessage(raw)).toBe(
      'feat: add provider queries\n\n- run CLIs headlessly\n- add commit message endpoint'
    )
  })

  test('strips a language-tagged fence with surrounding whitespace', () => {
    const raw = '\n```text\nfix: stabilize terminal resizing\n```\n'
    expect(sanitizeCommitMessage(raw)).toBe('fix: stabilize terminal resizing')
  })

  test('drops a "Commit message:" preamble on its own line', () => {
    const raw = 'Commit message:\nfeat: add session preview workflow'
    expect(sanitizeCommitMessage(raw)).toBe('feat: add session preview workflow')
  })

  test('drops a conversational "Here\'s the commit message:" preamble', () => {
    const raw = "Here's the commit message:\n\nchore: bump dependencies\n\n- update nuxt"
    expect(sanitizeCommitMessage(raw)).toBe('chore: bump dependencies\n\n- update nuxt')
  })

  test('drops an inline preamble on the same line as the subject', () => {
    const raw = 'Commit message: fix: harden session workflows'
    expect(sanitizeCommitMessage(raw)).toBe('fix: harden session workflows')
  })

  test('removes quotes wrapping the whole message', () => {
    expect(sanitizeCommitMessage('"feat: add one-shot provider queries"')).toBe(
      'feat: add one-shot provider queries'
    )
    expect(sanitizeCommitMessage('“feat: add one-shot provider queries”')).toBe(
      'feat: add one-shot provider queries'
    )
  })

  test('keeps unbalanced or interior quotes intact', () => {
    expect(sanitizeCommitMessage('fix: quote "worktree" paths correctly')).toBe(
      'fix: quote "worktree" paths correctly'
    )
  })

  test('collapses runs of blank lines down to a single blank line', () => {
    const raw = 'feat: add archive search\n\n\n\n- index titles\n\n\n- match providers'
    expect(sanitizeCommitMessage(raw)).toBe('feat: add archive search\n\n- index titles\n\n- match providers')
  })

  test('collapses blank lines that contain only whitespace', () => {
    const raw = 'feat: subject\n \n\t\n\n- body bullet'
    expect(sanitizeCommitMessage(raw)).toBe('feat: subject\n\n- body bullet')
  })

  test('returns already-clean input unchanged', () => {
    const clean = 'refactor: extract provider query helper\n\n- share CLI resolution with resume'
    expect(sanitizeCommitMessage(clean)).toBe(clean)
  })

  test('handles fence, preamble, and quotes together', () => {
    const raw = '```\nCommit message:\n"feat: draft squash messages"\n```'
    expect(sanitizeCommitMessage(raw)).toBe('feat: draft squash messages')
  })

  test('returns an empty string for whitespace-only input', () => {
    expect(sanitizeCommitMessage('   \n\n  ')).toBe('')
  })
})

describe('buildCommitMessagePrompt', () => {
  const diffStat = ' server/utils/provider-query.ts | 120 ++++++++\n 1 file changed, 120 insertions(+)'
  const diffSample = 'diff --git a/server/utils/provider-query.ts b/server/utils/provider-query.ts\n+export function runProviderQuery() {}'
  const prompt = buildCommitMessagePrompt(diffStat, diffSample, 'main')

  test('embeds the diff stat, diff sample, and base branch', () => {
    expect(prompt).toContain(diffStat)
    expect(prompt).toContain(diffSample)
    expect(prompt).toContain('"main"')
  })

  test('asks for a conventional-commit subject within 72 characters', () => {
    expect(prompt).toContain('72 characters')
    expect(prompt.toLowerCase()).toContain('imperative')
    expect(prompt.toLowerCase()).toContain('conventional-commit')
  })

  test('demands the bare commit message with no fences or preamble', () => {
    expect(prompt).toContain('ONLY the commit message')
    expect(prompt.toLowerCase()).toContain('no markdown fences')
    expect(prompt.toLowerCase()).toContain('no preamble')
  })
})
