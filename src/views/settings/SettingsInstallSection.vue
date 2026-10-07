<script setup lang="ts">
import { computed, ref } from 'vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import { installBlocker, installGuides, type InstallOs } from '../../domain/install-platform'
import { appInstalled, canPromptInstall, installPlatform, promptInstall } from '../../services/pwa'
import { playSound } from '../../services/sound'

const selectedOs = ref<InstallOs>(installPlatform.os)
const guide = computed(() => installGuides.find(item => item.os === selectedOs.value) ?? installGuides[0])
const osOptions = installGuides.map(item => ({ value: item.os, label: item.os === installPlatform.os ? `${item.label} · 本机` : item.label }))
const blocker = installBlocker(installPlatform)
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const insecure = !window.isSecureContext && !loopback
const busy = ref(false)
const message = ref<{ type: 'success' | 'info'; text: string }>()

async function install() {
  busy.value = true
  try {
    const outcome = await promptInstall()
    if (outcome === 'accepted') { playSound('success'); message.value = { type: 'success', text: '已开始安装，完成后可从桌面或主屏幕打开鱼搭。' } }
    else if (outcome === 'dismissed') message.value = { type: 'info', text: '已取消安装，随时可以再来这里安装。' }
  } finally { busy.value = false }
}
</script>

<template>
  <div class="settings-section-content">
    <section class="settings-group">
      <header class="settings-group-head">
        <h3>安装到这台设备</h3>
        <p>安装后鱼搭会像应用一样独立打开，有自己的图标和窗口，启动更快，网络不稳时也能打开界面。</p>
      </header>

      <a-alert v-if="appInstalled" type="success" show-icon message="鱼搭已安装，当前正以应用模式运行。" />
      <template v-else>
        <a-alert v-if="insecure" type="warning" show-icon message="安装需要 HTTPS 连接，请通过 https:// 地址访问后再试。" />
        <a-alert v-else-if="blocker" type="warning" show-icon :message="blocker" />
        <a-alert v-if="message" :type="message.type" show-icon :message="message.text" />
        <div class="settings-group-actions">
          <a-button v-if="canPromptInstall" type="primary" :loading="busy" @click="install">
            <DownloadOutlined /> 安装鱼搭
          </a-button>
          <p v-else class="install-manual-hint">当前浏览器不提供一键安装，请按下方「{{ guide.label }}」步骤手动添加。</p>
        </div>
      </template>
    </section>

    <section class="settings-group">
      <header class="settings-group-head">
        <h3>各系统安装指引</h3>
        <p>已为你选中当前设备，也可以切换查看其他设备的步骤。</p>
      </header>
      <a-segmented v-model:value="selectedOs" class="install-os-switch" :options="osOptions" />
      <div class="install-guide">
        <p class="install-guide-browsers">支持的浏览器：{{ guide.browsers }}</p>
        <ol class="install-steps">
          <li v-for="(step, index) in guide.steps" :key="step"><span>{{ index + 1 }}</span>{{ step }}</li>
        </ol>
        <p v-if="guide.note" class="settings-hint">{{ guide.note }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.install-manual-hint { margin: 0; font-size: 13px; line-height: 1.7; color: var(--muted-copy); }
.install-os-switch { max-width: 100%; }
.install-os-switch :deep(.ant-segmented-group) { flex-wrap: wrap; }
.install-guide { margin-top: var(--space-5); }
.install-guide-browsers { margin: 0 0 var(--space-4); font-size: 13px; color: var(--muted-copy); }
.install-steps { display: flex; flex-direction: column; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.install-steps li { display: flex; align-items: flex-start; gap: var(--space-3); font-size: 14px; line-height: 24px; }
.install-steps span { display: grid; flex-shrink: 0; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--surface-alt); color: var(--muted-strong); font-size: 12px; font-weight: 600; }
</style>
