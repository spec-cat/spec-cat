import pkg from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  // Runtime configuration - server-side only
  runtimeConfig: {
    // Project directory (set by server plugin from CLI args or env var)
    projectDir: process.cwd(),
    public: {
      appVersion: pkg.version,
    },
  },

  // Enable WebSocket support
  nitro: {
    experimental: {
      websocket: true,
    },
  },

  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss'
  ],

  // Pinia auto-imports
  pinia: {
    storesDirs: ['./stores/**']
  },

  typescript: {
    strict: true
  },

  // Tailwind CSS configuration
  tailwindcss: {
    cssPath: '~/assets/css/tailwind.css',
    configPath: 'tailwind.config.ts'
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/app-logo.svg' }
      ]
    }
  }
})
