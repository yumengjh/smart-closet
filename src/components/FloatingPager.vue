<script setup lang="ts">
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue'

/**
 * Previous / next control pinned to the bottom of the screen, so paging never needs a scroll back to the list's end.
 * Sits above the phone tab bar, clear of the home indicator, and centres on the content area next to the sidebar.
 */
defineProps<{ label: string; hasPrevious: boolean; hasNext: boolean; previousText: string; nextText: string; busy?: boolean; hint?: string }>()
const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
  <nav class="floating-pager" :aria-label="`${previousText}与${nextText}`" :aria-busy="busy">
    <a-button class="fp-step" shape="round" :disabled="!hasPrevious" :aria-label="previousText" @click="emit('previous')"><LeftOutlined /><span class="fp-text">{{ previousText }}</span></a-button>
    <span class="fp-label" aria-live="polite">{{ label }}<small v-if="hint">{{ hint }}</small></span>
    <a-button class="fp-step" shape="round" :disabled="!hasNext" :aria-label="nextText" @click="emit('next')"><span class="fp-text">{{ nextText }}</span><RightOutlined /></a-button>
  </nav>
</template>

<style scoped>
.floating-pager { position: fixed; z-index: 25; bottom: 20px; left: calc(50% + 112px); transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--overlay, #fffffff0); box-shadow: 0 10px 30px #00000024; backdrop-filter: blur(14px); }
.fp-step.ant-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; min-width: 40px; padding: 0 16px; border: 0; background: transparent; font-weight: 500; }
.fp-step.ant-btn:not(:disabled):hover { background: var(--surface-alt); }
.fp-step.ant-btn:focus:not(:focus-visible) { outline: none; box-shadow: none; }
.fp-step.ant-btn:disabled { opacity: .35; background: transparent; }
.fp-label { display: flex; flex-direction: column; align-items: center; min-width: 76px; padding: 0 6px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.2; color: var(--ink); }
.fp-label small { margin-top: 1px; font-size: 11px; font-weight: 400; color: var(--muted-copy); }
.floating-pager[aria-busy="true"] .fp-label { opacity: .55; }
@media (max-width: 1023px) { .floating-pager { left: 50%; bottom: calc(72px + env(safe-area-inset-bottom) + 12px); } }
@media (max-width: 767px) { .fp-step.ant-btn { height: 44px; min-width: 44px; padding: 0 12px; } .fp-text { display: none; } .fp-label { min-width: 96px; font-size: 15px; } }
@media (prefers-reduced-motion: no-preference) { .floating-pager { animation: fp-in .18s ease-out; } }
@keyframes fp-in { from { opacity: 0; transform: translate(-50%, 8px); } }
</style>
