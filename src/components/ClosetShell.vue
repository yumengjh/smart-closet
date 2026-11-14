<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme as antTheme } from 'ant-design-vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { PlusOutlined, SettingOutlined, LogoutOutlined, BgColorsOutlined, SoundOutlined, AudioMutedOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import { antTokens, antComponentTokens } from '../theme/tokens'
import { usingMocks } from '../services/api'
import SoundToggle from './SoundToggle.vue'
import ThemeToggle from './ThemeToggle.vue'
import { usePreferencesStore } from '../stores/preferences'
import AssistantPanel from '../agent/AssistantPanel.vue'
import TaskInbox from './TaskInbox.vue'
import NavGlyph from '../shell/NavGlyph.vue'
import AddLauncher from '../shell/AddLauncher.vue'
import { revealing } from '../shell/revealNavigate'
import TaskToast from './TaskToast.vue'
import GuideTour from '../shell/GuideTour.vue'
import WaitingGame from './WaitingGame.vue'
import WaitingStarted from './WaitingStarted.vue'
import RenderSendOff from './RenderSendOff.vue'
import { useProcessingStore } from '../stores/processing'
import { installInteractionSounds, soundEnabled, toggleSound, unlockSound } from '../services/sound'
import { pendingPath, prefetchRoute, prefetchWhenIdle } from '../composables/useRouteProgress'
import { accountIsStale, markAccountStale, onAccountChange } from '../domain/accountSession'
import { useNotificationStore } from '../stores/notifications'
import { refreshTryOnAccess, resetTryOnAccess } from '../tryon/access'
import BillingSummary from '../billing/BillingSummary.vue'
import PurchaseDrawer from '../billing/PurchaseDrawer.vue'
import { useBillingStore } from '../billing/store'
import { CAMERA_LAYOUT_QUERY } from '../tryon/stage'

const route = useRoute()
const router = useRouter()
const closet = useClosetStore()
const billing = useBillingStore()
watch(() => closet.user && !closet.user.mustChangePassword ? closet.user.username : '', name => { billing.reset(); if (name) void billing.refresh() }, { immediate: true })
const refreshBilling = () => { if (closet.user && !closet.user.mustChangePassword && !document.hidden) void billing.refresh() }
watch(() => route.fullPath, refreshBilling)
let billingTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { window.addEventListener('focus', refreshBilling); billingTimer = setInterval(refreshBilling, 60000) })
onUnmounted(() => { window.removeEventListener('focus', refreshBilling); clearInterval(billingTimer) })
const appearance = useThemeStore()
const processing = useProcessingStore()
watch(() => closet.user && !closet.user.mustChangePassword ? closet.user.username : '', (user, _previous, onCleanup) => {
  if (!user) { processing.stop(); return }
  let current = true
  onCleanup(() => { current = false })
  // Session loading can finish while the initial route is still '/'. Wait for the actual destination.
  void router.isReady().then(() => { if (current) processing.start(user, route.path === '/wardrobe') })
}, { immediate: true })
watch(() => route.fullPath, () => {
  if (route.path === '/wardrobe') processing.deferDiscovery()
  else { processing.resumeDiscovery(); void processing.refresh(true) }
})
watch(() => processing.latestNotice, notice => { if (notice) void closet.refreshCounts() })
onUnmounted(() => processing.stop())
const closetTheme = computed(() => ({
  algorithm: appearance.isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: antTokens(appearance.isDark ? 'dark' : 'light'),
  components: antComponentTokens(appearance.isDark ? 'dark' : 'light'),
}))
const tryonRoute = computed(() => route.path === '/try-on')
// 清新改版（docs/design/2026-11-04-清新改版：胶囊导航与衣架衣柜设计.md）：没有侧栏了，导航是底部悬浮胶囊，
// 页面内容不再让出左侧宽度；--sidebar-w 置 0 让沿用它的浮层（翻页条等）回到正中。
const frameStyle = { '--sidebar-w': '0px' }
// 注册后问询 /welcome 也是全屏页，但需要已登录（路由守卫负责）。
const isLogin = computed(() => ['/login', '/register'].includes(route.path) || route.path === '/welcome' && closet.isSignedIn)
const isOutfitEditor = computed(() => route.path.startsWith('/outfits/'))
const tryonMediaQuery = window.matchMedia(CAMERA_LAYOUT_QUERY)
const tryonNarrow = ref(tryonMediaQuery.matches)
const updateTryonNarrow = () => { tryonNarrow.value = tryonMediaQuery.matches }
let tryonAccessTimer = 0
watch(() => closet.user && !closet.user.mustChangePassword ? closet.user.username : '', name => { resetTryOnAccess(); if (name) void refreshTryOnAccess() }, { immediate: true })
onMounted(() => { tryonMediaQuery.addEventListener('change', updateTryonNarrow); tryonAccessTimer = window.setInterval(() => { if (closet.user && !closet.user.mustChangePassword && !document.hidden) void refreshTryOnAccess() }, 60000) })
onUnmounted(() => { tryonMediaQuery.removeEventListener('change', updateTryonNarrow); clearInterval(tryonAccessTimer) })
// ToC 改版（二）3.2：底部胶囊为 今天 / 衣柜 / ＋ / 试穿 / 我的，手机与桌面结构相同（mobile = 手机上的排列位置，＋ 在 20）。
// 问鱼搭不在胶囊里，改为右下角悬浮表情（#assistant-dock-slot 移到 nav 外）。未入柜、OOTD、组合台不再是一级入口。
type NavItem = { path: string; label: string; glyph: 'today' | 'wardrobe' | 'try' | 'me'; mobile: number }
const navItems: NavItem[] = [
  { path: '/today', label: '今天', glyph: 'today', mobile: 0 },
  { path: '/wardrobe', label: '衣柜', glyph: 'wardrobe', mobile: 10 },
  { path: '/try', label: '试穿', glyph: 'try', mobile: 30 },
  { path: '/settings', label: '我的', glyph: 'me', mobile: 40 },
]
const ACTIVE_PREFIXES: Record<string, string[]> = { '/today': ['/today', '/outfits'], '/wardrobe': ['/wardrobe', '/garment', '/pending', '/review', '/batches', '/trash'], '/try': ['/try', '/ootd', '/creation'], '/settings': ['/settings', '/help', '/admin', '/vip'] }
// Highlight the clicked destination immediately; on slow networks the route itself resolves later.
const navPath = computed(() => pendingPath.value ?? route.path)
function isNavActive(path: string) {
  const current = navPath.value
  return (ACTIVE_PREFIXES[path] ?? [path]).some(prefix => current === prefix || current.startsWith(`${prefix}/`))
}
const visibleNavItems = computed(() => closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)
const preferences = usePreferencesStore()
const prefetch = (path: string) => prefetchRoute(router, path)
// Dock: a pill behind the active tab that springs from tab to tab. On desktop it covers the whole tab (dark pill, light
// text); on phones it sits behind the icon (or the label in text-only style). Measured from the DOM so it follows every
// 导航栏样式 and screen width; the first placement does not animate.
const mobileNav = ref<HTMLElement | null>(null)
const indicator = ref<{ x: number; y: number; w: number; h: number; instant: boolean } | null>(null)
const wideQuery = window.matchMedia('(min-width: 1024px)')
function placeIndicator() {
  const nav = mobileNav.value, link = nav?.querySelector<HTMLElement>(':scope > a.active')
  if (!nav || !link || !link.getBoundingClientRect().width) { indicator.value = null; return }
  if (wideQuery.matches) {
    const box = link.getBoundingClientRect(), base = nav.getBoundingClientRect()
    indicator.value = { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height, instant: !indicator.value }
    return
  }
  const glyph = link.querySelector<HTMLElement>('.nav-glyph-box'), label = link.querySelector<HTMLElement>(':scope > span')
  const target = glyph && glyph.getBoundingClientRect().width ? glyph : label
  if (!target) return
  const box = target.getBoundingClientRect(), base = nav.getBoundingClientRect()
  const w = box.width + (target === glyph ? 26 : 22), h = box.height + (target === glyph ? 8 : 12)
  indicator.value = { x: box.left - base.left + box.width / 2 - w / 2, y: box.top - base.top + box.height / 2 - h / 2, w, h, instant: !indicator.value }
}
watch([navPath, () => preferences.navLabels, mobileNav], () => { void nextTick(placeIndicator) }, { immediate: true })
// The bar's own size, not window resize: its width also changes when the layout viewport does (page zoom, fonts, scrollbars).
const navResize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => placeIndicator())
watch(mobileNav, (el, old) => { if (old) navResize?.unobserve(old); if (el) navResize?.observe(el) })
onMounted(() => window.addEventListener('resize', placeIndicator))
onUnmounted(() => { window.removeEventListener('resize', placeIndicator); navResize?.disconnect() })
// The dock steps aside while reading down a long page and comes back on the way up (or near the top / bottom).
const dockAway = ref(false)
let lastScroll = window.scrollY
function dockScroll() {
  const y = window.scrollY, delta = y - lastScroll
  lastScroll = y
  const nearEnd = window.innerHeight + y > document.documentElement.scrollHeight - 80
  if (y < 120 || nearEnd || delta < -8) dockAway.value = false
  else if (delta > 12) dockAway.value = true
}
watch(() => route.path, () => { dockAway.value = false })
onMounted(() => window.addEventListener('scroll', dockScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', dockScroll))
// Route fade, in script rather than CSS classes: a reveal navigation (revealNavigate) swaps pages instantly inside a
// View Transition, where no frame is rendered, so the fade must be skippable without touching the <Transition> itself.
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// done() must not run synchronously inside the hook: with mode="out-in" Vue would mount the next page before the old
// node is detached (TypeError on parentNode). A microtask is enough and needs no rendered frame.
const soon = (done: () => void) => { void Promise.resolve().then(done) }
function routeLeave(el: Element, done: () => void) {
  if (revealing.value || calm()) { soon(done); return }
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done)
}
function routeEnter(el: Element, done: () => void) {
  if (revealing.value) { soon(done); return }
  const lift = !calm() && !isOutfitEditor.value
  el.animate([{ opacity: 0, transform: lift ? 'translateY(6px)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' }).finished.then(done, done)
}
watch(() => closet.isSignedIn && !closet.user?.mustChangePassword, ready => { if (ready) prefetchWhenIdle(router, [...navItems.map(item => item.path), '/add', '/tasks', '/outfits']) }, { immediate: true })
// Show the progress bar only when navigation is noticeably slow, so fast switches stay calm.
const showProgress = ref(false)
let progressTimer = 0
watch(pendingPath, path => {
  clearTimeout(progressTimer)
  if (path) progressTimer = window.setTimeout(() => { showProgress.value = true }, 120)
  else showProgress.value = false
})
onUnmounted(() => clearTimeout(progressTimer))
// Reuse the same instance when only params change (e.g. /outfits/new to /outfits/:id), matching prior behavior.
const componentKeys = new WeakMap<object, number>()
let nextComponentKey = 0
function viewKey(component: { type: unknown } | undefined) {
  const type = component?.type
  if (!type || typeof type !== 'object' && typeof type !== 'function') return 'empty'
  if (!componentKeys.has(type)) componentKeys.set(type, ++nextComponentKey)
  return componentKeys.get(type)
}

watch(() => [closet.user?.username, closet.user?.mustChangePassword], (_user, _previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  void router.isReady().then(() => { if (current && route.path !== '/wardrobe') void closet.refreshCounts() })
}, { immediate: true })
function sessionExpired() { closet.user = null; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/login') }
function passwordRequired() { if (closet.user) closet.user.mustChangePassword = true; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/settings?firstLogin=1') }
// Another tab signed in as someone else (smart-closet-server#160): this page still shows the previous account, so it stops
// polling, forgets what it fetched and asks for a reload instead of letting later clicks run as the new account.
const accountStale = ref(accountIsStale())
function accountChanged() {
  accountStale.value = accountIsStale()
  if (!accountStale.value) return
  useNotificationStore().stop(); processing.stop()
  closet.taskCount = 0; closet.pendingCount = 0
}
const stopWatchingAccount = onAccountChange(accountChanged)
function accountMismatch() { markAccountStale() }
function wakeUp() { if (document.visibilityState === 'visible') void closet.verifyAccount() }
function reloadPage() { window.location.reload() }
document.addEventListener('visibilitychange', wakeUp)
window.addEventListener('focus', wakeUp)
window.addEventListener('closet-account-mismatch', accountMismatch)
onUnmounted(() => { stopWatchingAccount(); document.removeEventListener('visibilitychange', wakeUp); window.removeEventListener('focus', wakeUp); window.removeEventListener('closet-account-mismatch', accountMismatch) })
window.addEventListener('closet-session-expired', sessionExpired)
window.addEventListener('closet-password-change-required', passwordRequired)
onUnmounted(() => { window.removeEventListener('closet-session-expired', sessionExpired); window.removeEventListener('closet-password-change-required', passwordRequired) })

let removeInteractionSounds: (() => void) | undefined
onMounted(() => { removeInteractionSounds = installInteractionSounds(); window.addEventListener('pointerdown', unlockSound, { capture: true }); window.addEventListener('keydown', unlockSound, { capture: true }) })
onUnmounted(() => { removeInteractionSounds?.(); window.removeEventListener('pointerdown', unlockSound, true); window.removeEventListener('keydown', unlockSound, true) })

async function signOut() {
  await closet.signOut()
  await router.replace('/login')
}
</script>

<template>
  <a-config-provider :theme="closetTheme" :locale="zhCN" :auto-insert-space-in-button="false">
    <a-app>
      <a-modal :open="accountStale" title="登录账号已切换" :closable="false" :mask-closable="false" :keyboard="false" centered :mask-style="{ backdropFilter: 'blur(14px)' }" :z-index="3000">
        <p>这个浏览器已在另一个窗口切换了登录账号。本页还停留在之前的账号，为避免照片或资料提交到新账号，已暂停所有操作。</p>
        <p>请重新加载页面，进入当前账号。</p>
        <template #footer><a-button type="primary" @click="reloadPage">重新加载</a-button></template>
      </a-modal>
      <div class="route-progress" :class="{ active: showProgress }" role="progressbar" aria-label="页面加载中" :aria-hidden="!showProgress"><span></span></div>
      <div v-if="isLogin" class="login-frame"><RouterView /></div>
      <div v-else-if="closet.isSignedIn && (!closet.user?.mustChangePassword || route.path === '/settings')" class="app-frame" :class="{ 'outfit-editing': isOutfitEditor, 'tryon-camera-mode': tryonRoute }" :style="frameStyle">
        <main class="main-area">
          <div v-if="usingMocks" class="mock-banner"><span class="mock-pulse"></span><span>界面演示 · 示例数据不是 AI 结果，演示模式禁止提交模型任务</span><span class="mock-banner-end">{{ closet.user?.displayName || closet.user?.username }} 的衣橱</span></div>
          <header class="topbar">
            <div class="topbar-lead">
              <RouterLink :to="closet.user?.mustChangePassword ? '/settings' : '/today'" class="brand-lockup" aria-label="鱼搭首页">
                <span class="brand-mark"><img src="/yuda-logo-192.png" alt="" /></span>
                <span class="brand-text"><strong>鱼搭</strong></span>
              </RouterLink>
              <!-- 页面标题位：页面用 <Teleport defer to="#topbar-page"> 把自己的标题和计数放到 logo 旁边（清新改版 §2）。 -->
              <div id="topbar-page" class="topbar-page"></div>
            </div>
            <div class="topbar-actions">
              <BillingSummary v-if="!closet.user?.mustChangePassword" compact /><span class="topbar-prefs"><ThemeToggle /><SoundToggle /></span><span v-if="!closet.user?.mustChangePassword" id="assistant-top-slot" class="topbar-assistant-slot"></span><TaskInbox v-if="!closet.user?.mustChangePassword" />
              <a-dropdown :trigger="['click']" placement="bottomRight">
                <a-button type="text" shape="circle" class="topbar-profile" :aria-label="`账号：${closet.user?.displayName || closet.user?.username}`"><span class="avatar">{{ (closet.user?.displayName || closet.user?.username)?.slice(0, 1).toUpperCase() }}</span></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item key="who" disabled class="topbar-profile-name">{{ closet.user?.displayName || closet.user?.username }}</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item key="settings" @click="router.push('/settings')"><SettingOutlined /> 我的设置</a-menu-item>
                    <!-- 手机顶栏放不下主题和音效按钮，收进头像菜单（桌面同样可用）。 -->
                    <a-menu-item key="theme" @click="appearance.toggle()"><BgColorsOutlined /> {{ appearance.isDark ? '切换到浅色' : '切换到深色' }}</a-menu-item>
                    <a-menu-item key="sound" data-sound="off" @click="toggleSound()"><SoundOutlined v-if="soundEnabled" /><AudioMutedOutlined v-else /> {{ soundEnabled ? '关闭音效' : '开启音效' }}</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item key="signout" danger @click="signOut"><LogoutOutlined /> 退出登录</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </header>
          <section class="route-content" :aria-busy="!!pendingPath"><TaskToast /><RouterView v-slot="{ Component }"><Transition mode="out-in" :css="false" @enter="routeEnter" @leave="routeLeave"><div :key="viewKey(Component)" class="route-view"><component :is="Component" /></div></Transition></RouterView></section>
          <PurchaseDrawer v-if="!closet.user?.mustChangePassword" />
          <WaitingGame v-if="!closet.user?.mustChangePassword" />
          <WaitingStarted v-if="!closet.user?.mustChangePassword" /><RenderSendOff v-if="!closet.user?.mustChangePassword" />
          <AssistantPanel v-if="!closet.user?.mustChangePassword" :key="closet.user?.username" :suspended="tryonRoute && tryonNarrow" />
          <GuideTour v-if="!closet.user?.mustChangePassword" />
        </main>
        <!-- 底部悬浮胶囊：所有宽度共用。桌面按 order 排，手机按 --mobile-order 排（＋ 在正中）。 -->
        <nav ref="mobileNav" class="mobile-nav shell-dock" :class="{ away: dockAway }" aria-label="主导航">
          <RouterLink v-for="(item, index) in visibleNavItems" :key="item.path" :to="item.path" :class="{ active: isNavActive(item.path), pending: pendingPath === item.path }" :style="{ order: index * 10, '--mobile-order': closet.user?.mustChangePassword ? 0 : item.mobile }" :aria-current="isNavActive(item.path) ? 'page' : undefined" @pointerenter="prefetch(item.path)" @focus="prefetch(item.path)" @touchstart.passive="prefetch(item.path)">
            <NavGlyph :name="item.glyph" :active="isNavActive(item.path)" /><span>{{ item.label }}</span>
            <i v-if="item.path === '/wardrobe' && closet.pendingCount" :aria-label="`${closet.pendingCount} 件在整理`"></i>
          </RouterLink>
          <template v-if="!closet.user?.mustChangePassword">
            <AddLauncher />
            <a-tooltip title="添加衣物"><RouterLink to="/add" class="dock-add" aria-label="添加衣物" @pointerenter="prefetch('/add')"><PlusOutlined /><span>添加</span></RouterLink></a-tooltip>
            <span class="dock-sep" aria-hidden="true"></span>
            <span id="assistant-dock-slot" class="dock-assistant-slot"></span>
          </template>
          <span v-if="indicator" class="mobile-nav-indicator" :class="{ instant: indicator.instant }" :style="{ width: `${indicator.w}px`, height: `${indicator.h}px`, transform: `translate(${indicator.x}px, ${indicator.y}px)` }" aria-hidden="true"></span>
        </nav>

      </div>
      <div v-else class="boot-screen"><img class="brand-logo boot-logo" src="/yuda-logo-320.png" alt="鱼搭" /><p>正在打开衣橱…</p></div>
    </a-app>
  </a-config-provider>
</template>

<style scoped>
/* Brand: the wide graffiti mark sits on a soft tile so it reads as a logo, not a stray sticker. */
.topbar-lead { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; margin-right: auto; }
.topbar-prefs { display: contents; }
.topbar-assistant-slot { display: none; }
@media (max-width: 1023px) { .topbar-assistant-slot { display: flex; align-items: center; } }
.brand-lockup { display: flex; flex: none; align-items: center; gap: 10px; color: var(--ink); }
.topbar-page { display: flex; align-items: center; gap: 14px; min-width: 0; overflow: hidden; }
.topbar-page:not(:empty)::before { content: ''; flex: none; width: 1px; height: 18px; background: var(--line); }
.brand-mark { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; background: var(--accent-soft); }
.brand-mark img { display: block; width: 30px; height: 24px; object-fit: contain; }
.brand-text { display: flex; align-items: baseline; gap: 8px; min-width: 0; line-height: 1.2; }
.brand-text strong { font-size: 19px; font-weight: 650; letter-spacing: .04em; }
.topbar-profile.ant-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; min-width: 40px; height: 40px; padding: 0; }
.topbar-profile .avatar { width: 32px; height: 32px; color: var(--accent-strong); background: var(--accent-soft); font-size: 13px; }
.route-progress { position: fixed; z-index: 2000; inset: 0 0 auto; height: 2px; overflow: hidden; opacity: 0; pointer-events: none; transition: opacity .2s; }
.route-progress.active { opacity: 1; }
.route-progress span { position: absolute; inset: 0 auto 0 0; width: 40%; background: var(--brand); border-radius: 0 2px 2px 0; transform: translateX(-100%); }
.route-progress.active span { animation: route-progress-slide 1.1s cubic-bezier(.4, 0, .2, 1) infinite; }
@keyframes route-progress-slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
.mobile-nav .pending .anticon { animation: nav-pending-pulse .9s ease-in-out infinite; }
@keyframes nav-pending-pulse { 50% { opacity: .45; } }
/* The editor fills the viewport through a height chain and owns fixed controls, so keep the wrapper transparent there. */
.outfit-editing .route-view { height: 100%; min-height: 0; }
@media (max-width: 767px) { .topbar-prefs { display: none; } .topbar-lead { gap: 10px; } .topbar-page { gap: 10px; } .brand-text { display: none; } /* 手机只放 logo 图标：切页时标题位短暂为空也不会闪出文字 */ .topbar-page:not(:empty)::before { display: none; } .brand-mark { width: 34px; height: 34px; } }
@media (prefers-reduced-motion: reduce) {
  .route-progress.active span { animation: none; width: 100%; transform: none; opacity: .6; }
  .mobile-nav .pending .anticon { animation: none; }
}
</style>
