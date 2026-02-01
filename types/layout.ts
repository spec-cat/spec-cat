/**
 * Viewport size categories for responsive layout.
 */
export type ViewportSize = 'mobile' | 'tablet' | 'desktop'

/**
 * Viewport breakpoint thresholds in pixels.
 */
export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  tablet: 1024
} as const

export interface PanelDefinition {
  id: string
  label: string
  flex: number
}

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  { id: 'git-tree', label: 'Git Tree', flex: 3 },
  { id: 'features', label: 'Features', flex: 2 },
  { id: 'conversations', label: 'Conversations', flex: 2 },
  { id: 'chat', label: 'Chat', flex: 3 }
] as const
