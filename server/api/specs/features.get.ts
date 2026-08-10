import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { projectDir } from '../../utils/project-dir'

type SpecFile = {
  filename: string
  label: string
}

type Feature = {
  id: string
  name: string
  files: SpecFile[]
  hasSpec: boolean
  hasPlan: boolean
  hasTasks: boolean
  completedTasks: number
  totalTasks: number
}

const FILE_LABEL_MAP: Record<string, string> = {
  'spec.md': 'Spec',
  'plan.md': 'Plan',
  'tasks.md': 'Tasks',
  'data-model.md': 'Data Model',
  'research.md': 'Research',
  'quickstart.md': 'Quickstart'
}

function getFileLabel(filename: string) {
  if (FILE_LABEL_MAP[filename]) return FILE_LABEL_MAP[filename]
  if (filename.startsWith('checklists/')) {
    return `Checklist: ${filename.replace('checklists/', '').replace(/\.md$/, '')}`
  }
  if (filename.startsWith('contracts/')) {
    return `Contract: ${filename.replace('contracts/', '').replace(/\.md$/, '')}`
  }
  return filename.replace(/\.md$/, '')
}

function formatFeatureName(specContent: string, dirName: string) {
  const match = specContent.match(/^#\s+Feature Specification:\s*(.+)$/m)
  if (match?.[1]) return match[1].trim()
  return dirName
    .replace(/^\d+-/, '')
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function extractTaskProgress(tasksContent: string) {
  const checkboxLines = tasksContent.match(/^\s*-\s+\[(?: |x|X)\]\s+.+$/gm) ?? []
  const completedTasks = checkboxLines.filter((line) => /^\s*-\s+\[(?:x|X)\]\s+.+$/.test(line)).length
  return { completedTasks, totalTasks: checkboxLines.length }
}

async function scanMarkdownFiles(dir: string, prefix = ''): Promise<SpecFile[]> {
  const files: SpecFile[] = []

  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({ filename: relativePath, label: getFileLabel(relativePath) })
      } else if (entry.isDirectory()) {
        files.push(...await scanMarkdownFiles(join(dir, entry.name), relativePath))
      }
    }
  } catch {
    return files
  }

  return files
}

export default defineEventHandler(async () => {
  const specsDir = join(projectDir(), 'specs')

  let entries: string[]
  try {
    entries = await readdir(specsDir)
  } catch {
    return { features: [] as Feature[] }
  }

  const features: Feature[] = []

  for (const dirName of entries.sort()) {
    const dirPath = join(specsDir, dirName)
    try {
      const dirStat = await stat(dirPath)
      if (!dirStat.isDirectory()) continue
    } catch {
      continue
    }

    const files = await scanMarkdownFiles(dirPath)
    const hasSpec = files.some((file) => file.filename === 'spec.md')
    const hasPlan = files.some((file) => file.filename === 'plan.md')
    const hasTasks = files.some((file) => file.filename === 'tasks.md')
    let name = formatFeatureName('', dirName)
    let completedTasks = 0
    let totalTasks = 0

    if (hasSpec) {
      try {
        name = formatFeatureName(await readFile(join(dirPath, 'spec.md'), 'utf8'), dirName)
      } catch {
        name = formatFeatureName('', dirName)
      }
    }

    if (hasTasks) {
      try {
        const progress = extractTaskProgress(await readFile(join(dirPath, 'tasks.md'), 'utf8'))
        completedTasks = progress.completedTasks
        totalTasks = progress.totalTasks
      } catch {
        completedTasks = 0
        totalTasks = 0
      }
    }

    features.push({ id: dirName, name, files, hasSpec, hasPlan, hasTasks, completedTasks, totalTasks })
  }

  return { features }
})
