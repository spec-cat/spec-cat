#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SCENARIOS = [10, 30, 50]
const RUNS_PER_SCENARIO = 7
const ENVELOPE_MS = {
  10: 140,
  30: 220,
  50: 320,
}

async function runGit(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
  })
  return stdout.trim()
}

async function setupRepo(scBranchCount) {
  const root = await mkdtemp(join(tmpdir(), 'spec-cat-branch-bench-'))

  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.name', 'Spec Cat Bench'])
  await runGit(root, ['config', 'user.email', 'bench@example.com'])

  await writeFile(join(root, 'README.md'), '# bench\n', 'utf8')
  await runGit(root, ['add', 'README.md'])
  await runGit(root, ['commit', '-m', 'initial'])

  await runGit(root, ['branch', 'develop'])
  await runGit(root, ['branch', 'release/1.0.0'])

  for (let i = 1; i <= scBranchCount; i++) {
    const n = String(i).padStart(3, '0')
    await runGit(root, ['branch', `sc/conv-${n}`])
  }

  return root
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

async function measureBranchesQuery(cwd, excludeSc) {
  const start = process.hrtime.bigint()
  const output = await runGit(cwd, [
    'for-each-ref',
    'refs/heads',
    '--format=%(HEAD)%09%(refname)%09%(refname:short)%09%(objectname)%09%(upstream:short)%09%(committerdate:iso-strict)',
  ])

  const branches = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [_headMarker, _refName, shortName, _tip, _upstreamShort, _date] = line.split('\t')
      return shortName
    })
    .filter((name) => Boolean(name))
    .filter((name) => !excludeSc || !name.startsWith('sc/'))

  const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000
  return { elapsedMs, branchCount: branches.length }
}

async function runScenario(scBranchCount) {
  const repo = await setupRepo(scBranchCount)
  try {
    await measureBranchesQuery(repo, true)

    const samples = []
    let lastBranchCount = 0
    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      const { elapsedMs, branchCount } = await measureBranchesQuery(repo, true)
      samples.push(elapsedMs)
      lastBranchCount = branchCount
    }

    const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
    const p95Ms = percentile(samples, 95)
    const budgetMs = ENVELOPE_MS[scBranchCount]

    return {
      scBranchCount,
      returnedBranchCount: lastBranchCount,
      averageMs,
      p95Ms,
      budgetMs,
      pass: averageMs <= budgetMs,
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}

async function main() {
  console.log('Branch API benchmark (excludeSc=true)')
  console.log(`Runs per scenario: ${RUNS_PER_SCENARIO}`)
  console.log('')
  console.log('| sc/* branches | returned branches | avg (ms) | p95 (ms) | target avg (ms) | status |')
  console.log('| --- | --- | ---: | ---: | ---: | --- |')

  let allPass = true
  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario)
    allPass = allPass && result.pass
    const status = result.pass ? 'PASS' : 'FAIL'
    console.log(
      `| ${result.scBranchCount} | ${result.returnedBranchCount} | ${result.averageMs.toFixed(1)} | ` +
      `${result.p95Ms.toFixed(1)} | ${result.budgetMs} | ${status} |`
    )
  }

  if (!allPass) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error)
  process.exitCode = 1
})
