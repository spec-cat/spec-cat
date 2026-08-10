import type { ProviderId } from '../session-store'
import { isClaudeTurnComplete } from './claude-turn'
import { isCodexTurnComplete } from './codex-turn'

export function isProviderTurnComplete(provider: ProviderId, screen: string) {
  return provider === 'codex'
    ? isCodexTurnComplete(screen)
    : isClaudeTurnComplete(screen)
}
