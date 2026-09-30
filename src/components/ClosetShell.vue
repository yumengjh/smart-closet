<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  AppstoreOutlined, CheckCircleOutlined, HistoryOutlined, PlusOutlined,
  SettingOutlined, LogoutOutlined, CloudOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { usingMocks } from '../services/api'

const route = useRoute()
const router = useRouter()
const closet = useClosetStore()
const closetTheme = {
  token: {
    colorPrimary: '#202124', colorInfo: '#3f6ff5', colorSuccess: '#25815d',
    colorWarning: '#ac721c', colorError: '#c74747', borderRadius: 10,
    controlHeight: 44, fontSize: 14,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: 'none' },
    Input: { activeShadow: '0 0 0 3px #3b6cf51c' },
  },
}
const isLogin = computed(() => route.path === '/login')
const navItems = [
  { path: '/wardrobe', label: '我的衣柜', icon: AppstoreOutlined },
  { path: '/pending', label: '未入柜', icon: CheckCircleOutlined },
  { path: '/tasks', label: '任务记录', icon: HistoryOutlined },
  { path: '/settings', label: '我的', icon: SettingOutlined },
]

watch(() => [closet.user?.username, closet.user?.mustChangePassword], () => { void closet.refreshCounts() }, { immediate: true })
function sessionExpired() { closet.user = null; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/login') }
function passwordRequired() { if (closet.user) closet.user.mustChangePassword = true; closet.taskCount = 0; closet.pendingCount = 0; void router.replace('/settings?firstLogin=1') }
window.addEventListener('closet-session-expired', sessionExpired)
window.addEventListener('closet-password-change-required', passwordRequired)
onUnmounted(() => { window.removeEventListener('closet-session-expired', sessionExpired); window.removeEventListener('closet-password-change-required', passwordRequired) })

async function signOut() {
  await closet.signOut()
  await router.replace('/login')
}
</script>

<template>
  <a-config-provider :theme="closetTheme">
    <a-app>
      <div v-if="isLogin" class="login-frame"><RouterView /></div>
      <div v-else-if="closet.isSignedIn && (!closet.user?.mustChangePassword || route.path === '/settings')" class="app-frame">
        <aside class="sidebar">
          <RouterLink :to="closet.user?.mustChangePassword ? '/settings' : '/wardrobe'" class="brand-lockup" aria-label="衣序首页">
            <span class="brand-mark"><span></span><span></span><span></span></span>
            <span><strong>衣序</strong><small>数字衣橱</small></span>
          </RouterLink>
          <RouterLink v-if="!closet.user?.mustChangePassword" to="/add" class="sidebar-add"><PlusOutlined /> 添加衣物</RouterLink><p class="nav-label">我的空间</p>
          <nav class="main-nav" aria-label="主导航">
            <RouterLink v-for="item in (closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)" :key="item.path" :to="item.path" class="nav-link" :class="{ active: route.path === item.path || (item.path === '/wardrobe' && route.path.startsWith('/garment')) }">
              <component :is="item.icon" /><span>{{ item.label }}</span>
              <span v-if="item.path === '/pending' && closet.pendingCount" class="nav-count">{{ closet.pendingCount }}</span>
              <span v-if="item.path === '/tasks' && closet.taskCount" class="nav-count quiet">{{ closet.taskCount }}</span>
            </RouterLink>
          </nav>
          <div class="sidebar-note"><CloudOutlined /><div><strong>{{ usingMocks ? '界面演示' : closet.user?.mustChangePassword ? '请先设置新密码' : '已连接真实后端' }}</strong><p>{{ usingMocks ? '未调用 AI，不提供模拟提交' : closet.user?.mustChangePassword ? '完成后即可开始整理衣柜' : '上传后可随时查看任务和结果' }}</p></div></div>
          <div class="profile-row">
            <span class="avatar">{{ closet.user?.username?.slice(0, 1).toUpperCase() }}</span>
            <span class="profile-name"><strong>{{ closet.user?.username }}</strong><small>我的衣橱</small></span>
            <a-button type="text" class="sign-out" title="退出登录" aria-label="退出登录" @click="signOut"><LogoutOutlined /></a-button>
          </div>
        </aside>
        <main class="main-area">
          <div v-if="usingMocks" class="mock-banner"><span class="mock-pulse"></span><span>界面演示 · 示例数据不是 AI 结果，演示模式禁止提交模型任务</span><span class="mock-banner-end">{{ closet.user?.username }} 的衣橱</span></div>
          <header class="topbar"><span>衣序 <span class="topbar-divider">/</span> {{ route.path === '/add' ? '添加衣物' : route.path.startsWith('/garment') ? '衣物工作台' : navItems.find(item => item.path === route.path)?.label || '回收站' }}</span><RouterLink v-if="!closet.user?.mustChangePassword" to="/tasks" class="topbar-tasks"><HistoryOutlined /> 任务记录<span v-if="closet.taskCount" class="nav-count">{{ closet.taskCount }}</span></RouterLink></header>
          <section class="route-content"><RouterView /></section>
        </main>
        <nav v-if="!closet.user?.mustChangePassword" class="mobile-nav" aria-label="移动端主导航">
          <RouterLink v-for="item in (closet.user?.mustChangePassword ? navItems.filter(item => item.path === '/settings') : navItems)" :key="item.path" :to="item.path" :class="{ active: route.path === item.path || (item.path === '/wardrobe' && route.path.startsWith('/garment')) }"><component :is="item.icon" /><span>{{ item.label }}</span><i v-if="item.path === '/pending' && closet.pendingCount"></i></RouterLink>
          <RouterLink to="/add" class="mobile-add"><PlusOutlined /><span>添加</span></RouterLink>
        </nav>
      </div>
      <div v-else class="boot-screen"><span class="brand-mark"><span></span><span></span><span></span></span><p>正在打开衣橱…</p></div>
    </a-app>
  </a-config-provider>
</template>
