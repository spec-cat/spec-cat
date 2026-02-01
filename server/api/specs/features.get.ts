import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectDir } from '../../utils/projectDir'
import type { Feature, SpecFile } from '~/types/spec-viewer'

const FILE_LABEL_MAP: Record<string, string> = {
  'spec.md': 'Spec',
  'plan.md': 'Plan',
  'tasks.md': 'Tasks',
  'data-model.md': 'Data Model',
  'research.md': 'Research',
  'quickstart.md': 'Quickstart',
}

function getFileLabel(filename: string): string {
  if (FILE_LABEL_MAP[filename]) {
    return FILE_LABEL_MAP[filename]
  }
  // checklists/requirements.md → "Checklist: requirements"
  if (filename.startsWith('checklists/')) {
    const name = filename.replace('checklists/', '').replace('.md', '')
    return `Checklist: ${name}`
  }
  // contracts/features-list.md → "Contract: features-list"
  if (filename.startsWith('contracts/')) {
    const name = filename.replace('contracts/', '').replace('.md', '')
    return `Contract: ${name}`
  }
  // fallback: strip extension
  return filename.replace('.md', '')
}

function extractFeatureName(specContent: string, dirName: string): string {
  // Try to extract from "# Feature Specification: {name}" heading
  const match = specContent.match(/^#\s+Feature Specification:\s*(.+)$/m)
  if (match) {
    return match[1].trim()
  }
  // Fallback: strip numeric prefix, convert hyphens to spaces, title case
  const withoutPrefix = dirName.replace(/^\d+-/, '')
  return withoutPrefix
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function scanMdFiles(dir: string, prefix: string = ''): Promise<SpecFile[]> {
  const files: SpecFile[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({ filename: relativePath, label: getFileLabel(relativePath) })
      } else if (entry.isDirectory()) {
        const subFiles = await scanMdFiles(join(dir, entry.name), relativePath)
        files.push(...subFiles)
      }
    }
  } catch {
    // Directory not readable, skip
  }
  return files
}

export default defineEventHandler(async () => {
  const projectDir = getProjectDir()
  const specsDir = join(projectDir, 'specs')

  let entries: string[]
  try {
    entries = await readdir(specsDir)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to read specs directory' })
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

    const files = await scanMdFiles(dirPath)
    const hasSpec = files.some(f => f.filename === 'spec.md')
    const hasPlan = files.some(f => f.filename === 'plan.md')
    const hasTasks = files.some(f => f.filename === 'tasks.md')

    // Extract feature name from spec.md if available
    let name = dirName.replace(/^\d+-/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    if (hasSpec) {
      try {
        const specContent = await readFile(join(dirPath, 'spec.md'), 'utf-8')
        name = extractFeatureName(specContent, dirName)
      } catch {
        // Use fallback name
      }
    }

    features.push({ id: dirName, name, files, hasSpec, hasPlan, hasTasks })
  }

  return { features }
})
