import { getSpecWorkflow } from '../../../utils/spec-workflows'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^workflow-[a-zA-Z0-9-]{8,100}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid workflow id' })
  }
  const workflow = await getSpecWorkflow(id)
  if (!workflow) throw createError({ statusCode: 404, statusMessage: 'Workflow not found' })
  return { workflow }
})
