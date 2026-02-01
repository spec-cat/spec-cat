import type { IndexStatus } from '~/types/specSearch'
import { getSpecSearchStatus } from '../../utils/specSearch/scheduler'

export default defineEventHandler(async (): Promise<IndexStatus> => {
  return getSpecSearchStatus()
})
