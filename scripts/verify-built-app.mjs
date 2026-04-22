import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const serverEntry = resolve(rootDir, '.output/server/index.mjs')
const precomputedPath = resolve(rootDir, '.output/server/chunks/build/client.precomputed.mjs')

const forbiddenBuildMarkers = [
  { pattern: '/_nuxt/@vite/client', label: 'Vite dev client URL' },
  { pattern: '/_nuxt/@fs/', label: 'Vite @fs URL' },
  { pattern: '/_nuxt/home/', label: 'Linux absolute filesystem URL' },
  { pattern: '/_nuxt/Users/', label: 'macOS absolute filesystem URL' },
  { pattern: '/_nuxt/node_modules/', label: 'node_modules source URL' },
]

function delay(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

async function getFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()

    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectPromise(new Error('Could not allocate a free port for build verification'))
        return
      }

      server.close(error => {
        if (error) {
          rejectPromise(error)
          return
        }

        resolvePromise(address.port)
      })
    })
  })
}

function assertNoForbiddenMarkers(content, context) {
  for (const { pattern, label } of forbiddenBuildMarkers) {
    if (content.includes(pattern)) {
      throw new Error(`Found ${label} in ${context}: ${pattern}`)
    }
  }
}

async function fetchWithRetry(url, child, timeoutMs = 15000) {
  const start = Date.now()
  let lastError = null

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      break
    }

    try {
      const response = await fetch(url)
      if (response.ok) {
        return response
      }

      lastError = new Error(`Unexpected status ${response.status} for ${url}`)
    } catch (error) {
      lastError = error
    }

    await delay(250)
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`)
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) {
      return
    }

    await delay(100)
  }

  child.kill('SIGKILL')
}

if (!existsSync(serverEntry)) {
  throw new Error(`Missing server entry: ${serverEntry}`)
}

if (!existsSync(precomputedPath)) {
  throw new Error(`Missing client precomputed manifest: ${precomputedPath}`)
}

assertNoForbiddenMarkers(readFileSync(precomputedPath, 'utf8'), 'client.precomputed.mjs')

const port = await getFreePort()
const childLogs = []
const child = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  env: {
    ...process.env,
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const appendLog = chunk => {
  childLogs.push(String(chunk))
  if (childLogs.join('').length > 12000) {
    childLogs.splice(0, childLogs.length - 20)
  }
}

child.stdout?.on('data', appendLog)
child.stderr?.on('data', appendLog)

try {
  const origin = `http://127.0.0.1:${port}`
  const htmlResponse = await fetchWithRetry(origin, child)
  const html = await htmlResponse.text()

  assertNoForbiddenMarkers(html, 'rendered HTML')

  const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)
  if (!entryMatch) {
    throw new Error('Could not find the main module script in rendered HTML')
  }

  const entryUrl = new URL(entryMatch[1], origin).toString()
  const entryResponse = await fetch(entryUrl)
  if (!entryResponse.ok) {
    throw new Error(`Main client entry returned ${entryResponse.status}: ${entryUrl}`)
  }
} catch (error) {
  const logs = childLogs.join('').trim()
  const suffix = logs ? `\n\nBuild verification logs:\n${logs}` : ''
  throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`)
} finally {
  await stopChild(child)
}
