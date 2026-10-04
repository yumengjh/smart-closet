<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { LinkOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../../services/api'
import { useClosetStore } from '../../stores/closet'

const closet = useClosetStore()

type PortableLinks = Awaited<ReturnType<typeof closetApi.portableLoginLinks>>
const portablePassword = ref('')
const portableLinks = ref<PortableLinks>([])
const portableUrl = ref('')
const portableLinkId = ref('')
const portableBusy = ref(false)
const portableMessage = ref('')

async function refreshPortableLinks() {
  try { portableLinks.value = await closetApi.portableLoginLinks() } catch (cause) { portableMessage.value = cause instanceof Error ? cause.message : '便携登录记录暂时无法加载。' }
}

onMounted(() => { void refreshPortableLinks() })

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
  try {
    await closetApi.revokePortableLoginLink(id)
    if (portableLinkId.value === id) { portableLinkId.value = ''; portableUrl.value = '' }
    portableMessage.value = '登录授权已撤销。'
    await refreshPortableLinks()
  } catch (cause) { portableMessage.value = cause instanceof Error ? cause.message : '撤销失败。' }
}

async function copyPortableLink() {
  try { await navigator.clipboard.writeText(portableUrl.value); portableMessage.value = '链接已复制。' }
  catch { portableMessage.value = '无法访问剪贴板，请选中链接手动复制。' }
}

const alertType = (msg: string, hasUrl: boolean) => {
  if (hasUrl) return 'success'
  if (msg.includes('失败') || msg.includes('不正确') || msg.includes('HTTPS')) return 'error'
  return 'info'
}
</script>

<template>
  <div class="settings-section-content">
    <div class="settings-section-icon"><LinkOutlined /></div>
    <p class="eyebrow">跨设备访问</p>
    <h2>便携登录链接</h2>
    <p class="settings-hint">生成后可分享给可信任的人或设备。链接可进入你的账号中的衣物和业务功能，无法修改密码或继续签发登录链接；10 分钟有效，只能兑换一次。登录后会保持登录，最长 24 小时，也可随时撤回访问。请勿发到公开群聊。</p>

    <form class="password-form" @submit.prevent="createPortableLink">
      <label for="portable-password">再次输入当前密码以确认</label>
      <a-input-password id="portable-password" v-model:value="portablePassword" autocomplete="current-password" placeholder="当前账号密码" />
      <a-button type="primary" html-type="submit" :loading="portableBusy" :disabled="!portablePassword">
        生成并复制一次性链接 <CopyOutlined />
      </a-button>
    </form>

    <div v-if="portableUrl" class="portable-link-result">
      <label for="portable-url">新链接（只显示本次）</label>
      <a-input id="portable-url" :value="portableUrl" readonly />
      <a-button @click="copyPortableLink"><CopyOutlined /> 复制</a-button>
    </div>

    <a-alert v-if="portableMessage" class="portable-message"
      :type="alertType(portableMessage, !!portableUrl)"
      :message="portableMessage" show-icon />

    <div v-if="portableLinks.some(link => ['PENDING', 'USED'].includes(link.status))" class="portable-pending-links">
      <strong>登录链接与授权设备</strong>
      <div v-for="link in portableLinks.filter(item => ['PENDING', 'USED'].includes(item.status))" :key="link.id" class="portable-pending-row">
        <span>{{ link.status === 'USED' ? '已登录 · 授权到期' : '待使用 · 到期' }}
          {{ new Date(link.status === 'USED' ? link.sessionExpiresAt ?? link.expiresAt : link.expiresAt).toLocaleString('zh-CN') }}</span>
        <a-button danger type="text" @click="revokePortableLink(link.id)">撤销</a-button>
      </div>
    </div>
  </div>
</template>
