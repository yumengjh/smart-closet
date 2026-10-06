<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LockOutlined, ThunderboltOutlined, LinkOutlined, RobotOutlined,
  DeleteOutlined, ArrowRightOutlined, ArrowLeftOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'

const closet = useClosetStore()
const route = useRoute()
const router = useRouter()

const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))
const isPortableLogin = computed(() => Boolean(closet.user?.portableLogin))

/** 所有设置分类定义 */
interface SettingsCategory {
  key: string
  label: string
  eyebrow: string
  description: string
  icon: unknown
  hidden?: () => boolean
  component: ReturnType<typeof defineAsyncComponent>
}

const categories: SettingsCategory[] = [
  { key: 'processing', label: '任务与资源', eyebrow: '管理员', description: '查看积压、共享账户与调度容量。', icon: ThunderboltOutlined, hidden: () => firstLogin.value || closet.user?.role !== 'ADMIN', component: defineAsyncComponent(() => import('./AdminProcessingPage.vue')) },
  {
    key: 'account',
    label: '账户安全',
    eyebrow: '密码与登录',
    description: '修改密码，保持账号安全。',
    icon: LockOutlined,
    hidden: () => isPortableLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsAccountSection.vue')),
  },
  {
    key: 'assistant',
    label: '个人助手',
    eyebrow: '模型、动效与记忆',
    description: '选择模型、角色动效及长期偏好记忆。',
    icon: RobotOutlined,
    hidden: () => firstLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsAssistantSection.vue')),
  },
  {
    key: 'quota',
    label: 'AI 额度',
    eyebrow: '图像任务',
    description: '查看今日 AI 识别和处理的使用情况。',
    icon: ThunderboltOutlined,
    hidden: () => firstLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsQuotaSection.vue')),
  },
  {
    key: 'portable',
    label: '便携登录',
    eyebrow: '跨设备访问',
    description: '生成一次性登录链接分享给其他设备。',
    icon: LinkOutlined,
    hidden: () => firstLogin.value || isPortableLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsPortableSection.vue')),
  },
]

const visibleCategories = computed(() => categories.filter(c => !c.hidden?.()))

/** 当前选中的 key（PC 左侧导航 & 移动端子页面） */
const activeKey = computed(() => {
  const q = route.query.section as string | undefined
  if (q && visibleCategories.value.find(c => c.key === q)) return q
  // 首次登录默认进 account
  if (firstLogin.value) return 'account'
  // PC 端默认选第一个
  return visibleCategories.value[0]?.key ?? ''
})

const activeCategory = computed(() => visibleCategories.value.find(c => c.key === activeKey.value))

/** 移动端：是否处于子页面状态 */
const mobileInSection = computed(() => Boolean(route.query.section))

function selectCategory(key: string) {
  void router.replace({ query: { ...route.query, section: key } })
}

function goBack() {
  void router.replace({ query: { ...route.query, section: undefined } })
}
</script>

<template>
  <div class="page-heading simple-heading">
    <div>
      <p class="eyebrow">账户与设置</p>
      <h1>{{ firstLogin ? '设置新密码' : '我的' }}</h1>
      <p class="page-subtitle">{{ firstLogin ? '完成后即可上传照片、查看任务和管理衣柜。' : '账户、助手和衣橱偏好。' }}</p>
    </div>
    <div class="settings-avatar">{{ closet.user?.username?.slice(0, 1).toUpperCase() }}</div>
  </div>

  <!-- 首次登录提示 -->
  <div v-if="firstLogin" class="first-login-note">
    <LockOutlined />
    <div>
      <strong>先为你的账号换一个新密码。</strong>
      <p>这是管理员提供的初始密码，修改后就可以开始整理衣橱。</p>
    </div>
  </div>

  <!-- 便携登录提示 -->
  <a-alert
    v-if="isPortableLogin"
    type="info"
    message="当前使用便携登录授权，最长 24 小时有效。修改密码或管理授权需退出后使用账号密码登录。"
    show-icon
    style="margin-bottom: 16px"
  />

  <!-- ======= PC 端：左右布局 ======= -->
  <div class="settings-layout" :class="{ 'first-login-layout': firstLogin }">
    <!-- 左侧分类导航（PC 始终显示；移动端仅在列表页显示） -->
    <nav class="settings-nav" :class="{ 'mobile-hidden': mobileInSection }" aria-label="设置分类">
      <a-button
        type="text"
        v-for="cat in visibleCategories"
        :key="cat.key"
        class="settings-nav-item"
        :class="{ active: activeKey === cat.key }"
        @click="selectCategory(cat.key)"
      >
        <span class="settings-nav-icon"><component :is="cat.icon" /></span>
        <span class="settings-nav-text">
          <strong>{{ cat.label }}</strong>
          <small>{{ cat.description }}</small>
        </span>
        <ArrowRightOutlined class="settings-nav-arrow" />
      </a-button>

      <!-- 回收站入口 -->
      <RouterLink v-if="!firstLogin" to="/trash" class="settings-nav-item settings-nav-link">
        <span class="settings-nav-icon"><DeleteOutlined /></span>
        <span class="settings-nav-text">
          <strong>回收站</strong>
          <small>已删除的衣物，可随时恢复。</small>
        </span>
        <ArrowRightOutlined class="settings-nav-arrow" />
      </RouterLink>
    </nav>

    <!-- 右侧内容面板（PC 显示；移动端仅 mobileInSection 时显示） -->
    <div v-if="activeCategory" class="settings-panel" :class="{ 'mobile-shown': mobileInSection }">
      <!-- 移动端返回按钮 -->
      <a-button type="text" class="settings-panel-back mobile-only" @click="goBack">
        <ArrowLeftOutlined /> 返回设置
      </a-button>

      <Suspense>
        <component :is="activeCategory.component" />
        <template #fallback>
          <a-skeleton active :paragraph="{ rows: 5 }" style="padding: 28px" />
        </template>
      </Suspense>
    </div>
  </div>
</template>
