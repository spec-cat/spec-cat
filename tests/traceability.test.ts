import { describe, expect, test } from 'bun:test'
import { analyzeTraceability, extractRequirementIds } from '../server/utils/traceability'

function specWith(ids: string[]) {
  return ids.map((id) => `- **${id}**: A testable requirement.`).join('\n')
}

describe('extractRequirementIds', () => {
  test('extracts plain, bold, and colon-suffixed requirement ids', () => {
    const spec = [
      '## Functional Requirements',
      '- **FR-001**: The system MUST list sessions.',
      '- FR-002: The system MUST persist metadata.',
      'See also FR-003 for details.',
      '| FR-004 | table cell |'
    ].join('\n')
    expect(extractRequirementIds(spec)).toEqual(['FR-001', 'FR-002', 'FR-003', 'FR-004'])
  })

  test('normalizes case and missing dash to upper-case FR-NNN', () => {
    expect(extractRequirementIds('fr-001 and FR002 and Fr-3')).toEqual(['FR-001', 'FR-002', 'FR-3'])
  })

  test('deduplicates repeated mentions while preserving order', () => {
    expect(extractRequirementIds('FR-002 FR-001 FR-002 **FR-001**')).toEqual(['FR-002', 'FR-001'])
  })

  test('ignores non-matching tokens', () => {
    expect(extractRequirementIds('FRX-001 XFR-002 FR-12345 FR- none')).toEqual([])
  })
})

describe('analyzeTraceability', () => {
  test('reports full coverage with no alerts and none risk', () => {
    const report = analyzeTraceability({
      spec: specWith(['FR-001', 'FR-002']),
      plan: 'Implements FR-001 and FR-002.',
      tasks: '- [ ] T001 covers FR-001\n- [x] T002 covers FR-002'
    })
    expect(report.requirements).toEqual([
      { id: 'FR-001', inPlan: true, inTasks: true },
      { id: 'FR-002', inPlan: true, inTasks: true }
    ])
    expect(report.counts).toEqual({ total: 2, coveredInPlan: 2, coveredInTasks: 2, uncovered: 0 })
    expect(report.alerts).toEqual([])
    expect(report.risk).toBe('none')
  })

  test('matches bold spec ids against plain mentions in plan and tasks', () => {
    const report = analyzeTraceability({
      spec: '- **FR-007**: Bold requirement.',
      plan: 'FR-007 is handled by the parser.',
      tasks: 'Covers fr-007 end to end.'
    })
    expect(report.requirements).toEqual([{ id: 'FR-007', inPlan: true, inTasks: true }])
    expect(report.risk).toBe('none')
  })

  test('treats missing plan and tasks files as zero coverage', () => {
    const report = analyzeTraceability({ spec: specWith(['FR-001', 'FR-002']) })
    expect(report.requirements).toEqual([
      { id: 'FR-001', inPlan: false, inTasks: false },
      { id: 'FR-002', inPlan: false, inTasks: false }
    ])
    expect(report.counts).toEqual({ total: 2, coveredInPlan: 0, coveredInTasks: 0, uncovered: 2 })
    expect(report.alerts).toEqual([
      'FR-001 not referenced in plan.md',
      'FR-001 not referenced in tasks.md',
      'FR-002 not referenced in plan.md',
      'FR-002 not referenced in tasks.md'
    ])
    expect(report.risk).toBe('high')
  })

  test('returns none risk and empty results when spec is missing or has no FRs', () => {
    for (const input of [{}, { spec: 'No requirements here.' }]) {
      const report = analyzeTraceability(input)
      expect(report.requirements).toEqual([])
      expect(report.counts).toEqual({ total: 0, coveredInPlan: 0, coveredInTasks: 0, uncovered: 0 })
      expect(report.alerts).toEqual([])
      expect(report.risk).toBe('none')
    }
  })

  test('emits a tasks alert when a requirement is only missing from tasks.md', () => {
    const report = analyzeTraceability({
      spec: specWith(['FR-001', 'FR-002', 'FR-003']),
      plan: 'FR-001 FR-002 FR-003',
      tasks: 'FR-001 FR-002'
    })
    expect(report.alerts).toEqual(['FR-003 not referenced in tasks.md'])
    expect(report.counts.uncovered).toBe(1)
  })

  test('risk is low when 20% or fewer requirements are uncovered in tasks', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `FR-${String(index + 1).padStart(3, '0')}`)
    const report = analyzeTraceability({
      spec: specWith(ids),
      plan: ids.join(' '),
      tasks: ids.slice(0, 9).join(' ')
    })
    expect(report.counts.coveredInTasks).toBe(9)
    expect(report.risk).toBe('low')
  })

  test('risk is medium when more than 20% are uncovered in tasks', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `FR-${String(index + 1).padStart(3, '0')}`)
    const report = analyzeTraceability({
      spec: specWith(ids),
      plan: ids.join(' '),
      tasks: ids.slice(0, 7).join(' ')
    })
    expect(report.counts.coveredInTasks).toBe(7)
    expect(report.risk).toBe('medium')
  })

  test('risk is high when more than half are uncovered in tasks', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `FR-${String(index + 1).padStart(3, '0')}`)
    const report = analyzeTraceability({
      spec: specWith(ids),
      plan: ids.join(' '),
      tasks: ids.slice(0, 4).join(' ')
    })
    expect(report.counts.coveredInTasks).toBe(4)
    expect(report.risk).toBe('high')
  })

  test('risk is low when tasks are fully covered but the plan has gaps', () => {
    const report = analyzeTraceability({
      spec: specWith(['FR-001', 'FR-002']),
      plan: 'FR-001',
      tasks: 'FR-001 FR-002'
    })
    expect(report.counts).toEqual({ total: 2, coveredInPlan: 1, coveredInTasks: 2, uncovered: 1 })
    expect(report.alerts).toEqual(['FR-002 not referenced in plan.md'])
    expect(report.risk).toBe('low')
  })
})
