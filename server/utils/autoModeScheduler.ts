/**
 * Auto Mode Scheduler
 * Background service that processes spec units through the speckit workflow.
 * Singleton pattern — shared state, subscriber-based notifications.
 */

import { readdir, stat, writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { getProjectDir } from './projectDir'
import { loadSkill, renderPrompt } from './skillRegistry'
import { resolveWorktree, findWorktreeByFeature } from './worktreeResolver'
import { autoCommitChanges } from './claudeService'
import { logger } from './logger'
import { runClaudeCliStream } from './claude'
import { readAutoModeSpecState, writeAutoModeSpecState, type AutoModeSpecState, type AutoModeSpecStateEntry } from './autoModeSpecState'
import { getSpecCatDataDir } from './specCatStore'
import { getServerProviderSelection } from './aiProviderSelection'
import { getClaudeModelId } from './claudeModel'
import type {
  AutoModeSession,
  AutoModeTask,
  AutoModeTaskState,
  AutoModeWSMessage,
  AutoModePersistedSession,
} from '~/types/autoMode'

const log = logger.autoMode

/** Speckit steps to run per feature (stop before implement — spec updates only).
 *  Skips 'specify' because Auto Mode runs on features that already have specs.
 *  'skill:better-spec' validates spec documents and ensures cross-artifact consistency. */
const SPECKIT_STEPS = ['plan', 'tasks', 'skill:better-spec'] as const

/** Default concurrency for concurrent processing */
const DEFAULT_CONCURRENCY = 3

type Subscriber = (message: AutoModeWSMessage) => void

class AutoModeScheduler {
  private enabled = false
  private session: AutoModeSession | null = null
  private subscribers = new Set<Subscriber>()
  private abortController: AbortController | null = null
  private processing = false
  private concurrency = DEFAULT_CONCURRENCY
  private specHashCache: Record<string, string> = {}

  /** Get current enabled state */
  isEnabled(): boolean {
    return this.enabled
  }

  /** Get current session snapshot */
  getSession(): AutoModeSession | null {
    return this.session ? { ...this.session, tasks: [...this.session.tasks] } : null
  }

  /** Subscribe to status updates. Returns unsubscribe function. */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => { this.subscribers.delete(callback) }
  }

  /** Toggle Auto Mode on/off (T004: accepts concurrency parameter) */
  async toggle(enable: boolean, concurrency?: number): Promise<{ enabled: boolean }> {
    if (enable && !this.enabled) {
      this.enabled = true
      if (concurrency !== undefined && concurrency >= 1) {
        this.concurrency = Math.floor(concurrency)
      }
      log.info('Auto Mode enabled', { concurrency: this.concurrency })
      this.startProcessing()
    } else if (!enable && this.enabled) {
      this.enabled = false
      log.info('Auto Mode disabled — stopping new tasks, running tasks will complete')
      this.stopProcessing()
      // Don't delete persisted session here — processQueue handles cleanup
      // after all running tasks complete
    }
    this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
    return { enabled: this.enabled }
  }

  /** Restore session from persisted file on server startup (FR-015) */
  async restoreSession(): Promise<void> {
    try {
      const sessionPath = this.getSessionFilePath()
      if (!existsSync(sessionPath)) return

      const data = await readFile(sessionPath, 'utf-8')
      const persisted: AutoModePersistedSession = JSON.parse(data)

      const persistedTasks = persisted.tasks.filter(t => t.featureId !== 'constitution')
      const hasUnfinished = persistedTasks.some(t => t.state === 'queued' || t.state === 'running')
      if (persisted.enabled && persistedTasks.length > 0 && hasUnfinished) {
        this.enabled = true
        this.session = {
          id: persisted.sessionId,
          state: 'active',
          tasks: persistedTasks,
          startedAt: persisted.startedAt,
        }
        this.concurrency = DEFAULT_CONCURRENCY
        log.info('Auto Mode: restored persisted session', { sessionId: persisted.sessionId })

        // Broadcast immediately so connecting clients see the active state
        this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })

        // Resume processing unfinished tasks
        this.startProcessing()
      }
    } catch (e) {
      log.error('Auto Mode: failed to restore session', { error: String(e) })
    }
  }

  // ---- Internal ----

  private broadcast(message: AutoModeWSMessage) {
    for (const cb of this.subscribers) {
      try { cb(message) } catch (e) {
        log.error('Auto Mode subscriber error', { error: String(e) })
      }
    }
  }

  private async startProcessing() {
    if (this.processing) return

    // T029: Prevent re-scanning when toggle remains on but session is idle
    if (this.session && this.session.state === 'idle') {
      log.info('Auto Mode: Session is idle, not starting new cycle')
      return
    }

    this.processing = true
    this.abortController = new AbortController()

    try {
      await this.runCycle()
    } catch (e) {
      log.error('Auto Mode cycle failed', { error: String(e) })
    } finally {
      this.processing = false
    }
  }

  private stopProcessing() {
    // Don't abort running tasks — let them finish naturally.
    // Only cancel queued tasks that haven't started yet.
    if (this.session) {
      for (const task of this.session.tasks) {
        if (task.state === 'queued') {
          task.state = 'failed'
          task.error = 'Auto Mode disabled'
        }
      }

      // If no tasks are still running, finalize session immediately
      const hasRunning = this.session.tasks.some(t => t.state === 'running')
      if (!hasRunning) {
        this.session.state = 'stopped'
        this.session.completedAt = new Date().toISOString()
      }
      // Otherwise session stays 'active' until running tasks complete (handled in processQueue)

      this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
    }
  }

  /** Main processing cycle: discover features, queue them, process concurrently (T005: FR-013) */
  private async runCycle() {
    const projectDir = getProjectDir()

    // If session was restored, skip discovery and resume existing tasks
    if (this.session && this.session.tasks.some(t => t.state === 'queued' || t.state === 'running')) {
      log.info('Auto Mode: resuming restored session', { sessionId: this.session.id })
      // Reset any "running" tasks back to "queued" (they were interrupted)
      for (const task of this.session.tasks) {
        if (task.state === 'running') {
          task.state = 'queued'
          task.currentStep = undefined
        }
      }
      this.session.state = 'active'
      this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
      await this.persistSession()

      // Jump to concurrent processing with existing tasks
      return this.processQueue(projectDir)
    }

    const features = await this.discoverFeatures(projectDir)

    if (features.length === 0) {
      log.info('Auto Mode: no specs to process')
      this.session = {
        id: `auto-${Date.now()}`,
        state: 'idle',
        tasks: [],
        startedAt: new Date().toISOString(),
      }
      this.broadcast({ type: 'auto_mode_error', error: 'No specs to process' })
      this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
      return
    }

    // Create session (only if not restored)
    if (!this.session) {
      const allTasks: AutoModeTask[] = features.map(f => ({
        featureId: f,
        state: 'queued' as AutoModeTaskState,
      }))

      this.session = {
        id: `auto-${Date.now()}`,
        state: 'active',
        tasks: allTasks,
        startedAt: new Date().toISOString(),
      }
    }
    this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
    await this.persistSession()

    await this.processQueue(projectDir)

    this.processing = false
  }

  /** Process queued tasks concurrently and finalize session (T005: FR-013, R-003) */
  private async processQueue(projectDir: string) {
    if (!this.session) return

    const queue = this.session.tasks.filter(t => t.state === 'queued')

    // Use processWithConcurrency helper pattern from research.md R-003
    await this.processWithConcurrency(queue, this.concurrency, async (task) => {
      if (!this.enabled || this.abortController?.signal.aborted) {
        // Mark remaining queued tasks as failed (already done by stopProcessing)
        if (task.state === 'queued') {
          task.state = 'failed'
          task.error = 'Auto Mode disabled'
          this.broadcastTaskUpdate(task)
        }
        return
      }

      await this.processFeature(projectDir, task)
    })

    // Finalize session (T028: FR-017 — single cycle, transition to idle)
    const allDone = this.session.tasks.every(t =>
      t.state === 'completed' || t.state === 'skipped' || t.state === 'failed'
    )
    this.session.state = allDone && this.enabled ? 'idle' : 'stopped'
    this.session.completedAt = new Date().toISOString()
    this.broadcast({ type: 'auto_mode_status', session: this.getSession(), enabled: this.enabled })
    await this.deletePersistedSession()
  }

  /** Discover all feature directories under specs/ */
  private async discoverFeatures(projectDir: string): Promise<string[]> {
    const specsDir = join(projectDir, 'specs')
    if (!existsSync(specsDir)) return []

    const entries = await readdir(specsDir)
    const features: string[] = []
    const specState = await readAutoModeSpecState()
    this.specHashCache = {}

    for (const entry of entries) {
      const entryPath = join(specsDir, entry)
      const entryStat = await stat(entryPath)
      if (!entryStat.isDirectory()) continue

      // Must match NNN-name pattern and have a spec.md
      if (!/^\d{3}-.+$/.test(entry)) continue
      if (!existsSync(join(entryPath, 'spec.md'))) continue

      const specHash = await this.computeSpecHash(entryPath)
      this.specHashCache[entry] = specHash

      const previousHash = specState[entry]?.specHash
      if (previousHash && previousHash === specHash) {
        log.info('Auto Mode: skipping feature (spec hash unchanged)', { featureId: entry })
        continue
      }

      features.push(entry)
    }

    features.sort()
    log.info('Auto Mode: discovered features', { count: features.length, features })
    return features
  }

  private async computeSpecHash(specDir: string): Promise<string> {
    const hash = createHash('sha256')

    const walk = async (dir: string) => {
      const items = await readdir(dir, { withFileTypes: true })
      items.sort((a, b) => a.name.localeCompare(b.name))

      for (const item of items) {
        const fullPath = join(dir, item.name)
        if (item.isDirectory()) {
          await walk(fullPath)
          continue
        }
        if (item.isFile()) {
          const data = await readFile(fullPath)
          const rel = fullPath.replace(specDir, '')
          hash.update(rel)
          hash.update('\0')
          hash.update(data)
        }
      }
    }

    await walk(specDir)
    return hash.digest('hex')
  }

  /** Process a single feature through the speckit cascade (T007: FR-004, FR-008) */
  private async processFeature(projectDir: string, task: AutoModeTask) {
    // Skip if an active pipeline session is already running for this feature (FR-011, T011)
    const existingWorktree = await findWorktreeByFeature(projectDir, task.featureId)
    if (existingWorktree) {
      task.state = 'skipped'
      task.error = 'Active worktree already exists for this feature'
      log.info('Auto Mode: skipping feature (active worktree)', { featureId: task.featureId })
      this.broadcastTaskUpdate(task)
      await this.persistSession()
      return
    }

    task.state = 'running'
    task.startedAt = new Date().toISOString()
    this.broadcastTaskUpdate(task)
    await this.persistSession()

    try {
      // Create isolated worktree (FR-005)
      const worktreeInfo = await resolveWorktree(projectDir, task.featureId)
      task.worktreePath = worktreeInfo.path
      task.worktreeBranch = worktreeInfo.branch
      task.baseBranch = worktreeInfo.baseBranch
      this.broadcastTaskUpdate(task)

      // Run speckit steps sequentially (once started, runs to completion even if Auto Mode is disabled)
      for (const step of SPECKIT_STEPS) {
        task.currentStep = step
        this.broadcastTaskUpdate(task)
        this.broadcast({ type: 'auto_mode_step_start', featureId: task.featureId, step })

        await this.runSpeckitStep(worktreeInfo.path, task.featureId, step)
        await this.assertSpecsOnlyChanges(worktreeInfo.path, task.featureId)

        this.broadcast({ type: 'auto_mode_step_complete', featureId: task.featureId, step })

        // Auto-commit only files under specs/{featureId}
        await autoCommitChanges(worktreeInfo.path, task.featureId, {
          pathspecs: [`specs/${task.featureId}`],
        })
      }

      task.state = 'completed'
      task.completedAt = new Date().toISOString()
      task.currentStep = undefined
      log.info('Auto Mode: feature completed', { featureId: task.featureId })
      await this.updateSpecState(task.featureId, {
        specHash: this.specHashCache[task.featureId] || '',
        lastProcessedAt: task.completedAt,
      })
    } catch (e) {
      task.state = 'failed'
      task.error = e instanceof Error ? e.message : String(e)
      log.error('Auto Mode: feature failed', { featureId: task.featureId, error: task.error })
    }

    this.broadcastTaskUpdate(task)
    await this.persistSession()
  }

  /** Execute a single speckit command or skill via AI provider (Claude CLI for now) */
  private async runSpeckitStep(worktreePath: string, featureId: string, step: string): Promise<void> {
    const autoModeDirective = `You are running in Auto Mode. Do NOT ask questions or wait for user input. Make decisions aggressively and proceed autonomously. If you encounter ambiguity, use your best judgment and continue. Never use AskUserQuestion. Only edit files under specs/${featureId}/. Never modify files outside specs/. `

    let prompt: string
    if (step.startsWith('skill:')) {
      // Run a skill (e.g. 'skill:better-spec')
      const skillId = step.replace('skill:', '')
      prompt = await this.buildSkillPrompt(worktreePath, featureId, skillId, autoModeDirective)
    } else {
      prompt = `${autoModeDirective}/speckit.${step} ${featureId}`
    }
    log.info('Auto Mode: running speckit step', { featureId, step, cwd: worktreePath })

    const abortController = new AbortController()

    // Link to parent abort
    if (this.abortController) {
      this.abortController.signal.addEventListener('abort', () => abortController.abort())
    }

    const specState = await readAutoModeSpecState()
    const resumeSessionId = specState[featureId]?.sessionId
    let latestSessionId = resumeSessionId

    const selection = await getServerProviderSelection()
    if (selection.providerId !== 'claude') {
      log.warn('Auto Mode: provider does not support CLI streaming yet, falling back to Claude', { providerId: selection.providerId })
    }
    const modelId = getClaudeModelId(selection.modelKey)

    const result = await runClaudeCliStream({
      cwd: worktreePath,
      prompt,
      modelId,
      resumeSessionId,
      includePartial: true,
      abortSignal: abortController.signal,
      onMessage: (message) => {
        if ('session_id' in message && typeof message.session_id === 'string') {
          latestSessionId = message.session_id
        }
        this.broadcast({
          type: 'auto_mode_message',
          featureId,
          sdkMessage: message as any,
        })
      },
    })

    if (latestSessionId) {
      await this.updateSpecState(featureId, { sessionId: latestSessionId })
    }

    if (!result.success) {
      const details = [result.error || 'Claude CLI failed']
      if (result.text) {
        // Include last portion of CLI output for context
        const lastOutput = result.text.length > 500 ? '...' + result.text.slice(-500) : result.text
        details.push(`CLI output: ${lastOutput}`)
      }
      throw new Error(details.join('\n'))
    }

    log.info('Auto Mode: speckit step completed', { featureId, step })
  }

  /** Build a rendered skill prompt for Auto Mode execution */
  private async buildSkillPrompt(worktreePath: string, featureId: string, skillId: string, autoModeDirective: string): Promise<string> {
    const skill = await loadSkill(worktreePath, skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const specsDir = join(worktreePath, 'specs', featureId)
    let availableDocuments: string[] = []
    try {
      const entries = await readdir(specsDir, { withFileTypes: true })
      availableDocuments = entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => e.name)
    } catch {
      // Proceed with empty list if directory can't be read
    }

    const rendered = renderPrompt(skill, { featureId, specsDir, availableDocuments })
    return `${autoModeDirective}${rendered}`
  }

  private async updateSpecState(featureId: string, updates: Partial<AutoModeSpecStateEntry>) {
    const state = await readAutoModeSpecState()
    const current = state[featureId] || { specHash: this.specHashCache[featureId] || '' }
    state[featureId] = {
      ...current,
      ...updates,
      specHash: updates.specHash || current.specHash,
    }
    await writeAutoModeSpecState(state)
  }

  private getChangedFiles(worktreePath: string): string[] {
    const output = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf-8' }).trim()
    if (!output) return []

    return output
      .split('\n')
      .map(line => line.slice(3).trim())
      .map(path => path.includes(' -> ') ? path.split(' -> ').at(-1) || path : path)
      .filter(Boolean)
  }

  private async assertSpecsOnlyChanges(worktreePath: string, featureId: string): Promise<void> {
    const allowedPrefix = `specs/${featureId}/`
    const changedFiles = this.getChangedFiles(worktreePath)
    const invalidFiles = changedFiles.filter(path => !path.startsWith(allowedPrefix))
    if (invalidFiles.length === 0) return

    throw new Error(
      `Auto Mode generated changes outside ${allowedPrefix}: ${invalidFiles.join(', ')}`
    )
  }

  private broadcastTaskUpdate(task: AutoModeTask) {
    this.broadcast({ type: 'auto_mode_task_update', task: { ...task } })
  }

  /** Process tasks with concurrency control (T011: R-003) */
  private async processWithConcurrency<T>(
    queue: T[],
    concurrency: number,
    processor: (item: T) => Promise<void>
  ): Promise<void> {
    const active = new Set<Promise<void>>()

    for (const item of queue) {
      // Wait if we're at concurrency limit
      while (active.size >= concurrency) {
        await Promise.race(active)
      }

      const promise = processor(item)
        .finally(() => active.delete(promise))
      active.add(promise)
    }

    // Wait for all remaining tasks to complete
    await Promise.all(active)
  }

  // ---- Session Persistence (T006: FR-015, R-004) ----

  private getSessionFilePath(): string {
    return join(getSpecCatDataDir(), 'auto-mode-session.json')
  }

  private async persistSession(): Promise<void> {
    if (!this.session) return

    try {
      const sessionPath = this.getSessionFilePath()
      const dir = dirname(sessionPath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      const data: AutoModePersistedSession = {
        sessionId: this.session.id,
        enabled: this.enabled,
        tasks: this.session.tasks,
        startedAt: this.session.startedAt,
      }
      await writeFile(sessionPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      log.error('Auto Mode: failed to persist session', { error: String(e) })
    }
  }

  private async deletePersistedSession(): Promise<void> {
    try {
      const sessionPath = this.getSessionFilePath()
      if (existsSync(sessionPath)) {
        await unlink(sessionPath)
      }
    } catch (e) {
      log.error('Auto Mode: failed to delete persisted session', { error: String(e) })
    }
  }
}

/** Singleton instance */
export const autoModeScheduler = new AutoModeScheduler()
