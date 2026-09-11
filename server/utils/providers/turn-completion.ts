import type { ProviderId } from '../session-store'
import { isClaudeTurnComplete } from './claude-turn'
import { isCodexTurnComplete } from './codex-turn'
import { isAgyTurnComplete } from './agy-turn'

export function isProviderTurnComplete(provider: ProviderId, screen: string) {
  if (provider === 'codex') return isCodexTurnComplete(screen)
  if (provider === 'agy') return isAgyTurnComplete(screen)
  return isClaudeTurnComplete(screen)
}
