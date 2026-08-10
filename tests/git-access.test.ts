import { describe, expect, test } from 'bun:test'
import { requireObjectName, requireRef, requireRemote } from '../server/utils/git-access'

describe('Git argument validation', () => {
  test('accepts normal refs, object names, and remotes', () => {
    expect(requireRef('feature/session-fix', 'branch')).toBe('feature/session-fix')
    expect(requireObjectName('HEAD~2', 'hash')).toBe('HEAD~2')
    expect(requireRemote('origin')).toBe('origin')
  })

  test.each(['--upload-pack=evil', '-D', 'bad ref', 'topic..other'])('rejects unsafe refs: %s', (value) => {
    expect(() => requireRef(value, 'branch')).toThrow()
  })

  test.each(['--exec=evil', '-HEAD', 'HEAD..main'])('rejects unsafe object names: %s', (value) => {
    expect(() => requireObjectName(value, 'hash')).toThrow()
  })

  test.each(['--mirror', 'origin/path', 'bad remote'])('rejects unsafe remotes: %s', (value) => {
    expect(() => requireRemote(value)).toThrow()
  })
})
