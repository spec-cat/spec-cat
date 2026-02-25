/**
 * Chat Type Definitions
 * Types for the AI provider chat feature
 */

// Message status for assistant messages
export type MessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

// ===== Content Block Types (Rich Chat UI) =====

export type ContentBlockType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result_summary' | 'session_init'

interface ContentBlockBase {
  id: string
  type: ContentBlockType
}

/** Plain text/markdown content */
export interface TextBlock extends ContentBlockBase {
  type: 'text'
  text: string
}

/** Extended thinking block */
export interface ThinkingBlock extends ContentBlockBase {
  type: 'thinking'
  thinking: string
}

/** Tool use invocation */
export interface ToolUseBlock extends ContentBlockBase {
  type: 'tool_use'
  toolUseId: string
  name: string
  input: Record<string, unknown>
  inputSummary: string
  status: 'running' | 'pending' | 'complete' | 'error'
}

/** Tool result (paired with a tool_use block via toolUseId) */
export interface ToolResultBlock extends ContentBlockBase {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError: boolean
}

/** Session result summary (end of turn) */
export interface ResultSummaryBlock extends ContentBlockBase {
  type: 'result_summary'
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
}

/** Session initialization info */
export interface SessionInitBlock extends ContentBlockBase {
  type: 'session_init'
  model: string
  tools: string[]
  permissionMode: string
  cwd: string
}

/** Union of all content block types */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ResultSummaryBlock
  | SessionInitBlock

/** Generate a unique block ID */
export function generateBlockId(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
}

/** Check if a message uses the new structured block format */
export function hasContentBlocks(msg: ChatMessage): boolean {
  return Array.isArray(msg.contentBlocks) && msg.contentBlocks.length > 0
}

/** Extract plain text from content blocks (for search, title generation) */
export function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
}

// AI provider permission modes
export type PermissionMode = 'plan' | 'ask' | 'auto' | 'bypass'

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  plan: 'Plan Mode',
  ask: 'Ask Before',
  auto: 'Auto Edit',
  bypass: 'Bypass',
}

export const PERMISSION_MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  plan: 'The assistant will create a plan before making changes',
  ask: 'The assistant will ask before each action',
  auto: 'The assistant can read and edit files automatically',
  bypass: 'Skip all permission checks (dangerous)',
}

// Permission request from the AI provider
export interface PermissionRequest {
  tool: string
  description?: string
  tools?: string[]
  filePath?: string
  command?: string
  input?: Record<string, unknown>
}

// Plan approval request from ExitPlanMode tool
export interface PlanApproval {
  allowedPrompts?: Array<{ tool: string; prompt: string }>
}

// Tool use information
export interface ToolUse {
  id: string
  name: string
  input?: Record<string, unknown>
  status: 'running' | 'pending' | 'complete' | 'error'
  result?: string
}

// Session status
export type SessionStatus = 'idle' | 'streaming' | 'error'

/**
 * Represents a single message in the conversation
 */
export interface ChatMessage {
  id: string                    // Unique message ID (uuid)
  role: 'user' | 'assistant'    // Message sender
  content: string               // Message text content (flat, for search/compat)
  attachments?: ChatImageAttachment[] // Optional user-provided image attachments
  contentBlocks?: ContentBlock[] // Structured content blocks (rich UI)
  timestamp: string             // ISO 8601 timestamp
  status?: MessageStatus        // For assistant messages only
  tools?: ToolUse[]             // Tool usage information (deprecated, use contentBlocks)
}

/**
 * User-provided image attachment
 */
export interface ChatImageAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  dataUrl: string
}

/**
 * Represents the active connection to the AI provider
 */
export interface ChatSession {
  sessionId: string             // Unique session ID
  cwd: string                   // Working directory path
  status: SessionStatus         // Current session state
  startedAt: string             // ISO 8601 timestamp
  error?: string                // Error message if failed
}

/**
 * Runtime debug event for provider/WebSocket stream inspection
 */
export interface DebugEvent {
  id: string
  timestamp: string
  direction: 'in' | 'out' | 'system'
  channel: 'ws' | 'provider' | 'client' | 'ui'
  eventType: string
  payload: string
}

/**
 * Represents the UI state of the chat panel
 */
export interface ChatPanelState {
  isOpen: boolean               // Panel visibility
  width: number                 // Panel width in pixels
}

// Panel width constraints
export const PANEL_MIN_WIDTH = 300
export const PANEL_MAX_WIDTH = 600
export const PANEL_DEFAULT_WIDTH = 400

/**
 * SSE Event Types - Events sent from server to client during streaming
 */
export interface SSEMessageEvent {
  type: 'message'
  data: {
    messageId: string           // Corresponding ChatMessage.id
    chunk: string               // Text chunk to append
  }
}

export interface SSECompleteEvent {
  type: 'complete'
  data: {
    messageId: string
  }
}

export interface SSEErrorEvent {
  type: 'error'
  data: {
    messageId: string
    error: string
  }
}

export type SSEEvent = SSEMessageEvent | SSECompleteEvent | SSEErrorEvent

/**
 * Canonical UI Stream Events
 * Explicit contract for both server-to-client WebSocket events and provider-to-server adapter output.
 */

export type UIStreamEventType =
  | 'session_init'
  | 'block_start'
  | 'block_delta'
  | 'block_end'
  | 'tool_result'
  | 'permission_request'
  | 'turn_result'
  | 'error'
  | 'done'

export interface UIStreamEventBase {
  type: UIStreamEventType
  sessionId?: string
}

export interface UIStreamSessionInitEvent extends UIStreamEventBase {
  type: 'session_init'
  model: string
  tools: string[]
  permissionMode: string
  cwd: string
}

export interface UIStreamBlockStartEvent extends UIStreamEventBase {
  type: 'block_start'
  blockId: string
  blockType: ContentBlockType
  index?: number
  name?: string
  toolUseId?: string
  text?: string
  thinking?: string
}

export interface UIStreamBlockDeltaEvent extends UIStreamEventBase {
  type: 'block_delta'
  blockId: string
  index?: number
  text?: string
  thinking?: string
  partialJson?: string
}

export interface UIStreamBlockEndEvent extends UIStreamEventBase {
  type: 'block_end'
  blockId: string
  index?: number
}

export interface UIStreamToolResultEvent extends UIStreamEventBase {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError: boolean
}

export interface UIStreamPermissionRequestEvent extends UIStreamEventBase {
  type: 'permission_request'
  tool: string
  description?: string
  tools?: string[]
  input?: Record<string, unknown>
}

export interface UIStreamTurnResultEvent extends UIStreamEventBase {
  type: 'turn_result'
  subtype: 'success' | 'error' | 'max_turns'
  totalCostUsd?: number
  durationMs?: number
  numTurns?: number
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
}

export interface UIStreamErrorEvent extends UIStreamEventBase {
  type: 'error'
  error: string
  requestId?: string
}

export interface UIStreamDoneEvent extends UIStreamEventBase {
  type: 'done'
  requestId?: string
  denied?: boolean
}

export type UIStreamEvent =
  | UIStreamSessionInitEvent
  | UIStreamBlockStartEvent
  | UIStreamBlockDeltaEvent
  | UIStreamBlockEndEvent
  | UIStreamToolResultEvent
  | UIStreamPermissionRequestEvent
  | UIStreamTurnResultEvent
  | UIStreamErrorEvent
  | UIStreamDoneEvent

/**
 * API Request/Response Types
 */

// POST /api/chat/send
export interface SendMessageRequest {
  message: string               // User's message text
  sessionId?: string            // Existing session to continue
}

export interface SendMessageResponse {
  sessionId: string             // Session ID for streaming
  messageId: string             // Created assistant message ID
  streamUrl: string             // SSE endpoint URL
}

// POST /api/chat/stop
export interface StopRequest {
  sessionId: string
}

export interface StopResponse {
  success: boolean
}

/**
 * Type Guards
 */
export function isUserMessage(msg: ChatMessage): msg is ChatMessage & { role: 'user' } {
  return msg.role === 'user'
}

export function isAssistantMessage(msg: ChatMessage): msg is ChatMessage & { role: 'assistant' } {
  return msg.role === 'assistant'
}

export function isStreamingMessage(msg: ChatMessage): boolean {
  return msg.role === 'assistant' && msg.status === 'streaming'
}

/**
 * Utility function to generate unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Utility function to generate unique session ID
 */
export function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Represents a saved conversation with full message history (T034)
 */
export interface Conversation {
  id: string                    // Unique conversation ID
  title: string                 // Display title (auto-generated or custom)
  messages: ChatMessage[]       // All messages in the conversation
  createdAt: string             // ISO 8601 timestamp
  updatedAt: string             // ISO 8601 timestamp (for sorting)
  cwd: string                   // Working directory context
  providerId?: string           // Provider ID used for this conversation
  providerModelKey?: string     // Provider model key used for this conversation
  providerSessionId?: string    // Provider session ID for resuming conversation
  worktreePath?: string         // Isolated worktree path for this conversation
  worktreeBranch?: string       // Git branch name for the worktree
  hasWorktree?: boolean         // Whether worktree was successfully created
  baseBranch?: string           // Base branch at worktree creation time (for finalize)
  previewBranch?: string        // Temp preview branch name (set when preview is active)
  featureId?: string            // Associated feature ID (for cascade reuse)
  finalized?: boolean           // True after successful finalize (read-only mode)
  lastCommitTime?: string       // ISO 8601 timestamp of last worktree commit (for UI refresh)
  restoredFromArchiveId?: string // Archive snapshot source ID when restored
}

/**
 * Immutable archive snapshot of a conversation
 */
export interface ArchivedConversation {
  id: string
  sourceConversationId: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  archivedAt: string
  cwd: string
  providerId?: string
  providerModelKey?: string
  featureId?: string
  baseBranch?: string
}

/**
 * Storage schema for localStorage persistence
 */
export interface StoredConversations {
  version: number               // Schema version for migrations
  conversations: Conversation[]
  archivedConversations: ArchivedConversation[]
}

// Storage constants
export const STORAGE_KEY_CONVERSATIONS = 'spec-cat-conversations'
export const STORAGE_VERSION = 2
export const MAX_CONVERSATIONS = 100
export const WARN_CONVERSATIONS_THRESHOLD = 80

/**
 * Utility function to generate unique conversation ID (T035)
 */
export function generateConversationId(): string {
  return `conv-${Math.random().toString(36).slice(2, 12)}`
}

export function generateArchivedConversationId(): string {
  return `arch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Generate conversation title from first user message (T035)
 */
export function generateConversationTitle(firstMessage: string): string {
  const MAX_LENGTH = 50
  const cleaned = firstMessage.trim().replace(/\n/g, ' ')
  if (cleaned.length <= MAX_LENGTH) return cleaned
  return cleaned.slice(0, MAX_LENGTH).trim() + '...'
}

/**
 * Conversation type guard
 */
export function isValidConversation(obj: unknown): obj is Conversation {
  if (!obj || typeof obj !== 'object') return false
  const conv = obj as Record<string, unknown>
  return (
    typeof conv.id === 'string' &&
    typeof conv.title === 'string' &&
    Array.isArray(conv.messages) &&
    typeof conv.createdAt === 'string' &&
    typeof conv.updatedAt === 'string' &&
    typeof conv.cwd === 'string'
  )
}

export function isValidArchivedConversation(obj: unknown): obj is ArchivedConversation {
  if (!obj || typeof obj !== 'object') return false
  const conv = obj as Record<string, unknown>
  return (
    typeof conv.id === 'string' &&
    typeof conv.sourceConversationId === 'string' &&
    typeof conv.title === 'string' &&
    Array.isArray(conv.messages) &&
    typeof conv.createdAt === 'string' &&
    typeof conv.updatedAt === 'string' &&
    typeof conv.archivedAt === 'string' &&
    typeof conv.cwd === 'string'
  )
}

/**
 * Type guards for conversation state (T001)
 */
export function conversationHasWorktree(conv: Conversation): conv is Conversation & {
  worktreePath: string
  worktreeBranch: string
  hasWorktree: true
  baseBranch: string
} {
  return conv.hasWorktree === true &&
    typeof conv.worktreePath === 'string' &&
    typeof conv.worktreeBranch === 'string' &&
    typeof conv.baseBranch === 'string'
}

export function isFinalized(conv: Conversation): boolean {
  return conv.finalized === true
}

export function isFeatureConversation(conv: Conversation): conv is Conversation & {
  featureId: string
} {
  return typeof conv.featureId === 'string' && conv.featureId.length > 0
}

export function isFinalizeConflict(resp: FinalizeResponse): resp is FinalizeResponse & {
  success: false
  conflictFiles: string[]
  rebaseInProgress: true
} {
  return !resp.success &&
    Array.isArray(resp.conflictFiles) &&
    resp.rebaseInProgress === true
}

/**
 * Request to finalize a chat conversation (squash + merge to base)
 */
export interface FinalizeRequest {
  conversationId: string
  commitMessage: string
  baseBranch?: string
  worktreePath?: string
  worktreeBranch?: string
  previewBranch?: string
}

/**
 * Response from finalize endpoint
 */
export interface FinalizeResponse {
  success: boolean
  error?: string
  providerId?: string
  missingCapability?: string
  /** Conflicting files when rebase fails */
  conflictFiles?: string[]
  /** New squashed commit hash on success */
  newCommit?: string
  /** True when rebase is paused for conflict resolution */
  rebaseInProgress?: boolean
}

/**
 * A file with rebase conflicts
 */
export interface ConflictFile {
  path: string
  content: string
  status: string // UU, AA, DU, UD
}

export interface ConflictListResponse {
  files: ConflictFile[]
  worktreePath: string
}

export interface ResolveFileRequest {
  worktreePath: string
  filePath: string
  content: string
}

export interface ResolveFileResponse {
  success: boolean
  error?: string
}

export interface RebaseContinueRequest {
  conversationId: string
  commitMessage: string
  baseBranch?: string
  worktreePath?: string
  worktreeBranch?: string
  previewBranch?: string
}

export interface RebaseSyncRequest {
  conversationId: string
  baseBranch?: string
  worktreePath?: string
}

export interface RebaseAbortRequest {
  worktreePath: string
}

export interface RebaseAbortResponse {
  success: boolean
  error?: string
}

/** AI conflict resolution request [FR-020] */
export interface AiResolveRequest {
  worktreePath: string
  filePath: string
  conflictContent: string
}

/** AI conflict resolution response [FR-020] */
export interface AiResolveResponse {
  success: boolean
  resolvedContent?: string
  error?: string
  providerId?: string
  missingCapability?: string
}

/**
 * StoredConversations type guard
 */
export function isValidStoredConversations(obj: unknown): obj is StoredConversations {
  if (!obj || typeof obj !== 'object') return false
  const data = obj as Record<string, unknown>
  return (
    typeof data.version === 'number' &&
    Array.isArray(data.conversations) &&
    data.conversations.every(isValidConversation) &&
    Array.isArray(data.archivedConversations) &&
    data.archivedConversations.every(isValidArchivedConversation)
  )
}
