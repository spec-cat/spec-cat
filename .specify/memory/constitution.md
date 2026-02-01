# Spec Cat Constitution

## Core Principles

### I. User Control First

All AI actions must be controllable by the user. Tool executions require explicit or implicit consent through three permission modes:
- **Default Mode**: Ask user before each tool execution
- **Plan Mode**: Claude proposes a plan, user approves before executing
- **Accept Edits Mode**: Auto-approve file operations

Users can abort any in-progress operation at any time (ESC key). The UI must clearly indicate what Claude is doing and why.

### II. Streaming-Native Architecture

All Claude interactions use streaming responses. Messages appear incrementally as they're generated. Tool usage and results are displayed in real-time. Network efficiency is prioritized through NDJSON protocol.

### III. CLI Parity

The web UI must support all features available in Claude Code CLI. Permission patterns match CLI behavior (`Bash(command:*)`). Session management is compatible with CLI sessions. History from CLI sessions can be loaded and resumed.

### IV. Multi-Project & History Support

Support multiple projects loaded from `~/.claude.json`. Each project maintains its own conversation history. Users can browse, load, and resume previous conversations. Session IDs enable conversation continuity.

### V. Keyboard-Driven Experience

Provide keyboard shortcuts for power users:
- **Ctrl+Shift+M**: Cycle permission modes
- **ESC**: Abort in-progress requests
- **Enter/Shift+Enter**: Configurable send behavior

### VI. Simplicity Over Complexity

Prefer simple, direct implementations. Avoid over-engineering and premature abstraction. Each component should have a single, clear responsibility. Code should be readable without extensive documentation.

### VII. Type Safety

All code uses TypeScript with strict mode enabled. API contracts are explicitly typed. Runtime type guards protect against invalid data. Message types use discriminated unions for exhaustive handling.

## Technology Constraints

### Stack Requirements
- **Frontend**: Nuxt 3 (v3.16+), Vue 3 (v3.5+), TypeScript 5.6+
- **State**: Pinia for global state, composables for local state
- **Styling**: Tailwind CSS only with retro-terminal theme (cyan, green, magenta accents)
- **Backend**: Nitro (Nuxt server), no external API services

### Dependencies
- Must use `@anthropic-ai/claude-code` SDK for Claude integration
- No alternative AI SDKs or direct API calls
- Allowed utility dependencies: `dayjs` (date formatting), `@heroicons/vue` (icons)
- Minimize external dependencies where native solutions exist

## Development Standards

### Code Organization
- **Pages**: Handle routing and composition only (`pages/index.vue`, `pages/projects/[...path].vue`)
- **Components**: Handle UI rendering and user interaction
  - `chat/`: Chat interface components (input, messages, permissions)
  - `messages/`: Message type-specific renderers (tool, plan, thinking, etc.)
  - `settings/`: User preference components
- **Composables**: Handle stateful logic and side effects
  - `useChatState`: Chat state management
  - `useClaudeStreaming`: Stream processing
  - `usePermissions`: Permission request handling
  - `useHistoryLoader`: Conversation history loading
- **Utils**: Handle pure, stateless functions
  - `UnifiedMessageProcessor`: Process SDK messages for both streaming and history
  - Type guards, tool extraction, path normalization
- **Server utils**: Handle backend-specific logic (Claude CLI integration, history parsing)
- **Stores**: Pinia stores for global settings (theme, keyboard behavior)
- **Types**: TypeScript type definitions (`AllMessage` union, API contracts)

### Testing Approach
- Manual testing for UI interactions
- Type checking as first line of defense
- Integration testing via actual Claude Code CLI

## Governance

This constitution guides all development decisions for Spec Cat. Changes to core architecture require updating this document first.

**Version**: 1.1.0 | **Ratified**: 2026-01-27 | **Last Amended**: 2026-01-27
