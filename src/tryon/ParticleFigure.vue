<script setup lang="ts">
// 启动页舞台卡里的粒子人形（docs/design/2026-11-19-镜头试穿：启动动效与取景引导设计.md 第 3 节）：
// 粒子从四处聚成虚线轮廓里的人形并缓慢闪动；选了衣服时，从落位处荡开一圈。纯装饰，不接收点击。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ParticleField, hash01, type XY } from './particles'
import { useThemeStore } from '../stores/theme'

const props = defineProps<{ path: string; head: { cx: number; cy: number; r: number }; drop: number | null; dropKey?: string }>()
const canvas = ref<HTMLCanvasElement>()
const theme = useThemeStore()
let field: ParticleField | undefined, resize: ResizeObserver | undefined, seen: IntersectionObserver | undefined
let box = { width: 0, height: 0 }
const COUNT = window.matchMedia('(pointer: coarse)').matches ? 150 : 230

// 在 100×200 的轮廓坐标里撒点，只留落在人形内的，再按 SVG 的 meet 规则换算到画布。
function targets(): XY[] {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe || box.height <= 0) return []
  const body = new Path2D(props.path), head = new Path2D()
  head.arc(props.head.cx, props.head.cy, props.head.r, 0, Math.PI * 2)
  const scale = Math.min(box.height / 200, (box.width * 0.6) / 100)
  const left = (box.width - 100 * scale) / 2, top = (box.height - 200 * scale) / 2
  const out: XY[] = []
  for (let i = 0; out.length < COUNT && i < COUNT * 12; i++) {
    const x = hash01(i * 2 + 1) * 100, y = hash01(i * 2 + 2) * 200
    if (probe.isPointInPath(body, x, y) || probe.isPointInPath(head, x, y)) out.push({ x: left + x * scale, y: top + y * scale })
  }
  return out
}

function place() {
  const el = canvas.value
  if (!el || !field) return
  box = { width: el.clientWidth, height: el.clientHeight }
  field.resize(box.width, box.height)
  field.setTargets(targets())
}

// 衣服落位的动画约 0.3 秒落地，落地时再荡开。
let kickTimer = 0
watch(() => [props.drop, props.dropKey] as const, ([drop]) => {
  clearTimeout(kickTimer)
  if (drop !== null) kickTimer = window.setTimeout(() => field?.kick({ x: box.width / 2, y: box.height * drop / 100 }), 320)
})
watch(() => theme.isDark, dark => field?.setTone(dark ? 'dark' : 'light'))

onMounted(() => {
  const el = canvas.value
  if (!el) return
  field = new ParticleField(el, COUNT, theme.isDark ? 'dark' : 'light')
  box = { width: el.clientWidth, height: el.clientHeight }
  field.resize(box.width, box.height)
  field.seed('scatter')
  place()
  field.start()
  resize = new ResizeObserver(place); resize.observe(el)
  // 滚出视野就停画，省电。
  seen = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) field?.start(); else field?.stop() })
  seen.observe(el)
})
onBeforeUnmount(() => { clearTimeout(kickTimer); resize?.disconnect(); seen?.disconnect(); field?.destroy() })
</script>

<template>
  <canvas ref="canvas" class="particle-figure" aria-hidden="true"></canvas>
</template>

<style scoped>
.particle-figure { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
