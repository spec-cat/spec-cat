# Quickstart: Embedded Skills System

**Feature**: 016-embedded-skills

## Overview

This feature adds a pluggable embedded skills system to Spec Cat's features panel. Skills are AI agent definitions (markdown files with YAML frontmatter) that can be triggered from feature cards alongside existing cascade actions (Clarify, Plan, Tasks, Implement, Analyze).

## Architecture at a Glance

```
skills/                          # Skill definition files (new directory)
├── better-spec.md              # First built-in skill
└── ...                         # Additional skills

server/api/skills/              # New API endpoints
├── index.get.ts                # GET /api/skills — list all skills
└── [skillId]/
    └── prompt.post.ts          # POST /api/skills/{id}/prompt — render prompt

server/utils/skillRegistry.ts   # Skill parsing & validation

types/skill.ts                  # TypeScript interfaces

components/features/
├── FeatureCard.vue             # MODIFIED — add skill action buttons
└── FeaturesPanel.vue           # MODIFIED — fetch skills, handle skill execution
```

## Key Patterns

### 1. Skill Definition File (skills/better-spec.md)

```markdown
---
id: better-spec
name: Better Spec
description: Validates spec documents against What/How/Track separation
icon: DocumentCheckIcon
prerequisites:
  - spec.md
---

You are a specification quality validator...
(agent prompt template with {{featureId}}, {{specsDir}}, {{availableDocuments}} variables)
```

### 2. Skill Execution Flow

```
User clicks skill button on feature card
    ↓
FeaturesPanel.handleSkill(event, featureId, skillId)
    ↓
Fetch rendered prompt: POST /api/skills/{skillId}/prompt { featureId }
    ↓
Create/reuse conversation (same as cascade logic)
    ↓
Send rendered prompt as user message via WebSocket stream
    ↓
Claude processes prompt, results stream back in real-time
```

### 3. Prerequisite Checking (Client-side)

```typescript
// In FeatureCard.vue
const isSkillAvailable = (skill: SkillMetadata) =>
  skill.prerequisites.every(p => feature.files.some(f => f.filename === p))
```

### 4. Skill Registry (Server-side)

```typescript
// server/utils/skillRegistry.ts
export async function loadSkills(projectDir: string): Promise<SkillDefinition[]>
export async function loadSkill(projectDir: string, skillId: string): Promise<SkillDefinition | null>
export function renderPrompt(skill: SkillDefinition, context: { featureId, specsDir, availableDocuments }): string
```

## Integration Points (Existing Code)

| Component | What Changes | Why |
|-----------|-------------|-----|
| `types/skill.ts` | **New file** | TypeScript interfaces for skills |
| `server/utils/skillRegistry.ts` | **New file** | Skill parsing, validation, prompt rendering |
| `server/api/skills/index.get.ts` | **New file** | List skills API |
| `server/api/skills/[skillId]/prompt.post.ts` | **New file** | Render prompt API |
| `skills/better-spec.md` | **New file** | First built-in skill definition |
| `components/features/FeatureCard.vue` | **Modified** | Add skill action buttons with separator |
| `components/features/FeaturesPanel.vue` | **Modified** | Fetch skills, handle skill execution |

## What Stays Unchanged

- **Chat store** (`stores/chat.ts`) — conversation creation/reuse logic is reused as-is
- **WebSocket streaming** (`server/routes/_ws.ts`) — skill prompts are just longer user messages
- **Permission system** — skills inherit the active permission mode
- **Worktree isolation** — skills run in the feature's worktree
- **Cascade composable** (`useChatStream.ts`) — `sendMessage()` works unchanged for skills
- **Conversation persistence** — localStorage pattern unchanged

## Testing Strategy

1. **Unit**: Skill file parsing, YAML validation, template rendering, prerequisite checking
2. **Integration**: API endpoint responses, malformed file handling, missing skills directory
3. **Manual**: Click skill button on feature card, observe streaming results in chat panel
