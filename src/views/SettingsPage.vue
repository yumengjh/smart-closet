<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightOutlined, LockOutlined, DeleteOutlined, ThunderboltOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../services/api'
import { useClosetStore } from '../stores/closet'
import AgentSettings from '../agent/AgentSettings.vue'

const closet = useClosetStore()
const router = useRouter()
const quota = ref({ limit: 20, used: 0, resetAt: '' })
const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const portablePassword = ref('')
const portableLinks = ref<Awaited<ReturnType<typeof closetApi.portableLoginLinks>>>([])
const portableUrl = ref('')
const portableLinkId = ref('')
const portableBusy = ref(false)
const portableMessage = ref('')
const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))
const remaining = computed(() => Math.max(0, quota.value.limit - quota.value.used))

onMounted(async () => { if (!firstLogin.value) { try { quota.value = await closetApi.quota() } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法加载额度。' }; if (!closet.user?.portableLogin) await refreshPortableLinks() } })
async function refreshPortableLinks() { try { portableLinks.value = await closetApi.portableLoginLinks() } catch (cause) { portableMessage.value = cause instanceof Error ? cause.message : '便携登录记录暂时无法加载。' } }
async function createPortableLink() {
  portableBusy.value = true; portableMessage.value = ''; portableUrl.value = ''
  try {
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    if (window.location.protocol !== 'https:' && !loopback) throw new Error('分享便携登录链接需要 HTTPS 连接。')
    const grant = await closetApi.createPortableLoginLink(portablePassword.value)
    portablePassword.value = ''; portableLinkId.value = grant.id
    portableUrl.value = `${window.location.origin}/wardrobe#portable-login=${grant.token}`
    try { await navigator.clipboard.writeText(portableUrl.value); portableMessage.value = '链接已生成并复制。它将在 10 分钟后失效，且只能登录一次。' }
    catch { portableMessage.value = '链接已生成，请手动复制。它将在 10 分钟后失效，且只能登录一次。' }
    await refreshPortableLinks()
  } catch (cause) { portableMessage.value = cause instanceof Error ? cause.message : '生成失败。' }
  finally { portableBusy.value = false }
}
async function revokePortableLink(id: string) {
  try { await closetApi.revokePortableLoginLink(id); if (portableLinkId.value === id) { portableLinkId.value = ''; portableUrl.value = '' }; portableMessage.value = '登录授权已撤销。'; await refreshPortableLinks() }
  catch (cause) { portableMessage.value = cause instanceof Error ? cause.message : '撤销失败。' }
}
async function copyPortableLink() {
  try { await navigator.clipboard.writeText(portableUrl.value); portableMessage.value = '链接已复制。' }
  catch { portableMessage.value = '无法访问剪贴板，请选中链接手动复制。' }
}
async function changePassword() {
  error.value = ''; success.value = ''
  if (newPassword.value.length < 12) { error.value = '新密码至少需要 12 个字符。'; return }
  if (newPassword.value !== repeatPassword.value) { error.value = '两次输入的新密码不一致。'; return }
  loading.value = true
  const wasFirstLogin = firstLogin.value
  try { await closetApi.changePassword(currentPassword.value, newPassword.value); closet.user!.mustChangePassword = false; success.value = '密码已更新。'; currentPassword.value = ''; newPassword.value = ''; repeatPassword.value = ''; if (wasFirstLogin) await router.replace('/wardrobe') }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '密码未能更新。' }
  finally { loading.value = false }
}
</script>

<template>
  <div class="page-heading simple-heading"><div><p class="eyebrow">账户与设置</p><h1>{{ firstLogin ? '设置新密码' : '我的' }}</h1><p class="page-subtitle">{{ firstLogin ? '完成后即可上传照片、查看任务和管理衣柜。' : '衣橱设置和每日整理额度。' }}</p></div><div class="settings-avatar">{{ closet.user?.username?.slice(0, 1).toUpperCase() }}</div></div>
  <div v-if="firstLogin" class="first-login-note"><LockOutlined /><div><strong>先为你的账号换一个新密码。</strong><p>这是管理员提供的初始密码，修改后就可以开始整理衣橱。</p></div></div>
  <a-alert v-if="closet.user?.portableLogin" type="info" message="当前使用便携登录授权，最长 24 小时有效。修改密码或管理授权需退出后使用账号密码登录。" show-icon />
  <div class="settings-grid" :class="{ 'first-login-settings': firstLogin }">
    <AgentSettings v-if="!firstLogin" />
    <section v-if="!firstLogin" class="settings-card quota-card"><div class="settings-card-icon"><ThunderboltOutlined /></div><h2>今日 AI 额度</h2><p class="quota-numbers"><strong>{{ remaining }}</strong><span> / {{ quota.limit }} 次还可以使用</span></p><a-progress :percent="Math.round(quota.used / quota.limit * 100)" :show-info="false" stroke-color="#202124" trail-color="#eceef2" />
      <div class="quota-legend"><span>已使用 {{ quota.used }} 次</span><span>{{ remaining }} 次可用</span></div><p class="settings-hint">识别和图片整理合计算一次；本地贴纸不计入额度。每日按北京时间重置。</p><p class="quota-reset">重置时间：{{ new Date(quota.resetAt || Date.now()).toLocaleString('zh-CN') }}</p></section>
    <section v-if="!firstLogin && !closet.user?.portableLogin" class="settings-card portable-login-card"><div class="settings-card-icon"><LinkOutlined /></div><p class="eyebrow">跨设备访问</p><h2>便携登录链接</h2><p class="settings-hint">生成后可分享给可信任的人或设备。链接可进入你的账号中的衣物和业务功能，无法修改密码或继续签发登录链接；10 分钟有效，只能兑换一次。登录后会保持登录，最长 24 小时，也可随时撤回访问。请勿发到公开群聊。</p><form class="password-form" @submit.prevent="createPortableLink"><label for="portable-password">再次输入当前密码以确认</label><a-input-password id="portable-password" v-model:value="portablePassword" autocomplete="current-password" placeholder="当前账号密码" /><a-button type="primary" html-type="submit" :loading="portableBusy" :disabled="!portablePassword">生成并复制一次性链接 <CopyOutlined /></a-button></form><div v-if="portableUrl" class="portable-link-result"><label for="portable-url">新链接（只显示本次）</label><a-input id="portable-url" :value="portableUrl" readonly /><a-button @click="copyPortableLink"><CopyOutlined /> 复制</a-button></div><a-alert v-if="portableMessage" class="portable-message" :type="portableUrl ? 'success' : portableMessage.includes('失败') || portableMessage.includes('不正确') || portableMessage.includes('HTTPS') ? 'error' : 'info'" :message="portableMessage" show-icon /><div v-if="portableLinks.some(link => ['PENDING', 'USED'].includes(link.status))" class="portable-pending-links"><strong>登录链接与授权设备</strong><div v-for="link in portableLinks.filter(item => ['PENDING', 'USED'].includes(item.status))" :key="link.id" class="portable-pending-row"><span>{{ link.status === 'USED' ? '已登录 · 授权到期' : '待使用 · 到期' }} {{ new Date(link.status === 'USED' ? link.sessionExpiresAt ?? link.expiresAt : link.expiresAt).toLocaleString('zh-CN') }}</span><a-button danger type="text" @click="revokePortableLink(link.id)">撤销</a-button></div></div></section>
    <section v-if="!closet.user?.portableLogin" class="settings-card password-card"><div class="settings-card-icon"><LockOutlined /></div><p class="eyebrow">账户安全</p><h2>{{ firstLogin ? '设置新密码' : '修改密码' }}</h2><form class="password-form" @submit.prevent="changePassword"><label v-if="!firstLogin" for="old-pass">当前密码</label><a-input-password v-if="!firstLogin" id="old-pass" v-model:value="currentPassword" autocomplete="current-password" placeholder="输入当前密码" /><label for="new-pass">新密码</label><a-input-password id="new-pass" v-model:value="newPassword" autocomplete="new-password" placeholder="至少 12 个字符" /><label for="repeat-pass">再输一次新密码</label><a-input-password id="repeat-pass" v-model:value="repeatPassword" autocomplete="new-password" placeholder="确认新密码" /><a-alert v-if="error" type="error" :message="error" show-icon /><a-alert v-if="success" type="success" :message="success" show-icon /><a-button type="primary" html-type="submit" :loading="loading">保存密码 <ArrowRightOutlined /></a-button></form></section>
    <RouterLink v-if="!firstLogin" to="/trash" class="settings-card settings-link-card"><div class="settings-card-icon"><DeleteOutlined /></div><div><p class="eyebrow">已删除的衣物</p><h2>回收站</h2><p>被移出的衣物仍保留在这里，可以随时恢复。</p></div><ArrowRightOutlined class="settings-link-arrow" /></RouterLink>
  </div>
</template>
