#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const HELP = `spec-cat - local web terminal for AI CLI conversations

Usage: spec-cat [options]

Options:
  -p, --port <port>     Port to listen on (default: 3000)
  -H, --host <host>     Host to bind (default: 127.0.0.1)
      --project <dir>   Project directory to operate on
                        (sets SPEC_CAT_PROJECT_DIR)
  -h, --help            Show this help message
`

function fail(message) {
  console.error(`spec-cat: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { port: 3000, host: '127.0.0.1', project: undefined }

  const takeValue = (flag, inlineValue, next) => {
    if (inlineValue !== undefined) return inlineValue.value
    const value = next()
    if (value === undefined) fail(`missing value for ${flag}`)
    return value
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    let flag = arg
    let inlineValue
    const eq = arg.indexOf('=')
    if (arg.startsWith('--') && eq !== -1) {
      flag = arg.slice(0, eq)
      inlineValue = { value: arg.slice(eq + 1) }
    }

    switch (flag) {
      case '-h':
      case '--help':
        console.log(HELP)
        process.exit(0)
        break
      case '-p':
      case '--port': {
        const raw = takeValue(flag, inlineValue, next)
        const port = Number(raw)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          fail(`invalid port: ${raw}`)
        }
        options.port = port
        break
      }
      case '-H':
      case '--host':
        options.host = takeValue(flag, inlineValue, next)
        break
      case '--project':
        options.project = takeValue(flag, inlineValue, next)
        break
      default:
        fail(`unknown option: ${arg}\n\n${HELP}`)
    }
  }

  return options
}

const options = parseArgs(process.argv.slice(2))

if (options.project !== undefined) {
  const projectDir = resolve(process.cwd(), options.project)
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    fail(`project directory does not exist: ${projectDir}`)
  }
  process.env.SPEC_CAT_PROJECT_DIR = projectDir
}

// Nitro's node-server preset reads NITRO_PORT/NITRO_HOST first and falls
// back to PORT/HOST, so set both pairs.
process.env.NITRO_PORT = String(options.port)
process.env.PORT = String(options.port)
process.env.NITRO_HOST = options.host
process.env.HOST = options.host

const serverEntry = resolve(packageRoot, '.output/server/index.mjs')
if (!existsSync(serverEntry)) {
  fail(`built server not found at ${serverEntry}\nBuild the project first (run: bun run build)`)
}

await import(pathToFileURL(serverEntry).href)
