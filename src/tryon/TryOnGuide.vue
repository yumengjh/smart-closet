<script setup lang="ts">
// 取景引导叠加层（docs/design/2026-11-19-镜头试穿：启动动效与取景引导设计.md）：
// 目标框按这次需要入镜的范围画出；部位刻度只列需要的部位，识别到就点亮；人站远时提示改成画面中央大字。
// 纯展示，不接收点击，读屏文字由下方提示行负责。
import type { Part, Scope } from './guide'

defineProps<{ scope: Scope; parts: readonly { part: Part; label: string; on: boolean }[]; ready: boolean; big: string }>()
</script>

<template>
  <div class="tryon-guide" :class="[`scope-${scope}`, { 'is-ready': ready }]" aria-hidden="true">
    <div class="guide-target"><i></i><i></i><i></i><i></i></div>
    <ol v-if="parts.length" class="guide-parts">
      <li v-for="p in parts" :key="p.part" :class="{ on: p.on }"><i></i>{{ p.label }}</li>
    </ol>
    <Transition name="guide-big" mode="out-in">
      <p v-if="big" :key="big" class="guide-big">{{ big }}</p>
    </Transition>
  </div>
</template>

<style scoped>
.tryon-guide { --mint: #9fe8c3; position: absolute; inset: 0; z-index: 4; pointer-events: none; }

/* 目标框：开机时从整块舞台收拢到目标位置；就绪后变薄荷绿并亮一下。 */
.guide-target { position: absolute; inset: 14% 22% 30%; transition: inset .5s cubic-bezier(.22, 1, .36, 1); animation: guide-gather .7s cubic-bezier(.22, 1, .36, 1) .15s backwards; }
.scope-full .guide-target { inset: 9% 24% 26%; }
.scope-upper .guide-target { inset: 12% 16% 38%; }
.scope-head .guide-target { inset: 16% 26% 48%; }
.scope-hands .guide-target { inset: 26% 18% 36%; }
.guide-target i { position: absolute; width: 28px; height: 28px; border: 2px solid #ffffffb3; filter: drop-shadow(0 1px 3px #0006); transition: border-color .35s ease, filter .35s ease; }
.guide-target i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; border-radius: 10px 0 0; }
.guide-target i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; border-radius: 0 10px 0 0; }
.guide-target i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 10px; }
.guide-target i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; border-radius: 0 0 10px; }
.is-ready .guide-target { animation: guide-lock .6s ease-out; }
.is-ready .guide-target i { border-color: var(--mint); filter: drop-shadow(0 0 8px #9fe8c399); }

/* 部位刻度：贴右侧竖排，从上到下。 */
.guide-parts { position: absolute; right: 12px; top: 50%; display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 8px 6px; list-style: none; background: #10171480; border-radius: 16px; backdrop-filter: blur(10px); transform: translateY(-50%); animation: guide-fade .4s ease .3s backwards; }
.guide-parts li { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 24px; font-size: 11px; line-height: 1; color: #ffffff8c; transition: color .3s ease; }
.guide-parts i { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px #ffffff80; transition: background .3s ease, box-shadow .3s ease, transform .3s cubic-bezier(.34, 1.56, .64, 1); }
.guide-parts li.on { color: #fff; }
.guide-parts li.on i { background: var(--mint); box-shadow: 0 0 0 3px #9fe8c333, 0 0 8px #9fe8c3aa; transform: scale(1.25); }

/* 远距离大字：两三米外也看得清。 */
.guide-big { position: absolute; left: 50%; top: 42%; width: min(86%, 560px); margin: 0; padding: 14px 20px; font-size: clamp(22px, 6.4vw, 40px); font-weight: 650; line-height: 1.35; color: #fff; text-align: center; letter-spacing: .02em; text-shadow: 0 2px 12px #000a; background: #0b0f0d73; border-radius: 20px; backdrop-filter: blur(6px); transform: translate(-50%, -50%); }
.is-ready .guide-big { color: var(--mint); }
.guide-big-enter-active, .guide-big-leave-active { transition: opacity .25s ease, transform .3s cubic-bezier(.22, 1, .36, 1); }
.guide-big-enter-from { opacity: 0; transform: translate(-50%, -40%) scale(.96); }
.guide-big-leave-to { opacity: 0; transform: translate(-50%, -58%); }

@keyframes guide-gather { from { inset: 0; opacity: 0; } }
@keyframes guide-lock { 40% { transform: scale(1.025); } }
@keyframes guide-fade { from { opacity: 0; } }

/* 手机横屏：右侧是控件栏，刻度挪到左侧。 */
@media (max-height: 500px) and (pointer: coarse) { .guide-parts { right: auto; left: 12px; } }
@media (prefers-reduced-motion: reduce) {
  .guide-target, .guide-parts, .guide-parts i { animation: none !important; transition: none !important; }
  .guide-big-enter-active, .guide-big-leave-active { transition: opacity .15s ease; }
  .guide-big-enter-from, .guide-big-leave-to { transform: translate(-50%, -50%); }
}
</style>
