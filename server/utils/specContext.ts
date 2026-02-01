/**
 * Load feature spec context for injection into the provider's system prompt.
 * Returns file paths as references instead of full content.
 * Returns null if no spec.md found.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export async function loadSpecContext(projectDir: string, featureId: string): Promise<string | null> {
  const featurePath = join(projectDir, 'specs', featureId)
  const specPath = join(featurePath, 'spec.md')

  if (!existsSync(specPath)) {
    return null
  }

  const sections: string[] = []

  sections.push(`# Feature Context: ${featureId}`)
  sections.push('')
  sections.push('You are working on the feature described in the following specification files.')
  sections.push('You MUST read these files first to understand the feature requirements:')
  sections.push('')

  // Always include spec.md reference
  sections.push(`- specs/${featureId}/spec.md`)

  // Include plan.md if it exists
  const planPath = join(featurePath, 'plan.md')
  if (existsSync(planPath)) {
    sections.push(`- specs/${featureId}/plan.md`)
  }

  // Include tasks.md if it exists
  const tasksPath = join(featurePath, 'tasks.md')
  if (existsSync(tasksPath)) {
    sections.push(`- specs/${featureId}/tasks.md`)
  }

  sections.push('')
  sections.push('## Spec-Driven Workflow (MANDATORY)')
  sections.push('')
  sections.push('This chat is linked to a feature spec. You MUST follow the spec-driven workflow:')
  sections.push('')
  sections.push('1. **Read the spec files above** before doing anything else.')
  sections.push('2. **When the user requests changes or new functionality:**')
  sections.push('   - First, update the relevant spec file(s) (spec.md, plan.md, tasks.md) to reflect the new requirements.')
  sections.push('   - Then, implement the code changes according to the updated spec.')
  sections.push('   - Never skip the spec update step. The spec is the source of truth.')
  sections.push('3. **When the user requests a bug fix:**')
  sections.push('   - Check if the bug contradicts the spec. If so, fix the code to match the spec.')
  sections.push('   - If the spec itself is wrong, update the spec first, then fix the code.')
  sections.push('4. **FR Traceability:** Every change must be traceable from spec → plan → task → implementation.')

  return sections.join('\n')
}
