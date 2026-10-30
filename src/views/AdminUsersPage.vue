<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { App, Alert, Button, Input, Space, Tabs as ATabs } from 'ant-design-vue'
import { closetApi, type AdminUser, type AdminUsersQuery, type AdminUsersPage, type AdminRegistration, type RegistrationInvite, type TemporaryPassword, type InviteCreated, type AccountQuota, type AccountEvent, type UserRole } from '../services/api'
import { useClosetStore } from '../stores/closet'
import { accountTime, registeredViaLabels, accountEventLabel, usernameProblem } from '../domain/account'

const ATabPane = ATabs.TabPane
defineProps<{ embedded?: boolean }>()
const { modal, message } = App.useApp(); const closet = useClosetStore(); const router = useRouter()
const tab = ref('users'); const error = ref(''); const usersBusy = ref(false); const invitesBusy = ref(false)
const query = reactive<AdminUsersQuery>({ q: '', status: undefined, role: undefined, page: 1, size: 20 })
const users = ref<AdminUsersPage>({ items: [], total: 0, page: 1, size: 20 }); const search = ref('')
const registration = ref<AdminRegistration>(); const invites = ref<RegistrationInvite[]>([])
let usersRequest = 0
const roleOptions = [{ value: 'ADMIN', label: '管理员' }, { value: 'USER', label: '普通用户' }]
const statusOptions = [{ value: 'ENABLED', label: '已启用' }, { value: 'DISABLED', label: '已停用' }]
const inviteLabels = { ACTIVE: '有效', USED_UP: '已用完', EXPIRED: '已过期', REVOKED: '已撤销' }
const modeLabels = { CLOSED: '关闭注册', INVITE: '邀请注册', OPEN: '公开注册' }
const modeDescriptions = {
  CLOSED: '当前关闭自助注册，用户由管理员创建。',
  INVITE: '注册时必须提供有效邀请码，管理员可在下方创建并分享。',
  OPEN: '任何人都可以注册；填写邀请码时会核销名额并记录来源。',
}
const columns = [
  { title: '用户', key: 'user', width: 160 }, { title: '角色', key: 'role', width: 100 }, { title: '状态', key: 'status', width: 100 },
  { title: '注册来源', key: 'registeredVia', width: 110 }, { title: '注册时间', key: 'createdAtMs', width: 170 }, { title: '最近登录', key: 'lastLoginAtMs', width: 170 },
  { title: '衣物数', dataIndex: 'garmentCount', width: 80 }, { title: '操作', key: 'actions', width: 320 },
]
const inviteColumns = [
  { title: '备注', dataIndex: 'note', width: 160 }, { title: '状态', key: 'status', width: 100 }, { title: '已用 / 名额', key: 'uses', width: 110 },
  { title: '创建者', dataIndex: 'createdBy', width: 130 }, { title: '创建时间', key: 'createdAtMs', width: 170 }, { title: '到期时间', key: 'expiresAtMs', width: 170 }, { title: '操作', key: 'actions', width: 90 },
]
const pagination = computed(() => ({ current: query.page, pageSize: query.size, total: users.value.total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total: number) => `共 ${total} 位用户` }))
async function loadUsers() {
  const serial = ++usersRequest; usersBusy.value = true; error.value = ''
  try {
    const result = await closetApi.adminUsers({ ...query })
    if (serial !== usersRequest) return
    users.value = result
    if (!result.items.length && result.total > 0 && query.page > 1) { query.page = Math.ceil(result.total / query.size); await loadUsers() }
  } catch (cause) { if (serial === usersRequest) error.value = cause instanceof Error ? cause.message : '用户列表暂时无法加载。' }
  finally { if (serial === usersRequest) usersBusy.value = false }
}
function filterUsers() { query.q = search.value.trim(); query.page = 1; void loadUsers() }
function changePage(value: { current?: number; pageSize?: number }) {
  query.page = value.pageSize && value.pageSize !== query.size ? 1 : value.current || 1; query.size = value.pageSize || query.size; void loadUsers()
}
async function loadInvites() {
  invitesBusy.value = true; error.value = ''
  try { const result = await Promise.all([closetApi.adminRegistration(), closetApi.adminInvites()]); registration.value = result[0]; invites.value = result[1] }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '邀请码暂时无法加载。' }
  finally { invitesBusy.value = false }
}
onMounted(() => { void loadUsers(); void loadInvites() })

const createOpen = ref(false); const createBusy = ref(false); const createError = ref('')
const newUser = reactive({ username: '', displayName: '', role: 'USER' as UserRole })
function showPassword(result: TemporaryPassword) {
  // App 持有弹层：重置自己的密码导致会话退出时，一次性密码仍可保存。
  modal.info({ title: '保存临时密码', width: 520, maskClosable: false, okText: '已保存，关闭', content: h('div', [
    h(Alert, { type: 'warning', message: '临时密码只显示这一次，请立即保存并交给用户。首次登录必须修改密码。', showIcon: true }),
    h('p', { class: 'settings-hint' }, `用户名：${result.username}`),
    h(Input, { value: result.temporaryPassword, readonly: true, autocomplete: 'off', 'aria-label': '临时密码' }),
    h(Space, { style: { marginTop: '16px' } }, { default: () => h(Button, { type: 'primary', onClick: () => copy(result.temporaryPassword) }, { default: () => '复制临时密码' }) }),
  ]) })
}
function openCreateUser() { Object.assign(newUser, { username: '', displayName: '', role: 'USER' }); createError.value = ''; createOpen.value = true }
async function createUser() {
  if (createBusy.value) return
  createError.value = ''
  const nameProblem = usernameProblem(newUser.username)
  if (nameProblem) { createError.value = nameProblem; return }
  if (newUser.displayName.trim().length > 40 || /[\x00-\x1f\x7f]/.test(newUser.displayName)) { createError.value = '昵称不能超过 40 个字符，也不能包含控制字符。'; return }
  createBusy.value = true
  try { const result = await closetApi.adminCreateUser({ ...newUser, displayName: newUser.displayName.trim() || undefined }); createOpen.value = false; showPassword(result); await loadUsers() }
  catch (cause) { createError.value = cause instanceof Error ? cause.message : '用户未能创建。' }
  finally { createBusy.value = false }
}
function confirmAction(title: string, content: string, action: () => Promise<unknown>, after?: () => Promise<void>) {
  modal.confirm({ title, content, okText: '确认', cancelText: '取消', onOk: async () => {
    try { await action(); message.success('操作已完成。'); await loadUsers(); if (after) await after() }
    catch (cause) { message.error(cause instanceof Error ? cause.message : '操作未能完成。'); throw cause }
  } })
}
function changeStatus(user: AdminUser) {
  if (user.username === closet.user?.username) return
  confirmAction(`${user.enabled ? '停用' : '启用'}用户 ${user.username}？`, user.enabled ? '停用后该用户将无法登录，现有会话也会退出。' : '启用后该用户可以重新登录；已注销账号的注销标记会清除。', () => closetApi.adminSetUserStatus(user.username, { enabled: !user.enabled }))
}
function changeRole(user: AdminUser) {
  if (user.username === closet.user?.username) return
  confirmAction(`${user.role === 'ADMIN' ? '设为普通用户' : '设为管理员'}：${user.username}？`, '角色变更会调整管理权限，现有会话可能退出。', () => closetApi.adminSetUserRole(user.username, { role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' }))
}
function resetPassword(user: AdminUser) {
  confirmAction(`重置 ${user.username} 的密码？`, '现有会话将退出，用户下次登录时必须修改临时密码。', async () => { showPassword(await closetApi.adminResetPassword(user.username)) }, async () => {
    if (user.username === closet.user?.username) { closet.clearSession(); await router.replace('/login') }
  })
}
function revokeSessions(user: AdminUser) {
  confirmAction(`退出 ${user.username} 的全部会话？`, '该用户所有设备将退出登录，便携登录授权也会撤销。', () => closetApi.adminRevokeSessions(user.username), async () => {
    if (user.username === closet.user?.username) { closet.clearSession(); await router.replace('/login') }
  })
}
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); message.success('已复制。') }
  catch { message.warning('无法访问剪贴板，请选中内容手动复制。') }
}

const detailOpen = ref(false); const selected = ref<AdminUser>(); const quota = ref<AccountQuota>(); const events = ref<AccountEvent[]>([])
const detailBusy = ref(false); const detailError = ref(''); const quotaBusy = ref(false)
const limits = reactive<{ image: number | null; agent: number | null }>({ image: null, agent: null }); let detailRequest = 0
async function openDetails(user: AdminUser) {
  selected.value = user; detailOpen.value = true; quota.value = undefined; events.value = []; detailError.value = ''; detailBusy.value = true
  limits.image = null; limits.agent = null; const serial = ++detailRequest
  try {
    const [snapshot, recent] = await Promise.all([closetApi.adminUserQuota(user.username), closetApi.adminUserEvents(user.username)])
    if (serial !== detailRequest || !detailOpen.value) return
    quota.value = snapshot; events.value = recent; limits.image = snapshot.image.overridden ? snapshot.image.limit : null; limits.agent = snapshot.agent.overridden ? snapshot.agent.limit : null
  } catch (cause) { if (serial === detailRequest) detailError.value = cause instanceof Error ? cause.message : '详情暂时无法加载。' }
  finally { if (serial === detailRequest) detailBusy.value = false }
}
async function saveQuota() {
  if (!selected.value || quotaBusy.value || !quota.value) return
  const username = selected.value.username; const serial = detailRequest; quotaBusy.value = true; detailError.value = ''
  try {
    const result = await closetApi.adminUpdateQuota(username, { imageDailyLimit: limits.image ?? null, agentDailyLimit: limits.agent ?? null })
    if (serial !== detailRequest || !detailOpen.value) return
    quota.value = result; message.success('每日额度已保存。')
    const recent = await closetApi.adminUserEvents(username)
    if (serial === detailRequest && detailOpen.value) events.value = recent
  } catch (cause) { if (serial === detailRequest) detailError.value = cause instanceof Error ? cause.message : '额度未能保存。' }
  finally { quotaBusy.value = false }
}

const inviteOpen = ref(false); const inviteBusy = ref(false); const inviteError = ref('')
const newInvite = reactive({ note: '', maxUses: 1, expiresInDays: 7 })
const inviteResult = ref<InviteCreated>(); const inviteResultOpen = ref(false)
const inviteUrl = computed(() => inviteResult.value ? `${window.location.origin}/register?invite=${encodeURIComponent(inviteResult.value.code)}` : '')
function openCreateInvite() { Object.assign(newInvite, { note: '', maxUses: 1, expiresInDays: 7 }); inviteError.value = ''; inviteOpen.value = true }
async function createInvite() {
  if (inviteBusy.value) return
  inviteError.value = ''
  if (!Number.isInteger(newInvite.maxUses) || newInvite.maxUses < 1 || newInvite.maxUses > 100 || !Number.isInteger(newInvite.expiresInDays) || newInvite.expiresInDays < 1 || newInvite.expiresInDays > 90) { inviteError.value = '名额需为 1–100 的整数，有效期需为 1–90 天。'; return }
  inviteBusy.value = true
  try { inviteResult.value = await closetApi.adminCreateInvite({ ...newInvite, note: newInvite.note.trim() || undefined }); inviteResultOpen.value = true; inviteOpen.value = false; await loadInvites() }
  catch (cause) { inviteError.value = cause instanceof Error ? cause.message : '邀请码未能创建。' }
  finally { inviteBusy.value = false }
}
function revokeInvite(invite: RegistrationInvite) {
  modal.confirm({ title: '撤销这个邀请码？', content: '撤销后不能再用于注册，已经注册的账号不受影响。', okText: '撤销', cancelText: '取消', onOk: async () => {
    try { await closetApi.adminRevokeInvite(invite.id); message.success('邀请码已撤销。'); await loadInvites() }
    catch (cause) { message.error(cause instanceof Error ? cause.message : '撤销失败。'); throw cause }
  } })
}
</script>

<template>
  <header v-if="!embedded" class="page-heading"><div><p class="eyebrow">管理员</p><h1>用户管理</h1><p class="page-subtitle">管理账号、每日额度和邀请码。</p></div></header>
  <div class="settings-section-content users-admin">
    <a-alert v-if="closet.user?.portableLogin" type="info" message="便携登录无法管理账号，请退出后使用账号密码登录。" show-icon />
    <template v-else>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-tabs v-model:active-key="tab">
        <a-tab-pane key="users" tab="用户">
          <section class="settings-group">
            <header class="settings-group-head settings-group-head-row"><div><h3>用户</h3><p>按用户名或昵称查找，查看账号状态与登录记录。</p></div><a-button type="primary" @click="openCreateUser">新建用户</a-button></header>
            <form class="users-filters" @submit.prevent="filterUsers">
              <a-input v-model:value="search" :maxlength="80" allow-clear placeholder="搜索用户名或昵称" aria-label="搜索用户名或昵称" />
              <a-select v-model:value="query.status" :options="statusOptions" allow-clear placeholder="全部状态" aria-label="用户状态" @change="filterUsers" />
              <a-select v-model:value="query.role" :options="roleOptions" allow-clear placeholder="全部角色" aria-label="用户角色" @change="filterUsers" />
              <a-button html-type="submit" :loading="usersBusy">搜索</a-button><a-button :disabled="usersBusy" @click="loadUsers">刷新</a-button>
            </form>
            <div class="users-table"><a-table :columns="columns" :data-source="users.items" row-key="username" :loading="usersBusy" :pagination="pagination" :scroll="{ x: 1310 }" size="small" @change="changePage">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'user'"><strong>{{ record.username }}</strong><p class="muted">{{ record.displayName || '未设置昵称' }}</p></template>
                <a-tag v-else-if="column.key === 'role'" :color="record.role === 'ADMIN' ? 'blue' : undefined">{{ record.role === 'ADMIN' ? '管理员' : '普通用户' }}</a-tag>
                <a-tag v-else-if="column.key === 'status'" :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '已启用' : record.deactivatedAtMs ? '已注销' : '已停用' }}</a-tag>
                <template v-else-if="column.key === 'registeredVia'">{{ registeredViaLabels[record.registeredVia] || record.registeredVia }}</template>
                <template v-else-if="column.key === 'createdAtMs'">{{ accountTime(record.createdAtMs) }}</template>
                <template v-else-if="column.key === 'lastLoginAtMs'">{{ accountTime(record.lastLoginAtMs) }}</template>
                <a-space v-else-if="column.key === 'actions'" wrap :size="0">
                  <a-button type="link" size="small" @click="openDetails(record)">详情</a-button>
                  <a-button type="link" size="small" :disabled="record.username === closet.user?.username" @click="changeStatus(record)">{{ record.enabled ? '停用' : '启用' }}</a-button>
                  <a-button type="link" size="small" :disabled="record.username === closet.user?.username" @click="changeRole(record)">{{ record.role === 'ADMIN' ? '设为普通用户' : '设为管理员' }}</a-button>
                  <a-button type="link" size="small" @click="resetPassword(record)">重置密码</a-button>
                  <a-button type="link" size="small" @click="revokeSessions(record)">退出全部会话</a-button>
                </a-space>
              </template>
            </a-table></div>
          </section>
        </a-tab-pane>
        <a-tab-pane key="invites" tab="邀请码">
          <section class="settings-group">
            <header class="settings-group-head settings-group-head-row"><div><h3>注册与邀请</h3><p>注册方式默认取部署配置，可在后台管理平台调整。</p></div><a-space wrap><a-button :loading="invitesBusy" @click="loadInvites">刷新</a-button><a-button type="primary" @click="openCreateInvite">创建邀请码</a-button></a-space></header>
            <template v-if="registration">
              <a-tag color="blue">{{ modeLabels[registration.mode] }}</a-tag><span class="muted">有效邀请码 {{ registration.activeInviteCount }} 个</span>
              <p class="settings-hint">{{ modeDescriptions[registration.mode] }}如需调整注册方式，请在后台管理平台修改。</p>
            </template>
            <div class="users-table"><a-table :columns="inviteColumns" :data-source="invites" row-key="id" :loading="invitesBusy" :pagination="{ pageSize: 10, showSizeChanger: false }" :scroll="{ x: 1030 }" size="small">
              <template #bodyCell="{ column, record }">
                <a-tag v-if="column.key === 'status'" :color="record.status === 'ACTIVE' ? 'green' : 'default'">{{ inviteLabels[record.status as keyof typeof inviteLabels] }}</a-tag>
                <template v-else-if="column.key === 'uses'">{{ record.usedCount }} / {{ record.maxUses }}</template>
                <template v-else-if="column.key === 'createdAtMs'">{{ accountTime(record.createdAtMs) }}</template>
                <template v-else-if="column.key === 'expiresAtMs'">{{ accountTime(record.expiresAtMs) }}</template>
                <a-button v-else-if="column.key === 'actions'" type="link" danger size="small" :disabled="record.status !== 'ACTIVE'" @click="revokeInvite(record)">撤销</a-button>
              </template>
            </a-table></div>
          </section>
        </a-tab-pane>
      </a-tabs>
    </template>

    <a-modal v-model:open="createOpen" title="新建用户" ok-text="创建用户" cancel-text="取消" :confirm-loading="createBusy" :mask-closable="false" :closable="!createBusy" :cancel-button-props="{ disabled: createBusy }" @ok="createUser">
      <a-form :model="newUser" layout="vertical" @finish="createUser">
        <a-form-item label="用户名" required><a-input v-model:value="newUser.username" :maxlength="80" autocomplete="off" placeholder="2–80 位字母、数字或 _ . -" /></a-form-item>
        <a-form-item label="昵称（可选）"><a-input v-model:value="newUser.displayName" :maxlength="40" placeholder="最多 40 个字符" /></a-form-item>
        <a-form-item label="角色"><a-select v-model:value="newUser.role" :options="roleOptions" /></a-form-item>
      </a-form><a-alert v-if="createError" type="error" :message="createError" show-icon />
    </a-modal>
    <a-drawer v-model:open="detailOpen" :title="selected ? `${selected.displayName || selected.username} · 用户详情` : '用户详情'" :width="'min(560px, 100vw)'" :closable="!quotaBusy" :mask-closable="!quotaBusy" :keyboard="!quotaBusy" @close="detailRequest++">
      <template v-if="selected">
        <a-descriptions :column="1" size="small"><a-descriptions-item label="用户名">{{ selected.username }}</a-descriptions-item><a-descriptions-item label="角色">{{ selected.role === 'ADMIN' ? '管理员' : '普通用户' }}</a-descriptions-item><a-descriptions-item label="首次登录改密">{{ selected.mustChangePassword ? '需要' : '无需' }}</a-descriptions-item></a-descriptions>
        <a-alert v-if="detailError" type="error" :message="detailError" show-icon /><a-button v-if="detailError && !quota" @click="openDetails(selected)">重新加载</a-button>
        <a-spin :spinning="detailBusy">
          <section class="settings-group-sub">
            <h4>每日额度</h4>
            <template v-if="quota">
              <p class="muted">留空恢复默认额度；每日按北京时间重置。</p>
              <a-form class="quota-form" :model="limits" layout="vertical" @finish="saveQuota">
                <a-form-item :label="`图像任务（已用 ${quota.image.used} / ${quota.image.limit}，${quota.image.overridden ? '自定义' : '默认'}）`"><a-input-number v-model:value="limits.image" :min="0" :precision="0" placeholder="默认额度" /></a-form-item>
                <a-form-item :label="`助手消息（已用 ${quota.agent.used} / ${quota.agent.limit}，${quota.agent.overridden ? '自定义' : '默认'}）`"><a-input-number v-model:value="limits.agent" :min="0" :precision="0" placeholder="默认额度" /></a-form-item>
                <a-button type="primary" html-type="submit" :loading="quotaBusy">保存额度</a-button>
              </a-form><p class="settings-hint">下次重置 {{ accountTime(quota.resetAtMs) }}</p>
            </template>
          </section>
          <section class="settings-group-sub"><h4>最近账号事件</h4><a-empty v-if="!events.length && !detailBusy" description="暂无账号事件" />
            <ol class="account-events"><li v-for="(event, index) in events" :key="index"><strong>{{ accountEventLabel(event.action) }}</strong><p>{{ accountTime(event.occurredAtMs) }} · {{ event.actor }}</p><p v-if="event.detail">{{ event.detail }}</p></li></ol>
          </section>
        </a-spin>
      </template>
    </a-drawer>
    <a-modal v-model:open="inviteOpen" title="创建邀请码" ok-text="创建邀请码" cancel-text="取消" :confirm-loading="inviteBusy" :mask-closable="false" :closable="!inviteBusy" :cancel-button-props="{ disabled: inviteBusy }" @ok="createInvite">
      <a-form :model="newInvite" layout="vertical" @finish="createInvite">
        <a-form-item label="备注（可选）"><a-input v-model:value="newInvite.note" placeholder="便于区分用途或接收人" /></a-form-item>
        <a-form-item label="可注册名额"><a-input-number v-model:value="newInvite.maxUses" :min="1" :max="100" :precision="0" /></a-form-item>
        <a-form-item label="有效期（天）"><a-input-number v-model:value="newInvite.expiresInDays" :min="1" :max="90" :precision="0" /></a-form-item>
      </a-form><a-alert v-if="inviteError" type="error" :message="inviteError" show-icon />
    </a-modal>
    <a-modal v-model:open="inviteResultOpen" title="保存邀请码" :footer="null" :mask-closable="false" @after-close="inviteResult = undefined">
      <template v-if="inviteResult"><a-alert type="warning" message="邀请码和邀请链接只显示这一次，请立即保存。关闭后无法再次查看，可撤销后重新创建。" show-icon />
        <a-form class="result-form" layout="vertical"><a-form-item label="邀请码"><a-input :value="inviteResult.code" readonly /></a-form-item><a-form-item label="邀请链接"><a-input :value="inviteUrl" readonly /></a-form-item></a-form>
        <a-space wrap><a-button type="primary" @click="copy(inviteResult.code)">复制邀请码</a-button><a-button @click="copy(inviteUrl)">复制邀请链接</a-button><a-button @click="inviteResultOpen = false">已保存，关闭</a-button></a-space>
      </template>
    </a-modal>
  </div>
</template>
<style scoped>
.users-admin, .users-admin :deep(.ant-tabs), .users-admin :deep(.ant-tabs-content-holder), .users-admin :deep(.ant-tabs-tabpane) { min-width: 0; max-width: 100%; }
.users-filters { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-4); }
.users-filters > .ant-input-affix-wrapper { flex: 1 1 180px; min-width: 0; }
.users-filters > .ant-select { width: 120px; }
.users-table { width: 100%; min-width: 0; overflow-x: auto; }
.users-table :deep(td) { overflow-wrap: anywhere; }
.users-table :deep(.ant-pagination) { flex-wrap: wrap; }
.result-form, .quota-form { margin-top: var(--space-4); }
.quota-form :deep(.ant-input-number) { width: 100%; }
.account-events { list-style: none; margin: 0; padding: 0; }
.account-events li { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.account-events p { color: var(--muted-copy); font-size: 12px; line-height: 1.8; }
@media (max-width: 767px) { .users-filters > .ant-input-affix-wrapper { flex-basis: 100%; } .users-filters > .ant-select { flex: 1; min-width: 0; } }
</style>
