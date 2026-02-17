#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = resolve(__dirname, '..')
const serverEntry = resolve(packageRoot, '.output/server/index.mjs')

if (!existsSync(serverEntry)) {
  console.error('[spec-cat] Missing build output: .output/server/index.mjs')
  console.error('[spec-cat] Reinstall the package, or if developing locally run: pnpm build')
  process.exit(1)
}

const args = process.argv.slice(2)
const env = { ...process.env }
env.SPEC_CAT_PACKAGE_ROOT = packageRoot
const serverArgs = []

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: spec-cat [--port <number>] [--host <hostname>] [--project <path>]')
  console.log('')
  console.log('Options:')
  console.log('  -P, --port <number>     Port for the Spec Cat server')
  console.log('  -H, --host <hostname>   Host for the Spec Cat server')
  console.log('  -p, --project <path>    Project directory for Spec Cat')
  console.log('  -h, --help              Show this help message')
  process.exit(0)
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === '--') {
    serverArgs.push(...args.slice(i + 1))
    break
  }

  if (arg === '--port' || arg === '-P') {
    env.NITRO_PORT = args[i + 1]
    i += 1
    continue
  }

  if (arg.startsWith('--port=')) {
    env.NITRO_PORT = arg.slice('--port='.length)
    continue
  }

  if (arg === '--host' || arg === '-H') {
    env.NITRO_HOST = args[i + 1]
    i += 1
    continue
  }

  if (arg.startsWith('--host=')) {
    env.NITRO_HOST = arg.slice('--host='.length)
    continue
  }

  serverArgs.push(arg)
}

const child = spawn(process.execPath, [serverEntry, ...serverArgs], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
