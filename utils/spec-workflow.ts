import type { ProviderId } from '~/server/utils/session-store'

export function buildSpeckitCommand(provider: ProviderId | undefined, step: string, featureId: string) {
  const command = provider === 'codex' ? `$speckit-${step}` : `/speckit.${step}`
  return `${command} ${featureId}`
}
