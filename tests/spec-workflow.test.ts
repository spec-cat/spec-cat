import { describe, expect, test } from 'bun:test'
import { buildSpeckitCommand } from '../utils/spec-workflow'

describe('Spec Kit provider commands', () => {
  test('uses Codex skill syntax', () => {
    expect(buildSpeckitCommand('codex', 'plan', '001-feature')).toBe('$speckit-plan 001-feature')
  })

  test('uses Claude slash-command syntax', () => {
    expect(buildSpeckitCommand('claude', 'plan', '001-feature')).toBe('/speckit.plan 001-feature')
  })

  test('uses AGY slash-command syntax', () => {
    expect(buildSpeckitCommand('agy', 'plan', '001-feature')).toBe('/speckit.plan 001-feature')
  })
})
