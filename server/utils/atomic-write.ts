import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'

/** Writes beside the target and atomically replaces it without changing JSON shape. */
export async function writeJsonAtomic(target: string, value: unknown, mode?: number): Promise<void> {
  return writeTextAtomic(target, `${JSON.stringify(value, null, 2)}\n`, mode)
}

export async function writeTextAtomic(target: string, value: string, mode?: number): Promise<void> {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, value, {
      encoding: 'utf8',
      flag: 'wx',
      ...(mode === undefined ? {} : { mode })
    })
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}
