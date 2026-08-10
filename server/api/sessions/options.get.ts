import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { projectDir } from '../../utils/project-dir'

const execFileAsync = promisify(execFile)

export default defineEventHandler(async () => {
  const { stdout } = await execFileAsync('git', [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads'
  ], { cwd: projectDir(), encoding: 'utf8' })

  const branches = stdout
    .split('\n')
    .map((branch) => branch.trim())
    .filter((branch) => branch && !branch.startsWith('sc/'))

  return {
    branches,
    providers: [
      {
        id: 'claude',
        name: 'Claude Code'
      },
      {
        id: 'codex',
        name: 'OpenAI Codex'
      }
    ]
  }
})
