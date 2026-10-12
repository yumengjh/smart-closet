<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme as antTheme } from 'ant-design-vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  AppstoreOutlined, CheckCircleOutlined, PictureOutlined, PlusOutlined,
  SettingOutlined, LogoutOutlined, SkinOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import { antTokens, antComponentTokens } from '../theme/tokens'
import { usingMocks } from '../services/api'
import SoundToggle from './SoundToggle.vue'
import ThemeToggle from './ThemeToggle.vue'
import MinimalToggle from './MinimalToggle.vue'
import { usePreferencesStore } from '../stores/preferences'
import BloubAvatar from '../agent/BloubAvatar.vue'
import AssistantPanel from '../agent/AssistantPanel.vue'
import TaskInbox from './TaskInbox.vue'
import TaskToast from './TaskToast.vue'
import WaitingGame from './WaitingGame.vue'
import WaitingStarted from './WaitingStarted.vue'
import { useProcessingStore } from '../stores/processing'
import { installInteractionSounds, unlockSound } from '../services/sound'
import { pendingPath, prefetchRoute, prefetchWhenIdle } from '../composables/useRouteProgress'

const route = useRoute()
const router = useRouter()
const closet = useClosetStore()
const appearance = useThemeStore()
const processing = useProcessingStore()
watch(() => closet.user && !closet.user.mustChangePassword ? closet.user.username : '', user => { if (user) processing.start(user); else processing.stop() }, { immediate: true })
watch(() => route.fullPath, () => { void processing.refresh(true) })
watch(() => processing.latestNotice, notice => { if (notice) void closet.refreshCounts() })
onUnmounted(() => processing.stop())
const closetTheme = computed(() => ({
  algorithm: appearance.isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: antTokens(appearance.isDark ? 'dark' : 'light'),
  components: antComponentTokens(appearance.isDark ? 'dark' : 'light'),
}))
const isLogin = computed(() => route.path === '/login')
const isOutfitEditor = computed(() => route.path.startsWith('/outfits/'))
const navItems = [
  { path: '/wardrobe', label: '我的衣柜', icon: AppstoreOutlined },
  { path: '/pending', label: '未入柜', icon: CheckCircleOutlined },
  { path: '/outfits', label: '组合台', icon: PictureOutlined },
  // OOTD was only reachable from settings and the editor; the bottom bar keeps its five slots, so it is desktop-only there.
  { path: '/ootd', label: 'OOTD 试穿', icon: SkinOutlined, desktopOnly: true },
  { path: '/settings', label: '我的', icon: SettingOutlined },
]
// Highlight the clicked destination immediately; on slow networks the route itself resolves later.
const navPath = computed(() => pendingPath.value ?? route.path)
function isNavActive(path: string) {
  const current = navPath.value
  return current === path || (path === '/wardrobe' && current.startsWith('/garment')) || (path === '/outfits' && current.startsWith('/outfits'))
}
const assistantShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
function openAssistant() { window.dispatchEvent(new CustomEvent('closet-assistant-open')) }
const visibleNavItems = computed(() => closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)
const mobileNavItems = computed(() => visibleNavItems.value.filter(item => !item.desktopOnly))
usePreferencesStore()
const prefetch = (path: string) => prefetchRoute(router, path)
watch(() => closet.isSignedIn && !closet.user?.mustChangePassword, ready => { if (ready) prefetchWhenIdle(router, [...navItems.map(item => item.path), '/add', '/tasks']) }, { immediate: true })
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

watch(() => [closet.user?.username, closet.user?.mustChangePassword], () => { void closet.refreshCounts() }, { immediate: true })
function sessionExpired() { closet.user = null; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/login') }
function passwordRequired() { if (closet.user) closet.user.mustChangePassword = true; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/settings?firstLogin=1') }
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
  <a-config-provider :theme="closetTheme" :locale="zhCN">
    <a-app>
      <div class="route-progress" :class="{ active: showProgress }" role="progressbar" aria-label="页面加载中" :aria-hidden="!showProgress"><span></span></div>
      <div v-if="isLogin" class="login-frame"><RouterView /></div>
      <div v-else-if="closet.isSignedIn && (!closet.user?.mustChangePassword || route.path === '/settings')" class="app-frame" :class="{ 'outfit-editing': isOutfitEditor }">
        <aside class="sidebar">
          <RouterLink :to="closet.user?.mustChangePassword ? '/settings' : '/wardrobe'" class="brand-lockup" aria-label="鱼搭首页">
            <img class="brand-logo" src="/yuda-logo.png" alt="" />
            <span><strong>鱼搭</strong><small>数字衣橱</small></span>
          </RouterLink>
          <RouterLink v-if="!closet.user?.mustChangePassword" to="/add" class="sidebar-add" @pointerenter="prefetch('/add')"><PlusOutlined /> 添加衣物</RouterLink><p class="nav-label">我的空间</p>
          <nav class="main-nav" aria-label="主导航">
            <RouterLink v-for="item in visibleNavItems" :key="item.path" :to="item.path" class="nav-link" :class="{ active: isNavActive(item.path), pending: pendingPath === item.path }" @pointerenter="prefetch(item.path)" @focus="prefetch(item.path)">
              <component :is="item.icon" /><span>{{ item.label }}</span>
              <span v-if="item.path === '/pending' && closet.pendingCount" class="nav-count">{{ closet.pendingCount }}</span>
              <span v-if="item.path === '/tasks' && closet.taskCount" class="nav-count quiet">{{ closet.taskCount }}</span>
            </RouterLink>
          </nav>
          <div class="profile-row">
            <span class="avatar">{{ closet.user?.username?.slice(0, 1).toUpperCase() }}</span>
            <span class="profile-name"><strong>{{ closet.user?.username }}</strong><small>我的衣橱</small></span>
            <a-tooltip title="退出登录">
              <a-button type="text" shape="circle" danger class="sign-out" aria-label="退出登录" @click="signOut"><template #icon><LogoutOutlined /></template></a-button>
            </a-tooltip>
          </div>
        </aside>
        <main class="main-area">
          <div v-if="usingMocks" class="mock-banner"><span class="mock-pulse"></span><span>界面演示 · 示例数据不是 AI 结果，演示模式禁止提交模型任务</span><span class="mock-banner-end">{{ closet.user?.username }} 的衣橱</span></div>
          <header class="topbar"><div class="topbar-actions"><a-button v-if="!closet.user?.mustChangePassword" class="topbar-assistant" :aria-label="`问鱼搭助手（${assistantShortcut}）`" @click="openAssistant"><BloubAvatar :size="28" expression="happy" /><span>问鱼搭</span><kbd>{{ assistantShortcut }}</kbd></a-button><MinimalToggle v-if="!closet.user?.mustChangePassword" /><ThemeToggle /><SoundToggle /><TaskInbox v-if="!closet.user?.mustChangePassword" /></div></header>
          <section class="route-content" :aria-busy="!!pendingPath"><TaskToast /><RouterView v-slot="{ Component }"><Transition name="route-fade" mode="out-in"><div :key="viewKey(Component)" class="route-view"><component :is="Component" /></div></Transition></RouterView></section>
          <WaitingGame v-if="!closet.user?.mustChangePassword" />
          <WaitingStarted v-if="!closet.user?.mustChangePassword" />
          <AssistantPanel v-if="!closet.user?.mustChangePassword" :key="closet.user?.username" />
        </main>
        <nav v-if="!closet.user?.mustChangePassword" class="mobile-nav" aria-label="移动端主导航">
          <RouterLink v-for="item in mobileNavItems" :key="item.path" :to="item.path" :class="{ active: isNavActive(item.path), pending: pendingPath === item.path }" @touchstart.passive="prefetch(item.path)"><component :is="item.icon" /><span>{{ item.label }}</span><i v-if="item.path === '/pending' && closet.pendingCount"></i></RouterLink>
          <RouterLink to="/add" class="mobile-add"><PlusOutlined /><span>添加</span></RouterLink>
        </nav>
      </div>
      <div v-else class="boot-screen"><img class="brand-logo boot-logo" src="/yuda-logo.png" alt="鱼搭" /><p>正在打开衣橱…</p></div>
    </a-app>
  </a-config-provider>
</template>

<style scoped>
.route-progress { position: fixed; z-index: 2000; inset: 0 0 auto; height: 2px; overflow: hidden; opacity: 0; pointer-events: none; transition: opacity .2s; }
.route-progress.active { opacity: 1; }
.route-progress span { position: absolute; inset: 0 auto 0 0; width: 40%; background: var(--accent); border-radius: 0 2px 2px 0; transform: translateX(-100%); }
.route-progress.active span { animation: route-progress-slide 1.1s cubic-bezier(.4, 0, .2, 1) infinite; }
@keyframes route-progress-slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
.nav-link.pending .anticon, .mobile-nav .pending .anticon { animation: nav-pending-pulse .9s ease-in-out infinite; }
@keyframes nav-pending-pulse { 50% { opacity: .45; } }
.route-fade-enter-active { transition: opacity .2s ease-out, transform .2s ease-out; }
.route-fade-leave-active { transition: opacity .1s ease-in; }
.route-fade-enter-from { opacity: 0; transform: translateY(6px); }
.route-fade-leave-to { opacity: 0; }
/* The editor fills the viewport through a height chain and owns fixed controls, so keep the wrapper transparent there. */
.outfit-editing .route-view { height: 100%; min-height: 0; }
.outfit-editing .route-fade-enter-from { transform: none; }
@media (prefers-reduced-motion: reduce) {
  .route-fade-enter-from { transform: none; }
  .route-progress.active span { animation: none; width: 100%; transform: none; opacity: .6; }
  .nav-link.pending .anticon, .mobile-nav .pending .anticon { animation: none; }
}
.topbar-assistant.ant-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 6px 0 2px; border-radius: 999px; color: var(--muted-strong); }
.topbar-assistant kbd { padding: 1px 6px; border: 1px solid var(--line); border-radius: 6px; font-size: 11px; line-height: 16px; font-family: inherit; color: var(--muted); background: var(--surface-alt); }
@media(max-width:1023px){.topbar-assistant.ant-btn{display:none}}
</style>
