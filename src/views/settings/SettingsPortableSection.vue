<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Empty } from 'ant-design-vue'
import { CopyOutlined } from '@ant-design/icons-vue'
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
const activeLinks = computed(() => portableLinks.value.filter(link => ['PENDING', 'USED'].includes(link.status)))

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
    <section class="settings-group">
      <header class="settings-group-head">
        <h3>生成一次性登录链接</h3>
        <p>分享给可信任的人或设备，请勿发到公开群聊。</p>
      </header>
      <ul class="portable-rules">
        <li>可进入你账号中的衣物和业务功能，无法修改密码或继续签发链接。</li>
        <li>链接 10 分钟内有效，只能兑换一次。</li>
        <li>登录后最长保持 24 小时，可随时撤回访问。</li>
      </ul>

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
    </section>

    <section class="settings-group">
      <header class="settings-group-head">
        <h3>登录链接与授权设备</h3>
        <p>撤销后，对应链接或设备会立即失去访问权限。</p>
      </header>
      <div v-if="activeLinks.length" class="portable-pending-links">
        <div v-for="link in activeLinks" :key="link.id" class="portable-pending-row">
          <span>
            <a-tag :color="link.status === 'USED' ? 'success' : 'processing'">{{ link.status === 'USED' ? '已登录' : '待使用' }}</a-tag>
            {{ link.status === 'USED' ? '授权到期' : '链接到期' }}
            {{ new Date(link.status === 'USED' ? link.sessionExpiresAt ?? link.expiresAt : link.expiresAt).toLocaleString('zh-CN') }}
          </span>
          <a-button danger type="text" size="small" @click="revokePortableLink(link.id)">撤销</a-button>
        </div>
      </div>
      <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无有效链接或授权设备" />
    </section>
  </div>
</template>
