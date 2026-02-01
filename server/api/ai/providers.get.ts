import { listProviderMetadata } from '~/server/utils/aiProviderRegistry'

export default defineEventHandler(async () => {
  return {
    providers: await listProviderMetadata(),
  }
})
