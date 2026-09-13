import type { ProviderId } from '~/types/session'

export function buildSpeckitCommand(provider: ProviderId | undefined, step: string, featureId: string) {
  const command = provider === 'codex' ? `$speckit-${step}` : `/speckit.${step}`
  return `${command} ${featureId}`
}
