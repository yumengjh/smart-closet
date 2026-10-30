<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowRightOutlined } from '@ant-design/icons-vue'
import { closetApi, type AccountProfile, type AccountSession } from '../../services/api'
import { accountTime, passwordProblem, registeredViaLabels } from '../../domain/account'
import { useClosetStore } from '../../stores/closet'

const closet = useClosetStore(); const router = useRouter(); const { modal, message } = App.useApp()
const currentPassword = ref(''); const newPassword = ref(''); const repeatPassword = ref(''); const signOutOthers = ref(true)
const loading = ref(false); const error = ref(''); const success = ref('')
const profile = ref<AccountProfile>(); const displayName = ref(''); const profileBusy = ref(false); const profileError = ref('')
const sessions = ref<AccountSession[]>([]); const sessionsLoading = ref(false); const sessionsError = ref('')
const deactivateOpen = ref(false); const deactivatePassword = ref(''); const deactivateError = ref(''); const deactivating = ref(false)
const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))
async function loadProfile() {
  profileError.value = ''
  try { profile.value = await closetApi.profile(); displayName.value = profile.value.displayName || '' }
  catch (cause) { profileError.value = cause instanceof Error ? cause.message : '个人资料暂时无法加载。' }
}
async function loadSessions() {
  sessionsLoading.value = true; sessionsError.value = ''
  try { sessions.value = await closetApi.sessions() }
  catch (cause) { sessionsError.value = cause instanceof Error ? cause.message : '登录设备暂时无法加载。' }
  finally { sessionsLoading.value = false }
}
onMounted(() => { if (!firstLogin.value) { void loadProfile(); void loadSessions() } })
async function saveProfile() {
  profileError.value = ''
  if (displayName.value.trim().length > 40 || /[\x00-\x1f\x7f]/.test(displayName.value)) { profileError.value = '昵称不能超过 40 个字符，也不能包含控制字符。'; return }
  profileBusy.value = true
  try {
    profile.value = await closetApi.updateProfile({ displayName: displayName.value.trim() || null }); displayName.value = profile.value.displayName || ''
    if (closet.user) closet.user.displayName = profile.value.displayName
    message.success('个人资料已保存。')
  } catch (cause) { profileError.value = cause instanceof Error ? cause.message : '个人资料未能保存。' }
  finally { profileBusy.value = false }
}
async function changePassword() {
  if (loading.value) return
  error.value = ''; success.value = ''
  const problem = passwordProblem(newPassword.value)
  if (problem) { error.value = '新' + problem; return }
  if (newPassword.value !== repeatPassword.value) { error.value = '两次输入的新密码不一致。'; return }
  loading.value = true; const wasFirstLogin = firstLogin.value
  try {
    await closetApi.changePassword(currentPassword.value, newPassword.value, signOutOthers.value)
    if (closet.user) closet.user.mustChangePassword = false
    success.value = '密码已更新。'; currentPassword.value = ''; newPassword.value = ''; repeatPassword.value = ''
    if (wasFirstLogin) await router.replace('/wardrobe')
    else await loadSessions()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '密码未能更新。' }
  finally { loading.value = false }
}
function signOutOtherDevices() {
  modal.confirm({ title: '退出其他设备？', content: '当前设备会保持登录，其他设备会退出，便携登录授权也会被撤销。', okText: '退出其他设备', cancelText: '取消', onOk: async () => {
    try { const result = await closetApi.signOutOtherSessions(); message.success(`已退出 ${result.revokedSessions} 个其他会话。`); await loadSessions() }
    catch (cause) { message.error(cause instanceof Error ? cause.message : '退出失败，请稍后重试。'); throw cause }
  } })
}
async function deactivate() {
  if (deactivating.value) return
  deactivateError.value = ''
  if (!deactivatePassword.value) { deactivateError.value = '请输入当前密码。'; return }
  deactivating.value = true
  try { await closetApi.deactivate(deactivatePassword.value); closet.clearSession(); deactivateOpen.value = false; deactivatePassword.value = ''; await router.replace('/login') }
  catch (cause) { deactivateError.value = cause instanceof Error ? cause.message : '注销未能完成。' }
  finally { deactivating.value = false }
}
function openDeactivation() { deactivatePassword.value = ''; deactivateError.value = ''; deactivateOpen.value = true }
</script>

<template>
  <div class="settings-section-content">
    <section v-if="!firstLogin" class="settings-group">
      <header class="settings-group-head"><h3>个人资料</h3><p>昵称用于界面展示，用户名用于登录，暂不支持修改。</p></header>
      <a-alert v-if="profileError" type="error" :message="profileError" show-icon />
      <a-button v-if="!profile && profileError" @click="loadProfile">重新加载</a-button>
      <a-skeleton v-else-if="!profile" active />
      <template v-else>
        <form class="password-form" @submit.prevent="saveProfile">
          <label for="account-username">用户名</label><a-input id="account-username" :value="profile.username" readonly />
          <label for="account-display-name">昵称</label><a-input id="account-display-name" v-model:value="displayName" :maxlength="40" placeholder="留空时显示用户名" autocomplete="nickname" />
          <a-button type="primary" html-type="submit" :loading="profileBusy">保存资料</a-button>
        </form>
        <a-descriptions class="account-details" :column="1" size="small">
          <a-descriptions-item label="注册时间">{{ accountTime(profile.createdAtMs) }}</a-descriptions-item>
          <a-descriptions-item label="最近登录">{{ accountTime(profile.lastLoginAtMs) }}</a-descriptions-item>
          <a-descriptions-item label="注册来源">{{ registeredViaLabels[profile.registeredVia] || profile.registeredVia }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </section>
    <section class="settings-group">
      <header class="settings-group-head"><h3>{{ firstLogin ? '设置新密码' : '修改密码' }}</h3><p>密码至少 12 个字符、不超过 72 字节（汉字约 3 字节），修改后立即生效。</p></header>
      <form class="password-form" @submit.prevent="changePassword">
        <template v-if="!firstLogin"><label for="old-pass">当前密码</label><a-input-password id="old-pass" v-model:value="currentPassword" autocomplete="current-password" placeholder="输入当前密码" /></template>
        <label for="new-pass">新密码</label><a-input-password id="new-pass" v-model:value="newPassword" autocomplete="new-password" placeholder="至少 12 个字符" />
        <label for="repeat-pass">再输一次新密码</label><a-input-password id="repeat-pass" v-model:value="repeatPassword" autocomplete="new-password" placeholder="确认新密码" />
        <a-checkbox v-model:checked="signOutOthers">同时退出其他设备</a-checkbox>
        <a-alert v-if="error" type="error" :message="error" show-icon /><a-alert v-if="success" type="success" :message="success" show-icon />
        <a-button type="primary" html-type="submit" :loading="loading">{{ firstLogin ? '设置密码并开始使用' : '保存密码' }} <ArrowRightOutlined /></a-button>
      </form>
    </section>
    <template v-if="!firstLogin">
      <section class="settings-group">
        <header class="settings-group-head settings-group-head-row"><div><h3>登录设备</h3><p>查看仍在登录的设备，移除不再使用的会话。</p></div><a-button @click="signOutOtherDevices">退出其他设备</a-button></header>
        <a-alert v-if="sessionsError" type="error" :message="sessionsError" show-icon />
        <a-button v-if="sessionsError" @click="loadSessions">重新加载</a-button>
        <a-spin :spinning="sessionsLoading">
          <a-empty v-if="!sessions.length && !sessionsLoading && !sessionsError" description="暂无登录设备" />
          <article v-for="session in sessions" :key="session.sessionRef" class="account-device">
            <strong>{{ session.device }}</strong> <a-tag v-if="session.current" color="green">当前设备</a-tag><a-tag v-if="session.portable" color="blue">便携登录</a-tag>
            <p>登录于 {{ accountTime(session.createdAtMs) }}<br />最近活动 {{ accountTime(session.lastAccessAtMs) }}<br />到期时间 {{ accountTime(session.expiresAtMs) }}</p>
          </article>
        </a-spin>
      </section>
      <section class="settings-group account-danger">
        <header class="settings-group-head"><h3>注销账号</h3><p>注销后账号将停用，所有设备会退出。衣物和其他数据会保留，管理员可恢复账号。</p></header>
        <a-button danger @click="openDeactivation">注销账号</a-button>
      </section>
    </template>
    <a-modal v-model:open="deactivateOpen" title="确认注销账号" ok-text="注销账号" cancel-text="取消" :ok-button-props="{ danger: true }" :confirm-loading="deactivating" :closable="!deactivating" :mask-closable="false" :cancel-button-props="{ disabled: deactivating }" @ok="deactivate" @after-close="deactivatePassword = ''">
      <a-alert type="warning" message="注销会停用账号并退出全部设备，数据会保留，管理员可恢复账号。" show-icon />
      <form class="password-form" @submit.prevent="deactivate"><label for="deactivate-password">当前密码</label><a-input-password id="deactivate-password" v-model:value="deactivatePassword" autocomplete="current-password" placeholder="输入密码确认注销" /></form>
      <a-alert v-if="deactivateError" type="error" :message="deactivateError" show-icon />
    </a-modal>
  </div>
</template>
<style scoped>
.account-details { margin-top: var(--space-5); }
.account-device { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.account-device:last-child { border-bottom: 0; }
.account-device p { margin-top: var(--space-2); color: var(--muted-copy); font-size: 12px; line-height: 1.8; }
.account-danger { border-color: var(--danger-line, var(--line)); }
</style>
