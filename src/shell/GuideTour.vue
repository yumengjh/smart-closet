<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tour as ATour } from 'ant-design-vue'
import { useClosetStore } from '../stores/closet'

/**
 * 新手指引 (issue #81): a short tour over the main entrances in the bottom dock (desktop pill or mobile bar).
 * It starts by itself only for an account just registered here (issue #87).
 * Shown once, right after registering (the wardrobe page asks after it loads, or after the preset picker of an
 * empty closet closes); 设置 → 新手指引 replays it. Steps whose element is not on screen (a hidden assistant) are left out.
 */
const KEY = 'yuda.guide.v1:'
const closet = useClosetStore(); const route = useRoute(); const router = useRouter()
const open = ref(false), current = ref(0)
type Step = { title: string; description: string; desktop: string; mobile: string }
// ToC 改版（二）：跟随新导航（今天 / 衣柜 / ＋ / 试穿 / 我的 + 悬浮的问鱼搭）。P3 再缩成 0～2 个就地提示（#239）。
const ALL: Step[] = [
  { title: '今天', description: '每天给你搭好一叠：左滑换一套，右滑就穿它。换多少次都不花点数。', desktop: '.shell-dock a[href$="/today"]', mobile: '.mobile-nav a[href$="/today"]' },
  { title: '添加衣服', description: '拍一张就能走，鱼搭在后台帮你抠图、认品类；也可以从常见单品里直接挑。', desktop: '.dock-add', mobile: '.mobile-add' },
  { title: '衣柜', description: '全部衣服都在这里，可以直接搜“黑色西裤”“适合海边的上衣”。正在整理的也在这里。', desktop: '.shell-dock a[href$="/wardrobe"]', mobile: '.mobile-nav a[href$="/wardrobe"]' },
  { title: '试穿', description: '把搭配生成上身效果图，看看穿在身上的样子。', desktop: '.shell-dock a[href$="/try"]', mobile: '.mobile-nav a[href$="/try"]' },
  { title: '问鱼搭', description: '想找衣服、要搭配，或者不知道怎么用，直接问它。', desktop: '.assistant-dock-entry', mobile: '.assistant-dock-entry' },
  { title: '我的', description: '风格偏好、主题、回收站和帮助都在这里。', desktop: '.shell-dock a[href$="/settings"]', mobile: '.mobile-nav a[href$="/settings"]' },
]
function visible(selector: string) { const el = selector ? document.querySelector<HTMLElement>(selector) : null; return el && el.getClientRects().length ? el : null }
const steps = ref<{ title: string; description: string; placement?: 'top'; target: () => HTMLElement }[]>([])
// Whichever dock layout is on screen (desktop pill or mobile bar) provides the target.
function build() {
  steps.value = ALL.map(s => ({ ...s, selector: visible(s.desktop) ? s.desktop : s.mobile })).filter(s => visible(s.selector))
    .map(s => ({ title: s.title, description: s.description, placement: 'top' as const, target: () => visible(s.selector) || document.body }))
}
const key = computed(() => closet.user ? KEY + closet.user.username : '')
// Issue #87: only an account registered in this browser waits for the tour ('pending', set by the register page);
// existing users never get it automatically and replay it from 我的 → 新手指引.
const seen = () => { try { return !key.value || localStorage.getItem(key.value) !== 'pending' } catch { return true } }
function remember() { try { if (key.value) localStorage.setItem(key.value, 'done') } catch { /* private mode */ } }
async function start() {
  if (route.path !== '/wardrobe') await router.push('/wardrobe')
  await nextTick(); window.setTimeout(() => { build(); if (steps.value.length) { current.value = 0; open.value = true } }, 400)
}
function finish() { open.value = false; remember() }
function onStart() { void start() }
// First visit: the wardrobe page asks once it has loaded and no preset picker is open (or after the picker closes).
function onFirstVisit() { if (!seen() && !open.value && !closet.user?.mustChangePassword) void start() }
function onResize() { if (open.value) build() }
onMounted(() => { window.addEventListener('closet-guide-start', onStart); window.addEventListener('closet-guide-first-visit', onFirstVisit); window.addEventListener('resize', onResize) })
onUnmounted(() => { window.removeEventListener('closet-guide-start', onStart); window.removeEventListener('closet-guide-first-visit', onFirstVisit); window.removeEventListener('resize', onResize) })
watch(() => closet.user?.username, () => { open.value = false })
</script>

<template>
  <a-tour v-model:current="current" :open="open" :steps="steps" type="primary" root-class-name="guide-tour" @close="finish" @finish="finish" />
</template>

<style>
/* The default 520px bubble runs off a phone screen; keep a 16px gutter on each side. */
.guide-tour.ant-tour { width: min(420px, calc(100vw - 32px)); }
</style>
