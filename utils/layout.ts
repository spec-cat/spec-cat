import type { ViewportSize } from '~/types/layout'

interface ViewportBreakpoints {
  mobile: number
  tablet: number
}

export function getViewportSize(width: number, breakpoints: ViewportBreakpoints): ViewportSize {
  if (width < breakpoints.mobile) return 'mobile'
  if (width < breakpoints.tablet) return 'tablet'
  return 'desktop'
}
