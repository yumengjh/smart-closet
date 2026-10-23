<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tour as ATour } from 'ant-design-vue'
import { useClosetStore } from '../stores/closet'

/**
 * 新手指引 (issue #81): a short tour over the main entrances, on the desktop sidebar or the mobile bottom bar.
 * It starts by itself only for an account just registered here (issue #87).
 * Shown once, right after registering (the wardrobe page asks after it loads, or after the preset picker of an
 * empty closet closes); 设置 → 新手指引 replays it. Steps whose element is not on screen (OOTD on mobile, a hidden assistant) are left out.
 */
const KEY = 'yuda.guide.v1:'
const closet = useClosetStore(); const route = useRoute(); const router = useRouter()
const open = ref(false), current = ref(0)
type Step = { title: string; description: string; desktop: string; mobile: string }
const ALL: Step[] = [
  { title: '添加衣物', description: '拍照或选几张照片就行。鱼搭会自动去背景、做成贴纸，并识别品类、颜色和季节。', desktop: '.sidebar-add', mobile: '.mobile-add' },
  { title: '未入柜', description: '还在处理或需要你核对的衣物在这里，可以批量确认入柜。', desktop: '.main-nav a[href$="/pending"]', mobile: '.mobile-nav a[href$="/pending"]' },
  { title: '我的衣柜', description: '全部衣物都在这里。可以直接搜“黑色西裤”“适合海边的上衣”，也能按品类、颜色、季节筛选。', desktop: '.main-nav a[href$="/wardrobe"]', mobile: '.mobile-nav a[href$="/wardrobe"]' },
  { title: '组合台', description: '把衣物拖到画板上自由搭配，也可以看“今天穿什么”的推荐，换一件、换一批都不消耗 AI 额度。', desktop: '.main-nav a[href$="/outfits"]', mobile: '.mobile-nav a[href$="/outfits"]' },
  { title: 'OOTD 试穿', description: '选好的搭配可以生成上身效果图。', desktop: '.main-nav a[href$="/ootd"]', mobile: '' },
  { title: '问鱼搭', description: '不知道怎么操作或想让它帮你找衣服、出搭配，直接问鱼搭助手。', desktop: '.topbar-assistant', mobile: '.assistant-orb' },
  { title: '我的', description: '主题、音效、推荐偏好、回收站和帮助都在这里，随时可以再看一遍这份指引。', desktop: '.main-nav a[href$="/settings"]', mobile: '.mobile-nav a[href$="/settings"]' },
]
function visible(selector: string) { const el = selector ? document.querySelector<HTMLElement>(selector) : null; return el && el.getClientRects().length ? el : null }
const steps = ref<{ title: string; description: string; placement?: 'top'; target: () => HTMLElement }[]>([])
// Whichever layout is on screen (sidebar or bottom bar) provides the target.
function build() {
  steps.value = ALL.map(s => ({ ...s, selector: visible(s.desktop) ? s.desktop : s.mobile })).filter(s => visible(s.selector))
    .map(s => ({ title: s.title, description: s.description, ...(s.selector === s.mobile ? { placement: 'top' as const } : {}), target: () => visible(s.selector) || document.body }))
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
