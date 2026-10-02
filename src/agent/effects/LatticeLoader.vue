<!-- Adapted from Vue Bits LatticeLoader, Copyright (c) 2025 David Haz.
     MIT + Commons Clause; see VUE_BITS_LICENSE.md. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
defineProps<{ label: string }>()
const phases = [0, 1, 2, 7, null, 3, 6, 5, 4]
const seconds = ref('0.0')
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { const start = performance.now(); clock = setInterval(() => { seconds.value = ((performance.now() - start) / 1000).toFixed(1) }, 100) })
onUnmounted(() => clearInterval(clock))
</script>
<template>
  <div class="lattice-loader" role="status" data-agent-activity="thinking">
    <span class="lattice-grid" aria-hidden="true"><span v-for="(phase, i) in phases" :key="i" :class="{ hole: phase === null }" :style="{ animationDelay: `${(phase || 0) * 108}ms` }" /></span>
    <span class="lattice-label">{{ label }}</span><span class="lattice-timer" aria-hidden="true">{{ seconds }}s</span>
  </div>
</template>
<style scoped>
.lattice-loader { display: flex; align-items: center; gap: 10px; min-height: 28px; color: var(--ink); font-size: 13px; }
.lattice-grid { flex: none; display: grid; grid-template-columns: repeat(3, 4px); gap: 2px; }
.lattice-grid > span { width: 4px; height: 4px; border-radius: 1px; background: var(--blue); opacity: .2; animation: lattice-cell-wave 864ms cubic-bezier(.77, 0, .175, 1) infinite; }
.lattice-grid > span.hole { opacity: .1; animation: none; }
.lattice-label { min-width: 0; overflow-wrap: anywhere; }
.lattice-timer { flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
@keyframes lattice-cell-wave { 0%, 100% { opacity: .2; } 18%, 42% { opacity: 1; } 62% { opacity: .2; } }
@media(prefers-reduced-motion: reduce) { .lattice-grid > span { animation: none; opacity: .7; } .lattice-grid > span.hole { opacity: .1; } }
</style>
