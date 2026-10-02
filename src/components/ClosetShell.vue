<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme as antTheme } from 'ant-design-vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  AppstoreOutlined, CheckCircleOutlined, HistoryOutlined, PictureOutlined, PlusOutlined,
  SettingOutlined, LogoutOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import { usingMocks } from '../services/api'
import SoundToggle from './SoundToggle.vue'
import ThemeToggle from './ThemeToggle.vue'
import AssistantPanel from '../agent/AssistantPanel.vue'
import { installInteractionSounds, unlockSound } from '../services/sound'

const route = useRoute()
const router = useRouter()
const closet = useClosetStore()
const appearance = useThemeStore()
const closetTheme = computed(() => ({
  algorithm: appearance.isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    colorPrimary: appearance.isDark ? '#829fff' : '#202124',
    colorInfo: appearance.isDark ? '#91aaff' : '#3f6ff5',
    colorLink: appearance.isDark ? '#adc2ff' : '#2958cc',
    colorSuccess: appearance.isDark ? '#66c49a' : '#25815d',
    colorWarning: appearance.isDark ? '#e5b65e' : '#ac721c',
    colorError: appearance.isDark ? '#f08d8d' : '#c74747',
    colorText: appearance.isDark ? '#edf0f6' : '#25262b',
    colorTextSecondary: appearance.isDark ? '#aeb5c2' : '#737680',
    colorTextLightSolid: appearance.isDark ? '#151a27' : '#ffffff',
    colorBgBase: appearance.isDark ? '#191c23' : '#ffffff',
    colorBgLayout: appearance.isDark ? '#191c23' : '#f7f8fa',
    colorBgContainer: appearance.isDark ? '#242832' : '#ffffff',
    colorBorder: appearance.isDark ? '#3b404b' : '#e8e9ee',
    borderRadius: 10,
    controlHeight: 44,
    fontSize: 14,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: 'none' },
    Input: { activeShadow: appearance.isDark ? '0 0 0 3px #829fff30' : '0 0 0 3px #3b6cf51c' },
  },
}))
const isLogin = computed(() => route.path === '/login')
const isOutfitEditor = computed(() => route.path.startsWith('/outfits/'))
const navItems = [
  { path: '/wardrobe', label: '我的衣柜', icon: AppstoreOutlined },
  { path: '/pending', label: '未入柜', icon: CheckCircleOutlined },
  { path: '/outfits', label: '组合台', icon: PictureOutlined },
  { path: '/settings', label: '我的', icon: SettingOutlined },
]

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
      <div v-if="isLogin" class="login-frame"><RouterView /></div>
      <div v-else-if="closet.isSignedIn && (!closet.user?.mustChangePassword || route.path === '/settings')" class="app-frame" :class="{ 'outfit-editing': isOutfitEditor }">
        <aside class="sidebar">
          <RouterLink :to="closet.user?.mustChangePassword ? '/settings' : '/wardrobe'" class="brand-lockup" aria-label="鱼搭首页">
            <img class="brand-logo" src="/yuda-logo.png" alt="" />
            <span><strong>鱼搭</strong><small>数字衣橱</small></span>
          </RouterLink>
          <RouterLink v-if="!closet.user?.mustChangePassword" to="/add" class="sidebar-add"><PlusOutlined /> 添加衣物</RouterLink><p class="nav-label">我的空间</p>
          <nav class="main-nav" aria-label="主导航">
            <RouterLink v-for="item in (closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)" :key="item.path" :to="item.path" class="nav-link" :class="{ active: route.path === item.path || (item.path === '/wardrobe' && route.path.startsWith('/garment')) || (item.path === '/outfits' && route.path.startsWith('/outfits')) }">
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
          <header class="topbar"><div class="topbar-actions"><ThemeToggle /><SoundToggle /><RouterLink v-if="!closet.user?.mustChangePassword" to="/tasks" class="topbar-tasks"><HistoryOutlined /> 任务记录<span v-if="closet.taskCount" class="nav-count">{{ closet.taskCount }}</span></RouterLink></div></header>
          <section class="route-content"><RouterView /></section>
          <AssistantPanel v-if="!closet.user?.mustChangePassword" :key="closet.user?.username" />
        </main>
        <nav v-if="!closet.user?.mustChangePassword" class="mobile-nav" aria-label="移动端主导航">
          <RouterLink v-for="item in (closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)" :key="item.path" :to="item.path" :class="{ active: route.path === item.path || (item.path === '/wardrobe' && route.path.startsWith('/garment')) || (item.path === '/outfits' && route.path.startsWith('/outfits')) }"><component :is="item.icon" /><span>{{ item.label }}</span><i v-if="item.path === '/pending' && closet.pendingCount"></i></RouterLink>
          <RouterLink to="/add" class="mobile-add"><PlusOutlined /><span>添加</span></RouterLink>
        </nav>
      </div>
      <div v-else class="boot-screen"><img class="brand-logo boot-logo" src="/yuda-logo.png" alt="鱼搭" /><p>正在打开衣橱…</p></div>
    </a-app>
  </a-config-provider>
</template>
