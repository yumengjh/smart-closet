<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppstoreAddOutlined, CameraOutlined, HeartOutlined, InboxOutlined, RightOutlined } from '@ant-design/icons-vue'
import { loadWantedLabel, wantedLabel } from '../wardrobe/wanted'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import { usePreferencesStore } from '../stores/preferences'
import { revealNavigate } from './revealNavigate'

/**
 * 清新改版 §2.1: the phone bar keeps only the main five; 未入柜 also lives here as a row under the tiles (with its count),
 * and the ＋ shows a dot while something waits there.
 * Centre button of the mobile bar. A tap raises a card of four quick actions just above the bar (the bar stays on top,
 * the page and the assistant orb blur behind); choosing one opens that page growing out of the chosen tile
 * (revealNavigate). Tiles follow 界面偏好 → 导航栏样式: icon + text, icon only, or text only.
 */
const router = useRouter(); const route = useRoute(); const preferences = usePreferencesStore(); const closet = useClosetStore()
const open = ref(false)
const mode = computed(() => preferences.navLabels)
// ToC 改版（二）：＋ 只管“往衣柜里放东西”；新建搭配、OOTD 试穿移到“今天”和“试穿”。
const ACTIONS = computed(() => [
  { key: 'garment', label: '拍一件', icon: CameraOutlined, to: '/add' },
  { key: 'preset', label: '常见单品', icon: AppstoreAddOutlined, to: '/wardrobe?presets=1' },
  { key: 'wanted', label: `存一件${wantedLabel.value}`, icon: HeartOutlined, to: '/add?wanted=1' },
])
function toggle() { open.value = !open.value; playSound(open.value ? 'rise' : 'tick'); if (open.value) loadWantedLabel() }
function close() { if (open.value) { open.value = false; playSound('tick') } }
function choose(to: string, event: MouseEvent) {
  playSound('tap')
  const tile = (event.currentTarget as HTMLElement).getBoundingClientRect()
  void revealNavigate(router, to, { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2, from: Math.min(tile.width, tile.height) / 2 }, () => { instant = true; open.value = false })
}
// Leaving is scripted so a reveal can drop the sheet at once: inside a View Transition no frame runs, and the new page
// must not be captured with the sheet still on it. The sheet stays in the old picture and grows away with it.
let instant = false
function sheetLeave(el: Element, done: () => void) {
  if (instant) { instant = false; void Promise.resolve().then(done); return }
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease', fill: 'forwards' }).finished.then(done, done)
}
function keys(event: KeyboardEvent) { if (event.key === 'Escape') close() }
watch(open, value => {
  document.documentElement.classList.toggle('add-menu-open', value)
  if (value) window.addEventListener('keydown', keys); else window.removeEventListener('keydown', keys)
})
watch(() => route.fullPath, () => { open.value = false })
onUnmounted(() => { window.removeEventListener('keydown', keys); document.documentElement.classList.remove('add-menu-open') })
</script>
<template>
  <a-button class="mobile-add" :class="{ open }" :aria-expanded="open" aria-haspopup="menu" :aria-label="open ? '收起添加菜单' : '添加'" @click="toggle">
    <i v-if="closet.pendingCount" class="mobile-add-dot" aria-hidden="true"></i>
    <em class="mobile-add-disc"><svg class="mobile-add-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></em>
    <b class="mobile-add-text">{{ open && mode === 'text' ? '收起' : '添加' }}</b>
  </a-button>
  <Teleport to="body">
    <Transition name="add-sheet" @leave="sheetLeave">
      <div v-if="open" class="add-sheet" :data-mode="mode" @click.self="close">
        <div class="add-sheet-card" role="menu" aria-label="添加">
          <a-button v-for="(action, index) in ACTIONS" :key="action.key" class="add-sheet-tile" role="menuitem" :aria-label="action.label" :style="{ '--i': index }" @click="choose(action.to, $event)">
            <i class="add-sheet-icon"><component :is="action.icon" /></i><b class="add-sheet-label">{{ action.label }}</b>
          </a-button>
          <a-button class="add-sheet-row" role="menuitem" :style="{ '--i': ACTIONS.length }" @click="choose('/pending', $event)">
            <InboxOutlined /><b>整理中</b><small>{{ closet.pendingCount ? `${closet.pendingCount} 件，做好会自动收进衣柜` : '没有正在整理的衣服' }}</small><RightOutlined class="add-sheet-row-arrow" />
          </a-button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<style>
/* Not scoped: the trigger sits in the .mobile-nav grid from style.css and the sheet lives under <body>.
   Inner parts are <em>/<b>/<i>, not <span>, so Ant Design rules for `.ant-btn > span` do not reach them (and the bar disc is not an <i>: `.mobile-nav i` is the pending dot). */
.mobile-nav .mobile-add.ant-btn { grid-column: 3; grid-row: 1; justify-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 64px; min-height: 50px; height: 50px; padding: 0; border: 0; border-radius: 0; color: var(--muted-subtle); background: transparent; box-shadow: none; font-size: 12px; }
/* html prefix: outranks Ant Design's runtime hover/focus fill, which otherwise leaves a light box after a tap. */
html .mobile-nav .mobile-add.ant-btn:hover, html .mobile-nav .mobile-add.ant-btn:focus, html .mobile-nav .mobile-add.ant-btn:active { color: var(--muted-subtle); background: transparent; }
html .mobile-nav .mobile-add.open.ant-btn { color: var(--ink); }
.mobile-add-disc { display: grid; place-items: center; width: 40px; height: 24px; border-radius: 12px; font-style: normal; color: var(--action-fg); background: var(--action-bg); transition: transform .28s cubic-bezier(.34, 1.56, .64, 1); }
.mobile-add.ant-btn:active .mobile-add-disc { transform: scale(.88); }
.mobile-add-mark { display: block; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; transition: transform .3s cubic-bezier(.34, 1.56, .64, 1); }
.mobile-add.open .mobile-add-mark { transform: rotate(135deg); }
.mobile-add.open .mobile-add-disc { animation: add-disc-jelly .5s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes add-disc-jelly { 0% { transform: scale(1); } 30% { transform: scale(1.18, .82); } 60% { transform: scale(.92, 1.08); } 100% { transform: scale(1); } }
.mobile-add-text { font-weight: 400; line-height: 1.2; }
.mobile-add.open .mobile-add-text { font-weight: 600; }
html[data-nav-labels='icon'] .mobile-add-text { display: none; }
html[data-nav-labels='icon'] .mobile-add-disc { width: 44px; height: 28px; border-radius: 14px; }
html[data-nav-labels='text'] .mobile-add-disc { display: none; }
html[data-nav-labels='text'] .mobile-nav .mobile-add.ant-btn { width: auto; }
html[data-nav-labels='text'] .mobile-add-text { padding: 6px 16px; border-radius: 16px; font-size: 14px; font-weight: 500; color: var(--action-fg); background: var(--action-bg); }

/* While open the bar sits above the blur (the assistant orb is z 910), so the trigger stays usable as “close”. */
html.add-menu-open .mobile-nav { z-index: 930; }
.mobile-nav .mobile-add-dot { position: absolute; top: 4px; right: calc(50% - 22px); z-index: 1; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 2px var(--surface); }
.add-sheet-row.ant-btn { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 16px; border: 0; border-radius: 16px; color: var(--ink); background: var(--surface-alt); box-shadow: none; text-align: left; }
.add-sheet-row.ant-btn > .anticon:first-child { font-size: 18px; color: var(--accent-strong); }
.add-sheet-row b { font-weight: 500; }
.add-sheet-row small { flex: 1; min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.add-sheet-row-arrow { font-size: 11px; color: var(--muted-subtle); }
.add-sheet-enter-active .add-sheet-row { transition: opacity .24s ease calc(60ms + var(--i) * 35ms), transform .32s cubic-bezier(.22, 1.3, .36, 1) calc(60ms + var(--i) * 35ms); }
.add-sheet-enter-from .add-sheet-row { opacity: 0; transform: translateY(14px); }
.add-sheet { position: fixed; inset: 0; z-index: 920; background: color-mix(in srgb, var(--paper) 70%, transparent); backdrop-filter: blur(14px) saturate(1.1); -webkit-backdrop-filter: blur(14px) saturate(1.1); }
.add-sheet-card { position: absolute; left: 12px; right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 18px 40px #0000002a, 0 2px 8px #00000012; transform-origin: 50% 100%; }
html[data-nav-labels='text'] .add-sheet-card { bottom: calc(70px + env(safe-area-inset-bottom)); }
.add-sheet-tile.ant-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: auto; min-height: 84px; padding: 12px 4px 10px; border: 0; border-radius: 16px; color: var(--ink); background: transparent; box-shadow: none; transition: background .15s ease, transform .15s ease; }
.add-sheet-tile.ant-btn:hover, .add-sheet-tile.ant-btn:focus-visible { color: var(--ink); background: var(--surface-alt); }
.add-sheet-tile.ant-btn:active { transform: scale(.92); background: var(--surface-alt); }
.add-sheet-tile.ant-btn:active .add-sheet-icon { transform: scale(.9) rotate(-6deg); }
.add-sheet-icon { transition: transform .2s cubic-bezier(.34, 1.56, .64, 1); }
.add-sheet-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; font-style: normal; font-size: 20px; color: var(--action-fg); background: var(--action-bg); }
.add-sheet-tile:first-child .add-sheet-icon { background: var(--accent); color: #fff; }
.add-sheet-label { font-size: 12px; font-weight: 500; line-height: 1.3; white-space: nowrap; }
.add-sheet[data-mode='icon'] .add-sheet-label { display: none; }
.add-sheet[data-mode='icon'] .add-sheet-tile.ant-btn { min-height: 68px; }
.add-sheet[data-mode='text'] .add-sheet-icon { display: none; }
.add-sheet[data-mode='text'] .add-sheet-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.add-sheet[data-mode='text'] .add-sheet-tile.ant-btn { min-height: 52px; background: var(--surface-alt); }
.add-sheet[data-mode='text'] .add-sheet-label { font-size: 15px; }

/* Card rises from the bar; tiles follow one after another. */
.add-sheet-enter-active { transition: opacity .2s ease; }
.add-sheet-enter-from { opacity: 0; }
.add-sheet-enter-active .add-sheet-card { transition: transform .34s cubic-bezier(.22, 1.2, .36, 1); }
.add-sheet-enter-from .add-sheet-card { transform: translateY(24px) scale(.94); }
.add-sheet-enter-active .add-sheet-tile { transition: opacity .24s ease calc(60ms + var(--i) * 35ms), transform .32s cubic-bezier(.22, 1.3, .36, 1) calc(60ms + var(--i) * 35ms); }
.add-sheet-enter-from .add-sheet-tile { opacity: 0; transform: translateY(14px) scale(.9); }
.add-sheet-enter-active .add-sheet-icon { animation: add-icon-pop .5s cubic-bezier(.34, 1.56, .64, 1) calc(120ms + var(--i) * 45ms) backwards; }
@keyframes add-icon-pop { 0% { transform: scale(.4) rotate(-20deg); } 70% { transform: scale(1.12) rotate(4deg); } 100% { transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .mobile-add.open .mobile-add-disc, .add-sheet-enter-active .add-sheet-icon { animation: none; }
  .mobile-add-disc, .mobile-add-mark, .add-sheet-tile.ant-btn, .add-sheet-icon, .add-sheet-enter-active .add-sheet-card, .add-sheet-enter-active .add-sheet-tile { transition: none; }
  .add-sheet-enter-from .add-sheet-card, .add-sheet-enter-from .add-sheet-tile { transform: none; }
}
</style>
