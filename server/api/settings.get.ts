export default defineEventHandler(async () => {
  return { settings: await readAppSettings() }
})
