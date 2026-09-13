import type { ProviderId } from './session-store'

const RESUME_SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isProviderSessionId(value: string): boolean {
  return RESUME_SESSION_ID_RE.test(value)
}

/** Builds the exact interactive CLI command launched inside tmux. */
export function buildProviderCommand(provider: ProviderId, resumeSessionId?: string | null): string {
  if (provider === 'codex') {
    const bin = process.env.CODEX_CLI_PATH || process.env.CODEX_BIN || 'codex'
    if (!resumeSessionId) return `${bin} --dangerously-bypass-approvals-and-sandbox`
    return `${bin} resume ${quoteResumeSessionId(resumeSessionId)} --dangerously-bypass-approvals-and-sandbox`
  }
  if (provider === 'agy') {
    const bin = process.env.AGY_BIN || process.env.AGY_CLI_PATH || 'agy'
    if (!resumeSessionId) return `${bin} --dangerously-skip-permissions`
    return `${bin} --conversation ${quoteResumeSessionId(resumeSessionId)} --dangerously-skip-permissions`
  }

  const bin = process.env.CLAUDE_BIN || 'claude'
  if (!resumeSessionId) return `${bin} --dangerously-skip-permissions`
  return `${bin} --resume ${quoteResumeSessionId(resumeSessionId)} --dangerously-skip-permissions`
}

/** Builds the exact command for an isolated one-shot provider query. */
export function buildProviderQueryCommand(provider: ProviderId, claudeSessionId: string): string {
  if (provider === 'codex') return buildProviderCommand('codex')
  if (provider === 'agy') return buildProviderCommand('agy')
  const bin = process.env.CLAUDE_BIN || 'claude'
  return `${bin} --session-id ${quoteResumeSessionId(claudeSessionId)} --dangerously-skip-permissions`
}

function quoteResumeSessionId(resumeSessionId: string): string {
  if (!isProviderSessionId(resumeSessionId)) {
    throw new Error(`Invalid provider resume session id: ${JSON.stringify(resumeSessionId)}`)
  }
  return `'${resumeSessionId}'`
}
