<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LockOutlined, ThunderboltOutlined, LinkOutlined, RobotOutlined, UserOutlined, DashboardOutlined,
  DeleteOutlined, ArrowRightOutlined, ArrowLeftOutlined, DownloadOutlined, SkinOutlined, AuditOutlined, CameraOutlined, CopyOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { formatBuildTime, formatVersion, type ServerInfo } from '../domain/app-version'
import { serverBuild, webBuild } from '../services/version'

const closet = useClosetStore()
const route = useRoute()
const router = useRouter()

const webVersion = formatVersion(webBuild)
const webBuiltAt = formatBuildTime(webBuild.builtAt)
const server = ref<ServerInfo | null | undefined>(undefined)
onMounted(async () => { server.value = await serverBuild() })
const serverVersion = computed(() => server.value === undefined ? '读取中…' : server.value ? formatVersion(server.value) : '无法连接')

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
  { key: 'personal', label: '个人形象', eyebrow: '资料与模特', description: '身材资料、参考照片和你的模特。', icon: UserOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsPersonalSection.vue')) },
  { key: 'templates', label: '搭配模板审核', eyebrow: '管理员', description: '审核经典搭法模板，通过后参与推荐加分。', icon: AuditOutlined, hidden: () => firstLogin.value || closet.user?.role !== 'ADMIN', component: defineAsyncComponent(() => import('./AdminTemplatesPage.vue')) },
  { key: 'ootd-samples', label: '整套穿搭样本', eyebrow: '管理员', description: '收集整套穿搭图，提取物品与姿势，审核后生成搭配模板。', icon: CameraOutlined, hidden: () => firstLogin.value || closet.user?.role !== 'ADMIN', component: defineAsyncComponent(() => import('./AdminOotdSamplesPage.vue')) },
  { key: 'processing', label: '任务与资源', eyebrow: '管理员', description: '查看积压、共享账户与调度容量。', icon: DashboardOutlined, hidden: () => firstLogin.value || closet.user?.role !== 'ADMIN', component: defineAsyncComponent(() => import('./AdminProcessingPage.vue')) },
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
    key: 'tidy',
    label: '整理衣柜',
    eyebrow: '可能重复的衣物',
    description: '找出可能重复录入的衣物，确认后可移入回收站。',
    icon: CopyOutlined,
    hidden: () => firstLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsTidySection.vue')),
  },
  {
    key: 'style',
    label: '穿搭画像',
    eyebrow: '推荐偏好与依据',
    description: '查看推荐依据的偏好、冷却中的单品，调整推荐与搜索严格度。',
    icon: SkinOutlined,
    hidden: () => firstLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsStyleSection.vue')),
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
  {
    key: 'install',
    label: '安装应用',
    eyebrow: '桌面与主屏幕',
    description: '把鱼搭安装到电脑或手机，像应用一样独立打开。',
    icon: DownloadOutlined,
    hidden: () => firstLogin.value,
    component: defineAsyncComponent(() => import('./settings/SettingsInstallSection.vue')),
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
  <div class="page-heading simple-heading settings-heading" :class="{ 'mobile-hidden': mobileInSection }">
    <div>
      <p class="eyebrow">账户与设置</p>
      <h1>{{ firstLogin ? '欢迎使用鱼搭' : '我的' }}</h1>
      <p v-if="!firstLogin" class="page-subtitle">账户、助手和衣橱偏好。</p>
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
    class="settings-portable-alert"
    type="info"
    message="当前使用便携登录授权，最长 24 小时有效。修改密码或管理授权需退出后使用账号密码登录。"
    show-icon
  />

  <div class="settings-layout" :class="{ 'first-login-layout': firstLogin }">
    <!-- 分类导航（PC 始终显示；移动端仅在列表页显示） -->
    <nav class="settings-nav" :class="{ 'mobile-hidden': mobileInSection }" aria-label="设置分类">
      <a-button
        type="text"
        v-for="cat in visibleCategories"
        :key="cat.key"
        class="settings-nav-item"
        :class="{ active: activeKey === cat.key }"
        :aria-current="activeKey === cat.key ? 'page' : undefined"
        @click="selectCategory(cat.key)"
      >
        <span class="settings-nav-icon"><component :is="cat.icon" /></span>
        <span class="settings-nav-text">
          <strong>{{ cat.label }}</strong>
          <small>{{ cat.eyebrow }}</small>
        </span>
        <ArrowRightOutlined class="settings-nav-arrow" />
      </a-button>

      <!-- 回收站入口 -->
      <RouterLink v-if="!firstLogin" to="/trash" class="settings-nav-item settings-nav-link">
        <span class="settings-nav-icon"><DeleteOutlined /></span>
        <span class="settings-nav-text">
          <strong>回收站</strong>
          <small>恢复已删除的衣物</small>
        </span>
        <ArrowRightOutlined class="settings-nav-arrow" />
      </RouterLink>

      <footer class="settings-version" aria-label="版本信息">
        <span :title="webBuiltAt ? `构建于 ${webBuiltAt}` : undefined">前端 {{ webVersion }}</span>
        <span>服务端 {{ serverVersion }}</span>
      </footer>
    </nav>

    <!-- 内容面板（PC 显示；移动端仅 mobileInSection 时显示） -->
    <main v-if="activeCategory" class="settings-panel" :class="{ 'mobile-shown': mobileInSection }">
      <header v-if="!firstLogin" class="settings-panel-head">
        <a-button type="text" class="settings-panel-back" aria-label="返回设置" @click="goBack">
          <ArrowLeftOutlined />
        </a-button>
        <span class="settings-panel-icon"><component :is="activeCategory.icon" /></span>
        <div class="settings-panel-title">
          <p class="eyebrow">{{ activeCategory.eyebrow }}</p>
          <h2>{{ firstLogin ? '设置新密码' : activeCategory.label }}</h2>
          <p>{{ activeCategory.description }}</p>
        </div>
      </header>

      <Suspense>
        <component :is="activeCategory.component" v-bind="['processing', 'templates', 'ootd-samples'].includes(activeCategory.key) ? { embedded: true } : {}" />
        <template #fallback>
          <div class="settings-group"><a-skeleton active :paragraph="{ rows: 5 }" /></div>
        </template>
      </Suspense>
    </main>
  </div>
</template>
