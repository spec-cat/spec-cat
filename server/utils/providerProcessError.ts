const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/g

function flattenOutputLines(nonJsonOutput: string[]): string[] {
  const lines: string[] = []
  for (const chunk of nonJsonOutput) {
    for (const rawLine of chunk.split(/\r?\n/g)) {
      const line = rawLine.replace(ANSI_ESCAPE_PATTERN, '').trim()
      if (line) {
        lines.push(line)
      }
    }
  }
  return lines
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const normalized = line.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(line)
  }
  return unique
}

function buildCodexPermissionHint(lines: string[]): string | null {
  const arg0Permission = lines.find(line =>
    /failed to clean up stale arg0 temp dirs: Permission denied/i.test(line),
  )
  if (arg0Permission) {
    return `${arg0Permission} Fix ownership with: sudo chown -R $(whoami) ~/.codex`
  }

  const cannotAccess = lines.find(line =>
    /codex cannot access session files/i.test(line),
  )
  if (!cannotAccess) {
    const recorderPermission = lines.find(line =>
      /failed to initialize rollout recorder: Permission denied/i.test(line),
    )
    if (recorderPermission) {
      return `${recorderPermission} Fix ownership with: sudo chown -R $(whoami) ~/.codex`
    }

    const createSessionPermission = lines.find(line =>
      /failed to create session: Permission denied/i.test(line),
    )
    if (createSessionPermission) {
      return `${createSessionPermission} Fix ownership with: sudo chown -R $(whoami) ~/.codex`
    }

    const codexPathPermission = lines.find(line =>
      /\/\.codex\/.*permission denied/i.test(line),
    )
    if (codexPathPermission) {
      return `${codexPathPermission} Fix ownership with: sudo chown -R $(whoami) ~/.codex`
    }

    return null
  }

  return `${cannotAccess} Fix ownership with: sudo chown -R $(whoami) ~/.codex`
}

function buildCodexRolloutPathHint(lines: string[]): string | null {
  const missingRolloutPath = lines.find(line =>
    /state db missing rollout path for thread/i.test(line),
  )
  if (!missingRolloutPath) {
    return null
  }

  return `${missingRolloutPath} Retry with a fresh session (clear provider session and resend).`
}

function buildCodexConnectivityHint(lines: string[]): string | null {
  const disconnected = lines.find(line =>
    /stream disconnected before completion/i.test(line),
  )
  if (disconnected) {
    return `${disconnected} Verify internet access and Codex auth (try: codex login).`
  }

  const sendingRequestError = lines.find(line =>
    /error sending request for url/i.test(line),
  )
  if (sendingRequestError) {
    return `${sendingRequestError} Verify internet access and Codex auth (try: codex login).`
  }

  return null
}

function buildAuthHint(lines: string[]): string | null {
  const authLine = lines.find(line =>
    /unauthorized|forbidden|invalid api key|authentication failed|not logged in|api key/i.test(line),
  )
  if (!authLine) {
    return null
  }

  if (/codex/i.test(authLine)) {
    return `${authLine} Re-authenticate with: codex login`
  }

  if (/claude/i.test(authLine)) {
    return `${authLine} Re-authenticate with: claude login`
  }

  return `${authLine} Re-authenticate your CLI session and verify credentials.`
}

function buildGenericActionableHint(lines: string[]): string | null {
  const actionable = uniqueLines(lines.filter(line =>
    /(^error\b)|\berror:|\bfailed\b|permission denied|eacces|enoent|spawn|timeout|timed out|network|dns|econn|socket|rate limit|too many requests|aborted|killed|signal|unable to/i.test(line),
  ))

  if (actionable.length === 0) {
    return null
  }

  return actionable.slice(0, 3).join(' | ')
}

export function hasCodexMissingRolloutPathError(nonJsonOutput: string[]): boolean {
  const lines = flattenOutputLines(nonJsonOutput)
  return lines.some(line => /state db missing rollout path for thread/i.test(line))
}

export function hasCodexPermissionError(nonJsonOutput: string[]): boolean {
  const lines = flattenOutputLines(nonJsonOutput)
  return lines.some(line =>
    /failed to clean up stale arg0 temp dirs: Permission denied/i.test(line)
    || /codex cannot access session files/i.test(line)
    || /failed to initialize rollout recorder: Permission denied/i.test(line)
    || /failed to create session: Permission denied/i.test(line)
    || /\/\.codex\/.*permission denied/i.test(line),
  )
}

export function summarizeProviderProcessError(nonJsonOutput: string[], maxLen = 300): string {
  const lines = flattenOutputLines(nonJsonOutput)
  if (lines.length === 0) {
    return ''
  }

  const codexPermissionHint = buildCodexPermissionHint(lines)
  if (codexPermissionHint) {
    return codexPermissionHint.slice(0, maxLen)
  }

  const codexConnectivityHint = buildCodexConnectivityHint(lines)
  if (codexConnectivityHint) {
    return codexConnectivityHint.slice(0, maxLen)
  }

  const authHint = buildAuthHint(lines)
  if (authHint) {
    return authHint.slice(0, maxLen)
  }

  const codexRolloutHint = buildCodexRolloutPathHint(lines)
  if (codexRolloutHint) {
    return codexRolloutHint.slice(0, maxLen)
  }

  const actionableHint = buildGenericActionableHint(lines)
  if (actionableHint) {
    return actionableHint.slice(0, maxLen)
  }

  const fatalLine = lines.find(line => /^Error:/i.test(line)) || lines[lines.length - 1]
  return fatalLine.slice(0, maxLen)
}
