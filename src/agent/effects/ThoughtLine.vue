<!-- Adapted from Vue Bits ThoughtLine, Copyright (c) 2025 David Haz.
     MIT + Commons Clause; see VUE_BITS_LICENSE.md. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { StarOutlined, CheckOutlined, CloseOutlined, DownOutlined } from '@ant-design/icons-vue'
const props = withDefaults(defineProps<{ label: string; working?: boolean; steps?: { text: string; success: boolean }[]; showTimer?: boolean }>(), { working: true, steps: () => [], showTimer: true })
const expanded = ref(false), seconds = ref('0.0')
let clock: ReturnType<typeof setInterval> | undefined
let started = 0
function tick() { seconds.value = ((performance.now() - started) / 1000).toFixed(1) }
function sync() { clearInterval(clock); if (props.working) { started = performance.now(); seconds.value = '0.0'; clock = setInterval(tick, 100) } else expanded.value = false }
onMounted(sync)
watch(() => props.working, sync)
onUnmounted(() => clearInterval(clock))
</script>
<template>
  <div class="thought-line" :class="{ working }" data-agent-activity="operating">
    <div class="thought-line-head" role="status"><StarOutlined v-if="working" class="thought-glyph" aria-hidden="true" /><CheckOutlined v-else aria-hidden="true" />
      <span class="thought-label-slot"><Transition name="thought-label"><span :key="label" class="thought-label">{{ label }}</span></Transition></span>
      <span v-if="showTimer" class="thought-timer" aria-hidden="true">{{ seconds }}s</span>
      <a-button v-if="steps.length" type="text" class="thought-expand" aria-label="展开当前操作步骤" :aria-expanded="expanded" @click="expanded = !expanded"><DownOutlined :style="{ transform: expanded ? 'rotate(180deg)' : undefined }" /></a-button>
    </div>
    <a-collapse v-if="steps.length" :active-key="expanded ? ['trace'] : []" ghost class="thought-trace"><a-collapse-panel key="trace" :show-arrow="false"><ul><li v-for="(step, i) in steps" :key="i"><CheckOutlined v-if="step.success" /><CloseOutlined v-else /><span>{{ step.text }}</span></li></ul></a-collapse-panel></a-collapse>
  </div>
</template>
<style scoped>
.thought-line { min-width: 0; color: var(--ink); font-size: 13px; }
.thought-line-head { display: flex; align-items: center; gap: 8px; min-height: 28px; min-width: 0; }
.thought-glyph { flex: none; color: var(--accent); }
.working .thought-glyph { animation: thought-breathe 1.6s cubic-bezier(.77,0,.175,1) infinite; }
.thought-label-slot { display: grid; min-width: 0; }
.thought-label { grid-area: 1 / 1; min-width: 0; overflow-wrap: anywhere; }
.working .thought-label { background-image: linear-gradient(100deg, var(--ink) 30%, var(--accent) 50%, var(--ink) 70%); background-size: 250% 100%; background-position: 125% 0; background-clip: text; -webkit-text-fill-color: transparent; animation: thought-shimmer 1.8s linear infinite; }
.thought-timer { flex: none; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.thought-expand.ant-btn { width: 44px; height: 44px; padding: 0; flex: none; margin-left: auto; }
.thought-expand .anticon { transition: transform .2s ease; }
.thought-trace :deep(.ant-collapse-header) { display: none !important; }
.thought-trace :deep(.ant-collapse-content-box) { padding: 6px 0 0 24px; }
.thought-trace ul { list-style: none; margin: 0; padding: 0; }
.thought-trace li { display: flex; gap: 8px; margin: 6px 0; color: var(--muted); font-size: 12px; }
.thought-trace li > .anticon { flex: none; margin-top: 3px; }
.thought-label-enter-active, .thought-label-leave-active { transition: opacity .15s ease, filter .15s ease; }
.thought-label-enter-from, .thought-label-leave-to { opacity: 0; filter: blur(2px); }
@keyframes thought-breathe { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes thought-shimmer { to { background-position: -125% 0; } }
@media(prefers-reduced-motion: reduce) { .working .thought-glyph, .working .thought-label { animation: none; } .working .thought-label { background: none; -webkit-text-fill-color: currentColor; } .thought-label-enter-active, .thought-label-leave-active, .thought-expand .anticon { transition: none; filter: none; } }
</style>
