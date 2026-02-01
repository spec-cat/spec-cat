/**
 * Skill Type Definitions
 * Types for the Embedded Skills System
 */

/** Skill definition as loaded from filesystem */
export interface SkillDefinition {
  id: string
  name: string
  description: string
  icon: string
  prerequisites: string[]
  promptTemplate: string
}

/** Skill metadata sent to client (no prompt template) */
export interface SkillMetadata {
  id: string
  name: string
  description: string
  icon: string
  prerequisites: string[]
}

/** API response for listing skills */
export interface SkillsListResponse {
  skills: SkillMetadata[]
}

/** API response for rendering a skill prompt */
export interface SkillPromptResponse {
  prompt: string
  featureId: string
  skillId: string
}
