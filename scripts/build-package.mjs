import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const require = createRequire(import.meta.url)

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

function copyDirectoryIfExists(source, destination) {
  if (!existsSync(source)) return false

  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, force: true, verbatimSymlinks: true })
  return true
}

function copyNodePtyNativeAssets() {
  const sourceRoot = dirname(require.resolve('node-pty/package.json'))
  const outputRoot = resolve(rootDir, '.output/server/node_modules/node-pty')
  const platformPrebuild = `prebuilds/${process.platform}-${process.arch}`

  const copied = [
    copyDirectoryIfExists(resolve(sourceRoot, 'build'), resolve(outputRoot, 'build')),
    copyDirectoryIfExists(resolve(sourceRoot, platformPrebuild), resolve(outputRoot, platformPrebuild)),
  ]

  if (!copied.some(Boolean)) {
    throw new Error(`Could not find node-pty native assets in ${sourceRoot}`)
  }
}

for (const relativePath of ['.nuxt', '.output']) {
  rmSync(resolve(rootDir, relativePath), { recursive: true, force: true })
}

await run(pnpmCmd, ['run', 'build:nuxt'])
copyNodePtyNativeAssets()
await run(process.execPath, [resolve(__dirname, 'verify-built-app.mjs')])
