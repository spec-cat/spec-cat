import { exec, execSync, execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { getProjectDir } from './projectDir'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export const GIT_MAX_BUFFER = 1024 * 1024 * 10 // 10MB

/**
 * Execute a git command synchronously (simple string command)
 */
export function execGit(cwd: string, command: string): string {
  try {
    const output = execSync(`git ${command}`, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
      encoding: 'utf-8'
    })
    return output.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

/**
 * Execute a git command synchronously with argument array (shell-injection safe)
 */
export function execGitArgs(cwd: string, args: string[]): string {
  try {
    const output = execFileSync('git', args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
      encoding: 'utf-8'
    })
    return output.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

/**
 * Execute a git command safely with proper error handling
 */
export async function execGitCommand(
  args: string[],
  cwd: string = getProjectDir()
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER
    })
    return stdout.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}
