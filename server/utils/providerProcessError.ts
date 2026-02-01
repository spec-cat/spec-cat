function flattenOutputLines(nonJsonOutput: string[]): string[] {
  const lines: string[] = []
  for (const chunk of nonJsonOutput) {
    for (const rawLine of chunk.split(/\r?\n/g)) {
      const line = rawLine.trim()
      if (line) {
        lines.push(line)
      }
    }
  }
  return lines
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

  const codexRolloutHint = buildCodexRolloutPathHint(lines)
  if (codexRolloutHint) {
    return codexRolloutHint.slice(0, maxLen)
  }

  const fatalLine = lines.find(line => /^Error:/.test(line)) || lines[lines.length - 1]
  return fatalLine.slice(0, maxLen)
}
