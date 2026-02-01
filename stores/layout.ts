import { defineStore } from 'pinia'
import {
  VIEWPORT_BREAKPOINTS,
  type ViewportSize
} from '~/types/layout'
import { getViewportSize } from '~/utils/layout'

interface LayoutState {
  currentViewport: ViewportSize
  chatFullscreen: boolean
}

export const useLayoutStore = defineStore('layout', {
  state: (): LayoutState => ({
    currentViewport: 'desktop',
    chatFullscreen: false
  }),

  getters: {
    isMobile: (state): boolean => {
      return state.currentViewport === 'mobile'
    },

    isTablet: (state): boolean => {
      return state.currentViewport === 'tablet'
    },

    isDesktop: (state): boolean => {
      return state.currentViewport === 'desktop'
    },

    isChatFullscreen: (state): boolean => {
      return state.chatFullscreen
    }
  },

  actions: {
    updateViewport(width: number) {
      this.currentViewport = getViewportSize(width, VIEWPORT_BREAKPOINTS)
    },

    toggleChatFullscreen() {
      this.chatFullscreen = !this.chatFullscreen
    },

    setChatFullscreen(value: boolean) {
      this.chatFullscreen = value
    }
  }
})
