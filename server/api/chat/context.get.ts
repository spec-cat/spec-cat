import { getQuery } from 'h3'
import { buildChatContextDiagnostics } from '~/server/utils/contextDiagnostics'

export default defineEventHandler((event) => {
  const query = getQuery(event)

  return buildChatContextDiagnostics({
    cwd: typeof query.cwd === 'string' ? query.cwd : undefined,
    featureId: typeof query.featureId === 'string' ? query.featureId : undefined,
    providerId: typeof query.providerId === 'string' ? query.providerId : undefined,
    providerModelKey: typeof query.providerModelKey === 'string' ? query.providerModelKey : undefined,
    providerSessionId: typeof query.providerSessionId === 'string' ? query.providerSessionId : undefined,
    permissionMode: typeof query.permissionMode === 'string' ? query.permissionMode : undefined,
  })
})
