import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun'
const require = createRequire(import.meta.url)

await run(bunCommand, ['run', 'build:nuxt'])
copyNodePtyNativeAssets()

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit'
    })

    child.on('error', rejectPromise)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(
        new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`)
      )
    })
  })
}

function copyNodePtyNativeAssets() {
  const sourceRoot = dirname(require.resolve('node-pty/package.json'))
  const outputRoot = resolve(rootDir, '.output/server/node_modules/node-pty')
  const candidates = [
    ['build', 'build'],
    [`prebuilds/${process.platform}-${process.arch}`, `prebuilds/${process.platform}-${process.arch}`]
  ]

  let copied = false
  for (const [sourcePath, outputPath] of candidates) {
    const source = resolve(sourceRoot, sourcePath)
    if (!existsSync(source)) continue

    const destination = resolve(outputRoot, outputPath)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(source, destination, { recursive: true, force: true })
    copied = true
  }

  if (!copied) {
    throw new Error(`Could not find node-pty native assets in ${sourceRoot}`)
  }
}
