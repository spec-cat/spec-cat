import { describe, expect, it } from 'vitest'
import { getViewportSize } from '~/utils/layout'
import { VIEWPORT_BREAKPOINTS } from '~/types/layout'

describe('layout utils', () => {
  it('classifies viewport size at boundaries', () => {
    expect(getViewportSize(VIEWPORT_BREAKPOINTS.mobile - 1, VIEWPORT_BREAKPOINTS)).toBe('mobile')
    expect(getViewportSize(VIEWPORT_BREAKPOINTS.mobile, VIEWPORT_BREAKPOINTS)).toBe('tablet')
    expect(getViewportSize(VIEWPORT_BREAKPOINTS.tablet - 1, VIEWPORT_BREAKPOINTS)).toBe('tablet')
    expect(getViewportSize(VIEWPORT_BREAKPOINTS.tablet, VIEWPORT_BREAKPOINTS)).toBe('desktop')
  })
})
