import { describe, expect, test } from 'bun:test'
import { buildResolvePrompt, runResolutionLoop, type ResolutionDeps } from '../server/utils/conflict-resolver'

/**
 * Builds a scripted fake of the rebase environment. `conflictRounds` is a queue
 * of conflict-file lists returned by successive `listConflicts` calls that the
 * loop makes at the top of each iteration; the rebase is "in progress" until
 * the queue is drained. `runAgentTurn` clears the current conflicts by default.
 */
function makeDeps(overrides: Partial<ResolutionDeps> & { script: string[][] }): {
  deps: ResolutionDeps
  calls: { agentTurns: number; continues: number; skips: number; staged: number }
} {
  const script = overrides.script.slice()
  const calls = { agentTurns: 0, continues: 0, skips: 0, staged: 0 }
  // Conflicts currently on disk; agent turns clear them, listConflicts reveals
  // the next scripted state only after a rebase step advances.
  let current: string[] = script.shift() ?? []
  let inProgress = true

  const advance = () => {
    const next = script.shift()
    if (next === undefined) {
      inProgress = false
      current = []
    } else {
      current = next
    }
  }

  const deps: ResolutionDeps = {
    listConflicts: async () => current,
    rebaseInProgress: async () => inProgress,
    runAgentTurn: async () => {
      calls.agentTurns++
      current = [] // agent resolves the visible conflicts
      return { ok: true, message: 'resolved' }
    },
    stageAll: async () => {
      calls.staged++
    },
    continueRebase: async () => {
      calls.continues++
      advance()
      return current.length ? 'conflict' : inProgress ? 'empty' : 'done'
    },
    skipRebase: async () => {
      calls.skips++
      advance()
      return current.length ? 'conflict' : inProgress ? 'empty' : 'done'
    },
    ...overrides
  }
  return { deps, calls }
}

describe('buildResolvePrompt', () => {
  test('lists conflicts and forbids git commands', () => {
    const prompt = buildResolvePrompt(['a.ts', 'b.ts'], 'main')
    expect(prompt).toContain('onto "main"')
    expect(prompt).toContain('- a.ts')
    expect(prompt).toContain('- b.ts')
    expect(prompt).toContain('Do NOT run any git command')
  })
})

describe('runResolutionLoop', () => {
  test('resolves a single-round conflict and reports success', async () => {
    const { deps, calls } = makeDeps({ script: [['a.ts']] })
    const result = await runResolutionLoop(deps)
    expect(result.resolved).toBe(true)
    expect(result.rounds).toBe(1)
    expect(calls.agentTurns).toBe(1)
    expect(calls.continues).toBe(1)
    expect(calls.staged).toBe(1)
    expect(result.report).toContain('Round 1')
  })

  test('resolves conflicts across multiple rebase steps', async () => {
    const { deps, calls } = makeDeps({ script: [['a.ts'], ['b.ts']] })
    const result = await runResolutionLoop(deps)
    expect(result.resolved).toBe(true)
    expect(result.rounds).toBe(2)
    expect(calls.agentTurns).toBe(2)
  })

  test('skips an empty patch that leaves no conflicts', async () => {
    // First iteration sees no conflicts (empty patch) → skip advances to a real
    // conflict, which the agent then resolves.
    const { deps, calls } = makeDeps({ script: [[], ['a.ts']] })
    const result = await runResolutionLoop(deps)
    expect(result.resolved).toBe(true)
    expect(calls.skips).toBe(1)
    expect(calls.agentTurns).toBe(1)
  })

  test('gives up and reports remaining conflicts when the budget is exhausted', async () => {
    const deps: ResolutionDeps = {
      listConflicts: async () => ['stuck.ts'],
      rebaseInProgress: async () => true,
      runAgentTurn: async () => ({ ok: true, message: 'tried' }),
      stageAll: async () => {},
      // The agent never clears the conflict, so every round re-sees it.
      continueRebase: async () => 'conflict',
      skipRebase: async () => 'conflict'
    }
    const result = await runResolutionLoop(deps, 3)
    expect(result.resolved).toBe(false)
    expect(result.rounds).toBe(3)
    expect(result.remainingConflicts).toEqual(['stuck.ts'])
  })

  test('gives up when an agent turn fails', async () => {
    const { deps } = makeDeps({
      script: [['a.ts']],
      runAgentTurn: async () => ({ ok: false, error: 'tmux session is not running' })
    })
    const result = await runResolutionLoop(deps)
    expect(result.resolved).toBe(false)
    expect(result.report).toContain('tmux session is not running')
  })

  test('gives up when a rebase step hard-fails', async () => {
    let conflicts = ['a.ts']
    let continued = false
    const deps: ResolutionDeps = {
      listConflicts: async () => conflicts,
      rebaseInProgress: async () => true,
      runAgentTurn: async () => {
        conflicts = [] // agent clears the visible conflict so staging proceeds
        return { ok: true, message: 'resolved' }
      },
      stageAll: async () => {},
      continueRebase: async () => {
        continued = true
        return 'failed'
      },
      skipRebase: async () => 'failed'
    }
    const result = await runResolutionLoop(deps, 5)
    expect(result.resolved).toBe(false)
    expect(continued).toBe(true)
  })
})
