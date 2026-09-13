import { basename } from 'node:path'
import { readGit } from '../../utils/git-process'
import { projectDir } from '../../utils/project-dir'

export default defineEventHandler(async () => {
  const root = projectDir()
  const stdout = await readGit(root, [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads'
  ], { trim: false, maxBuffer: 1024 * 1024 })

  const branches = stdout
    .split('\n')
    .map((branch) => branch.trim())
    .filter((branch) => branch && !branch.startsWith('sc/'))

  return {
    projectName: basename(root),
    branches,
    providers: [
      {
        id: 'claude',
        name: 'Claude Code'
      },
      {
        id: 'codex',
        name: 'OpenAI Codex'
      },
      {
        id: 'agy',
        name: 'Antigravity'
      }
    ]
  }
})
