<script setup lang="ts">
// “我的”（ToC 改版 P2 重新设计）：分组的单行列表 + 子页面。手机先看列表、点进子页面（顶部返回）；
// 电脑左侧是同一份列表，右侧是内容，默认打开“我的风格”。各分区组件不变，只换外壳与叫法（词表见设计（一）第五节）。
// 管理员功能不在“我的”里：/admin（管理后台）复用同一个外壳，只列管理员分区（P4，#240）。
import BillingSummary from '../billing/BillingSummary.vue'
import PageTitle from '../shell/PageTitle.vue'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LockOutlined, ThunderboltOutlined, LinkOutlined, RobotOutlined, UserOutlined, DashboardOutlined, RightOutlined,
  DeleteOutlined, CompassOutlined, BgColorsOutlined, ArrowLeftOutlined, DownloadOutlined, SkinOutlined, AuditOutlined, CameraOutlined, CopyOutlined, AppstoreAddOutlined, SafetyCertificateOutlined, QuestionCircleOutlined, LogoutOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import { closetApi } from '../services/api'
import { formatBuildTime, formatVersion, type ServerInfo } from '../domain/app-version'
import { serverBuild, webBuild } from '../services/version'

const closet = useClosetStore(); const appearance = useThemeStore()
const route = useRoute(); const router = useRouter()

const webVersion = formatVersion(webBuild)
const webBuiltAt = formatBuildTime(webBuild.builtAt)
const server = ref<ServerInfo | null | undefined>(undefined)
// Issue #192: the public health check no longer carries version/commit, so a reachable server reads as online.
const serverVersion = computed(() => server.value === undefined ? '读取中…' : !server.value ? '无法连接' : server.value.version || server.value.commit ? formatVersion(server.value) : '在线')

const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))
const isPortableLogin = computed(() => Boolean(closet.user?.portableLogin))
const isAdmin = computed(() => closet.user?.role === 'ADMIN')

type Group = 'style' | 'closet' | 'account' | 'more' | 'admin'
interface Section { key: string; label: string; description: string; icon: unknown; group: Group; hidden?: () => boolean; component: ReturnType<typeof defineAsyncComponent>; value?: () => string }
/** Rows that open another page instead of a section. */
interface LinkRow { key: string; label: string; icon: unknown; group: Group; to?: string; action?: () => void }

const sections: Section[] = [
  { key: 'style', group: 'style', label: '我的风格', description: '推荐参考的偏好和依据，可以随时调整。', icon: SkinOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsStyleSection.vue')) },
  { key: 'personal', group: 'style', label: '我的形象', description: '身材资料、参考照片和试穿用的形象。', icon: UserOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsPersonalSection.vue')) },
  { key: 'assistant', group: 'style', label: '鱼搭助手', description: '助手用的模型、动效和长期记忆。', icon: RobotOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsAssistantSection.vue')) },
  { key: 'tidy', group: 'closet', label: '重复的衣服', description: '找出可能录了两次的衣服，确认后移入回收站。', icon: CopyOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsTidySection.vue')) },
  { key: 'quota', group: 'account', label: '次数与点数', description: '今天还能用几次，点数、权益和订单。', icon: ThunderboltOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsQuotaSection.vue')) },
  { key: 'account', group: 'account', label: '账号与安全', description: '资料、密码、登录设备和注销。', icon: LockOutlined, hidden: () => isPortableLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsAccountSection.vue')) },
  { key: 'appearance', group: 'account', label: '外观', description: '浅色或深色、导航样式、“种草”的叫法。', icon: BgColorsOutlined, hidden: () => firstLogin.value, value: () => appearance.isDark ? '深色' : '浅色', component: defineAsyncComponent(() => import('./settings/SettingsAppearanceSection.vue')) },
  { key: 'install', group: 'more', label: '安装到桌面', description: '像应用一样从桌面或主屏幕打开鱼搭。', icon: DownloadOutlined, hidden: () => firstLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsInstallSection.vue')) },
  { key: 'portable', group: 'more', label: '在其他设备登录', description: '生成一次性登录链接，发给自己的另一台设备。', icon: LinkOutlined, hidden: () => firstLogin.value || isPortableLogin.value, component: defineAsyncComponent(() => import('./settings/SettingsPortableSection.vue')) },
  { key: 'templates', group: 'admin', label: '搭配模板审核', description: '审核经典搭法模板，通过后参与推荐加分。', icon: AuditOutlined, hidden: () => firstLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./AdminTemplatesPage.vue')) },
  { key: 'presets', group: 'admin', label: '预设衣物库', description: '从账号导入常见单品、核对标签与上架，查看覆盖缺口。', icon: AppstoreAddOutlined, hidden: () => firstLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./settings/SettingsPresetsSection.vue')) },
  { key: 'ootd-samples', group: 'admin', label: '整套穿搭样本', description: '收集整套穿搭图，提取物品与姿势，审核后生成搭配模板。', icon: CameraOutlined, hidden: () => firstLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./AdminOotdSamplesPage.vue')) },
  { key: 'processing', group: 'admin', label: '任务与资源', description: '查看积压、共享账户与调度容量。', icon: DashboardOutlined, hidden: () => firstLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./AdminProcessingPage.vue')) },
  { key: 'users', group: 'admin', label: '用户管理', description: '管理用户、登录会话、每日额度和邀请码。', icon: UserOutlined, hidden: () => firstLogin.value || isPortableLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./AdminUsersPage.vue')) },
  { key: 'security-audit', group: 'admin', label: '安全审计', description: '登录失败、锁定、越权拒绝、邀请码、管理员操作和模型调用。', icon: SafetyCertificateOutlined, hidden: () => firstLogin.value || !isAdmin.value, component: defineAsyncComponent(() => import('./AdminSecurityAuditPage.vue')) },
]
function replayGuide() { window.dispatchEvent(new CustomEvent('closet-guide-start')) }
const links: LinkRow[] = [
  { key: 'trash', group: 'closet', label: '回收站', icon: DeleteOutlined, to: '/trash' },
  { key: 'guide', group: 'more', label: '新手指引', icon: CompassOutlined, action: replayGuide },
  { key: 'help', group: 'more', label: '帮助', icon: QuestionCircleOutlined, to: '/help' },
  { key: 'admin', group: 'more', label: '管理后台', icon: DashboardOutlined, to: '/admin' },
]
const GROUPS: { key: Group; label: string }[] = [{ key: 'style', label: '穿搭' }, { key: 'closet', label: '衣柜' }, { key: 'account', label: '账号' }, { key: 'more', label: '更多' }, { key: 'admin', label: '管理功能' }]
const adminMode = computed(() => route.path === '/admin')
const visible = computed(() => sections.filter(s => !s.hidden?.() && (adminMode.value ? s.group === 'admin' : s.group !== 'admin')))
type Row = { key: string; label: string; icon: unknown; value?: string; section?: Section; link?: LinkRow }
const grouped = computed(() => GROUPS.map(g => ({ ...g, rows: [
  ...visible.value.filter(s => s.group === g.key).map<Row>(s => ({ key: s.key, label: s.label, icon: s.icon, value: s.value?.(), section: s })),
  ...(firstLogin.value || adminMode.value ? [] : links.filter(l => l.group === g.key && (l.key !== 'admin' || isAdmin.value)).map<Row>(l => ({ key: l.key, label: l.label, icon: l.icon, link: l }))),
] })).filter(g => g.rows.length))

// 电脑两栏；手机单栏（先列表，?section= 时显示子页面）。
const wideQuery = window.matchMedia('(min-width: 1024px)'); const wide = ref(wideQuery.matches)
const onWide = () => { wide.value = wideQuery.matches }
const requested = computed(() => { const q = route.query.section; return typeof q === 'string' && visible.value.some(s => s.key === q) ? q : '' })
const activeKey = computed(() => firstLogin.value ? 'account' : requested.value || (wide.value ? visible.value[0]?.key ?? '' : ''))
const active = computed(() => visible.value.find(s => s.key === activeKey.value))
const showList = computed(() => !firstLogin.value && (wide.value || !requested.value))
function open(row: Row) {
  if (row.section) { void router.replace({ query: { ...route.query, section: row.key } }); return }
  if (row.link?.to) void router.push(row.link.to); else row.link?.action?.()
}
// 旧链接 /settings?section=users 等管理员分区：转到管理后台的同一分区。
const ADMIN_KEYS = new Set(sections.filter(s => s.group === 'admin').map(s => s.key))
if (!adminMode.value && isAdmin.value && typeof route.query.section === 'string' && ADMIN_KEYS.has(route.query.section)) void router.replace({ path: '/admin', query: { section: route.query.section } })
function back() { void router.replace({ query: { ...route.query, section: undefined } }) }
async function signOut() { await closet.signOut(); await router.replace('/login') }

const counts = ref<{ garments: number | null; outfits: number | null }>({ garments: null, outfits: null })
async function loadCounts() {
  const [g, o] = await Promise.allSettled([closetApi.list({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page: 1, size: 1 }), closetApi.outfits()])
  counts.value = { garments: g.status === 'fulfilled' ? g.value.total : null, outfits: o.status === 'fulfilled' ? o.value.length : null }
}
const name = computed(() => closet.user?.displayName || closet.user?.username || '')
onMounted(async () => { wideQuery.addEventListener('change', onWide); if (!firstLogin.value && !adminMode.value) void loadCounts(); server.value = await serverBuild() })
onUnmounted(() => wideQuery.removeEventListener('change', onWide))
</script>

<template>
  <PageTitle :title="firstLogin ? '欢迎使用鱼搭' : active && !wide ? active.label : adminMode ? '管理后台' : '我的'" />

  <div v-if="firstLogin" class="me-first">
    <LockOutlined />
    <div><strong>先为你的账号换一个新密码。</strong><p>这是管理员提供的初始密码，修改后就可以开始使用。</p></div>
  </div>
  <a-alert v-if="isPortableLogin" class="me-portable" type="info" show-icon message="当前是在其他设备登录的临时授权，最长 24 小时有效。修改密码或管理授权需要用账号密码登录。" />

  <div class="me" :class="{ 'me-wide': wide && !firstLogin }">
    <aside v-if="showList" class="me-side">
      <header v-if="adminMode" class="me-admin-head"><a-button type="text" class="me-back" aria-label="返回我的" @click="router.push('/settings')"><ArrowLeftOutlined /></a-button><div><strong>管理后台</strong><small>只有管理员能看到。正式管理请用独立管理平台。</small></div></header>
      <header v-else class="me-profile">
        <span class="me-avatar">{{ name.slice(0, 1).toUpperCase() }}</span>
        <div class="me-profile-text"><strong>{{ name }}</strong><small>@{{ closet.user?.username }}<a-tag v-if="isAdmin" :bordered="false" class="me-admin">管理员</a-tag></small></div>
        <a-button v-if="!isPortableLogin" size="small" @click="open({ key: 'account', label: '', icon: null, section: sections.find(s => s.key === 'account') })">编辑资料</a-button>
      </header>
      <div v-if="!adminMode" class="me-stats">
        <RouterLink to="/wardrobe"><b>{{ counts.garments ?? '–' }}</b><small>件衣服</small></RouterLink>
        <RouterLink to="/outfits"><b>{{ counts.outfits ?? '–' }}</b><small>套搭配</small></RouterLink>
        <RouterLink to="/try"><b><SkinOutlined /></b><small>去试穿</small></RouterLink>
      </div>
      <BillingSummary v-if="!adminMode" />
      <nav class="me-groups" aria-label="我的">
        <section v-for="g in grouped" :key="g.key" class="me-group">
          <h2>{{ g.label }}</h2>
          <div class="me-list">
            <a-button v-for="row in g.rows" :key="row.key" type="text" class="me-row" :class="{ on: wide && row.key === activeKey }" :aria-current="wide && row.key === activeKey ? 'page' : undefined" @click="open(row)">
              <component :is="row.icon" class="me-row-icon" /><span class="me-row-label">{{ row.label }}</span><span v-if="row.value" class="me-row-value">{{ row.value }}</span><RightOutlined class="me-row-arrow" />
            </a-button>
          </div>
        </section>
        <a-button v-if="!adminMode" type="text" danger class="me-row me-signout" @click="signOut"><LogoutOutlined class="me-row-icon" /><span class="me-row-label">退出登录</span></a-button>
      </nav>
      <footer class="me-version"><span :title="webBuiltAt ? `构建于 ${webBuiltAt}` : undefined">前端 {{ webVersion }}</span><span>服务端 {{ serverVersion }}</span></footer>
    </aside>

    <main v-if="active && (wide || requested || firstLogin)" class="me-panel">
      <header v-if="!firstLogin" class="me-panel-head">
        <a-button v-if="!wide" type="text" class="me-back" aria-label="返回我的" @click="back"><ArrowLeftOutlined /></a-button>
        <div><h2>{{ active.label }}</h2><p>{{ active.description }}</p></div>
      </header>
      <Suspense>
        <component :is="active.component" v-bind="['processing', 'templates', 'ootd-samples', 'users'].includes(active.key) ? { embedded: true } : {}" />
        <template #fallback><div class="settings-group"><a-skeleton active :paragraph="{ rows: 5 }" /></div></template>
      </Suspense>
    </main>
  </div>
</template>

<style scoped>
.me-first { display: flex; gap: 12px; max-width: 720px; margin: 0 auto 16px; padding: 16px 18px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.me-first > .anticon { margin-top: 3px; font-size: 18px; }
.me-first p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.me-portable { max-width: 1180px; margin: 0 auto 16px; }
.me { max-width: 720px; margin: 0 auto; }
.me-wide { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 32px; max-width: 1180px; align-items: start; }
.me-side { min-width: 0; }
.me-wide .me-side { position: sticky; top: 16px; max-height: calc(100dvh - 140px); overflow-y: auto; scrollbar-width: thin; padding-bottom: 8px; }
.me-admin-head { display: flex; align-items: center; gap: 6px; padding: 0 0 16px; }
.me-admin-head strong { display: block; font-size: 18px; font-weight: 650; }
.me-admin-head small { color: var(--muted); font-size: 12px; }
.me-profile { display: flex; align-items: center; gap: 12px; padding: 4px 2px 16px; }
.me-avatar { display: grid; flex: none; place-items: center; width: 56px; height: 56px; border-radius: 50%; color: var(--action-fg); background: var(--action-bg); font-size: 22px; font-weight: 600; }
.me-profile-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.me-profile-text strong { overflow: hidden; font-size: 18px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.me-profile-text small { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
.me-admin { margin: 0; font-size: 11px; }
.me-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 20px; padding: 12px 0; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.me-stats a { display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--ink); }
.me-stats a + a { border-left: 1px solid var(--line); }
.me-stats b { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.3; }
.me-stats small { color: var(--muted); font-size: 12px; }
.me-group + .me-group { margin-top: 18px; }
.me-group h2 { margin: 0 0 6px 4px; color: var(--muted); font-size: 12px; font-weight: 500; }
.me-list { overflow: hidden; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.me-row.ant-btn { display: flex; align-items: center; gap: 12px; width: 100%; height: 52px; padding: 0 14px; border-radius: 0; color: var(--ink); text-align: left; }
.me-list .me-row.ant-btn + .me-row.ant-btn { box-shadow: inset 0 1px 0 var(--line); }
html .me-row.ant-btn:not(:disabled):hover { background: var(--surface-alt); }
.me-row.on.ant-btn, html .me-row.on.ant-btn:hover { background: var(--selection-bg); font-weight: 600; }
.me-row-icon { flex: none; font-size: 17px; color: var(--muted-strong); }
.me-row-label { flex: 1; min-width: 0; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.me-row-value { flex: none; color: var(--muted); font-size: 13px; }
.me-row-arrow { flex: none; font-size: 11px; color: var(--muted-subtle); }
.me-signout.ant-btn { margin-top: 18px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.me-signout .me-row-icon { color: inherit; }
.me-version { display: flex; justify-content: center; gap: 12px; margin-top: 16px; color: var(--muted-subtle); font-size: 11px; }
.me-panel { min-width: 0; }
.me-panel-head { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0 16px; }
.me-panel-head h2 { margin: 0; font-size: 22px; font-weight: 650; }
.me-panel-head p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.me-back.ant-btn { flex: none; width: 40px; height: 40px; margin-left: -8px; }
@media (max-width: 1023px) { .me-panel-head h2 { font-size: 20px; } }
</style>
