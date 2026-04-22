import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', rejectPromise)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'}${signal ? ` (signal: ${signal})` : ''}`))
    })
  })
}

for (const relativePath of ['.nuxt', '.output']) {
  rmSync(resolve(rootDir, relativePath), { recursive: true, force: true })
}

await run(pnpmCmd, ['run', 'build:nuxt'])
await run(process.execPath, [resolve(__dirname, 'verify-built-app.mjs')])
