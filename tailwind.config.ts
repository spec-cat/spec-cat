import type { Config } from "tailwindcss";

export default <Config>{
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./composables/**/*.{js,ts}",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        retro: {
          black: "rgb(var(--color-retro-black) / <alpha-value>)",
          dark: "rgb(var(--color-retro-dark) / <alpha-value>)",
          panel: "rgb(var(--color-retro-panel) / <alpha-value>)",
          border: "rgb(var(--color-retro-border) / <alpha-value>)",
          cyan: "rgb(var(--color-retro-cyan) / <alpha-value>)",
          green: "rgb(var(--color-retro-green) / <alpha-value>)",
          yellow: "rgb(var(--color-retro-yellow) / <alpha-value>)",
          orange: "rgb(var(--color-retro-orange) / <alpha-value>)",
          red: "rgb(var(--color-retro-red) / <alpha-value>)",
          magenta: "rgb(var(--color-retro-magenta) / <alpha-value>)",
          pink: "rgb(var(--color-retro-pink) / <alpha-value>)",
          text: "rgb(var(--color-retro-text) / <alpha-value>)",
          muted: "rgb(var(--color-retro-muted) / <alpha-value>)",
          subtle: "rgb(var(--color-retro-subtle) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
      },
      boxShadow: {
        retro: "0 0 0 1px rgb(var(--color-retro-cyan) / 0.4)",
        "retro-hover": "0 0 0 1px rgb(var(--color-retro-cyan) / 0.8), 0 0 8px rgb(var(--color-retro-cyan) / 0.3)",
      },
      animation: {
        blink: "blink 1s step-end infinite",
        pulse: "pulse 2s ease-in-out infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
