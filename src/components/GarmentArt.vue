<script setup lang="ts">
import { thumbSrcset, thumbUrl } from '../services/urls'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PictureOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { usingMocks, type Garment } from '../services/api'

const props = defineProps<{ garment: Garment; compact?: boolean }>()
type LoadState = 'loading' | 'loaded' | 'failed'
const state = ref<LoadState>('loading')
const slow = ref(false)
const attempt = ref(0)
let autoRetried = false
let slowTimer = 0
let retryTimer = 0
// Cards show a scaled WebP copy; the browser picks the width that fits the grid column and screen density.
const src = computed(() => thumbUrl(props.garment.displayUrl, props.compact ? 320 : 480) || '')
const srcset = computed(() => thumbSrcset(props.garment.displayUrl, props.compact ? [160, 320] : [320, 480, 720]))
const sizes = computed(() => props.compact ? '120px' : '(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw')

function clearTimers() { clearTimeout(slowTimer); clearTimeout(retryTimer) }
function startLoading() {
  clearTimers()
  state.value = 'loading'
  slow.value = false
  slowTimer = window.setTimeout(() => { if (state.value === 'loading') slow.value = true }, 6000)
}
function onLoad() { clearTimers(); state.value = 'loaded'; slow.value = false }
function onError() {
  clearTimers()
  // Weak networks often drop a single request; try once more quietly before showing the failure.
  if (!autoRetried) { autoRetried = true; retryTimer = window.setTimeout(() => { attempt.value++; startLoading() }, 1200); return }
  state.value = 'failed'
}
function retry() { autoRetried = true; attempt.value++; startLoading() }
// Cached images can finish before the load listener runs, so check completion on mount too.
function trackImage(element: unknown) {
  const image = element as HTMLImageElement | null
  if (image?.complete && image.naturalWidth && state.value === 'loading') onLoad()
}
watch(src, () => { autoRetried = false; attempt.value = 0; startLoading() }, { immediate: true })
onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="garment-art" :class="[{ 'has-photo': garment.displayUrl, compact }, garment.displayUrl ? `is-${state}` : '']" :style="{ '--cloth': garment.imageColor }" role="img" :aria-label="`${garment.primaryColor[0] || '未知颜色'}${garment.category[0] || '衣物'}`" :aria-busy="garment.displayUrl ? state === 'loading' : undefined">
    <template v-if="garment.displayUrl">
      <div v-if="state === 'loading'" class="art-placeholder" aria-hidden="true">
        <svg class="art-hanger" viewBox="0 0 64 40"><path d="M32 12a4.5 4.5 0 1 0-4.5-4.5M32 12v3.5L5 33.5c-1.6 1.1-.8 3.5 1.1 3.5h51.8c1.9 0 2.7-2.4 1.1-3.5L32 15.5" /></svg>
        <span v-if="slow && !compact" class="art-slow">网络较慢，仍在加载…</span>
      </div>
      <img v-if="state !== 'failed'" :key="attempt" :ref="trackImage" :src="src" :srcset="srcset" :sizes="srcset ? sizes : undefined" alt="" loading="lazy" decoding="async" @load="onLoad" @error="onError" />
      <div v-else class="photo-unavailable art-failed">
        <PictureOutlined />
        <span v-if="!compact">图片加载失败</span>
        <a-button size="small" type="text" class="art-retry" aria-label="重新加载图片" @click.stop="retry" @keydown.enter.stop><template #icon><ReloadOutlined /></template><template v-if="!compact">重新加载</template></a-button>
      </div>
    </template>
    <div v-else-if="!usingMocks" class="photo-unavailable"><PictureOutlined /><span v-if="!compact">暂无展示图片</span></div>
    <svg v-else viewBox="0 0 240 245" aria-hidden="true">
      <defs>
        <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity=".28"/><stop offset="1" stop-color="#173b30" stop-opacity=".16"/></linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="7"/></filter>
      </defs>
      <ellipse cx="121" cy="215" rx="59" ry="10" fill="#34453c" opacity=".15" filter="url(#shadow)"/>
      <path d="M81 46 102 34c5 12 12 18 19 18s14-6 19-18l21 12 28 19-18 34-15-9 7 102c-27 11-64 11-91 0l7-102-15 9-18-34z" :fill="garment.imageColor" stroke="#35473e" stroke-opacity=".17" stroke-width="2" stroke-linejoin="round"/>
      <path d="M81 46 102 34c5 12 12 18 19 18s14-6 19-18l21 12 28 19-18 34-15-9 7 102c-27 11-64 11-91 0l7-102-15 9-18-34z" fill="url(#fabric)"/>
      <path d="M102 35c2 18 9 27 19 27s17-9 19-27" fill="none" stroke="#23362d" stroke-opacity=".21" stroke-width="2"/>
      <path d="M117 61v120" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      <path d="M105 126h15m9 0h15m-39 7h15m9 0h15" v-if="garment.patterns.some((value) => value.includes('条纹'))" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
      <path d="m108 100 7 7 7-7-7-8z m17 20 7 7 7-7-7-8z m-19 38 7 7 7-7-7-8z" v-else-if="garment.patterns.some((value) => value.includes('花'))" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
      <rect x="145" y="141" width="21" height="18" rx="2" fill="none" stroke="#fff" stroke-opacity=".28" v-if="garment.closure[0] === '纽扣'"/>
    </svg>
  </div>
</template>

<style scoped>
.art-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; overflow: hidden; background: radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--cloth, var(--line)) 14%, transparent), transparent 62%); }
.art-placeholder::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, color-mix(in srgb, var(--surface) 55%, transparent) 50%, transparent 70%); transform: translateX(-100%); animation: art-shimmer 1.5s ease-in-out infinite; }
.art-hanger { width: 34%; max-width: 76px; fill: none; stroke: var(--muted-subtle); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: .5; transform-origin: 50% 8%; animation: art-sway 2.4s ease-in-out infinite; }
.art-slow { position: relative; z-index: 1; color: var(--muted-subtle); font-size: 12px; }
.garment-art.has-photo img { opacity: 1; transition: opacity .35s ease-out, transform .35s ease-out; }
.garment-art.is-loading img { opacity: 0; transform: scale(.98); }
.art-failed { gap: 8px; }
.art-failed > .anticon { opacity: .7; }
.art-retry { color: var(--muted-strong); font-size: 12px; }
.photo-unavailable .art-retry :deep(.anticon) { font-size: 12px; }
@keyframes art-shimmer { to { transform: translateX(100%); } }
@keyframes art-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@media (prefers-reduced-motion: reduce) {
  .art-placeholder::after, .art-hanger { animation: none; }
  .garment-art.is-loading img { transform: none; }
}
</style>
