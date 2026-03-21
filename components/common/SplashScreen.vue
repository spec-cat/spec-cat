<script setup lang="ts">
import { ref, onMounted } from 'vue'

const visible = ref(true)
const fadeOut = ref(false)

onMounted(() => {
  setTimeout(() => {
    fadeOut.value = true
    setTimeout(() => {
      visible.value = false
    }, 600)
  }, 1800)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-retro-black transition-opacity duration-500"
      :class="{ 'opacity-0': fadeOut }"
    >
      <div class="flex flex-col items-center gap-6">
        <pre class="text-retro-cyan font-mono text-xs leading-tight select-none splash-glow">
  ____                    ____      _
 / ___| _ __   ___  ___  / ___|__ _| |_
 \___ \| '_ \ / _ \/ __|| |   / _` | __|
  ___) | |_) |  __/ (__ | |__| (_| | |_
 |____/| .__/ \___|\___| \____\__,_|\__|
       |_|
        </pre>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full bg-retro-cyan animate-pulse" />
          <span class="text-retro-muted font-mono text-xs tracking-widest uppercase">initializing</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.splash-glow {
  text-shadow: 0 0 10px rgb(var(--color-retro-cyan) / 0.6),
               0 0 30px rgb(var(--color-retro-cyan) / 0.3);
  animation: flicker 0.15s ease-in-out 0.3s 1;
}

@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>
