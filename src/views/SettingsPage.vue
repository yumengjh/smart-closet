<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightOutlined, LockOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../services/api'
import { useClosetStore } from '../stores/closet'

const closet = useClosetStore()
const router = useRouter()
const quota = ref({ limit: 20, used: 0, resetAt: '' })
const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))
const remaining = computed(() => Math.max(0, quota.value.limit - quota.value.used))

onMounted(async () => { if (!firstLogin.value) try { quota.value = await closetApi.quota() } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法加载额度。' } })
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
  <div class="settings-grid" :class="{ 'first-login-settings': firstLogin }">
    <section v-if="!firstLogin" class="settings-card quota-card"><div class="settings-card-icon"><ThunderboltOutlined /></div><h2>今日 AI 额度</h2><p class="quota-numbers"><strong>{{ remaining }}</strong><span> / {{ quota.limit }} 次还可以使用</span></p><a-progress :percent="Math.round(quota.used / quota.limit * 100)" :show-info="false" stroke-color="#202124" trail-color="#eceef2" />
      <div class="quota-legend"><span>已使用 {{ quota.used }} 次</span><span>{{ remaining }} 次可用</span></div><p class="settings-hint">识别和图片整理合计算一次；本地贴纸不计入额度。每日按北京时间重置。</p><p class="quota-reset">重置时间：{{ new Date(quota.resetAt || Date.now()).toLocaleString('zh-CN') }}</p></section>
    <section class="settings-card password-card"><div class="settings-card-icon"><LockOutlined /></div><p class="eyebrow">账户安全</p><h2>{{ firstLogin ? '设置新密码' : '修改密码' }}</h2><form class="password-form" @submit.prevent="changePassword"><label v-if="!firstLogin" for="old-pass">当前密码</label><a-input-password v-if="!firstLogin" id="old-pass" v-model:value="currentPassword" autocomplete="current-password" placeholder="输入当前密码" /><label for="new-pass">新密码</label><a-input-password id="new-pass" v-model:value="newPassword" autocomplete="new-password" placeholder="至少 12 个字符" /><label for="repeat-pass">再输一次新密码</label><a-input-password id="repeat-pass" v-model:value="repeatPassword" autocomplete="new-password" placeholder="确认新密码" /><a-alert v-if="error" type="error" :message="error" show-icon /><a-alert v-if="success" type="success" :message="success" show-icon /><a-button type="primary" html-type="submit" :loading="loading">保存密码 <ArrowRightOutlined /></a-button></form></section>
    <RouterLink v-if="!firstLogin" to="/trash" class="settings-card settings-link-card"><div class="settings-card-icon"><DeleteOutlined /></div><div><p class="eyebrow">已删除的衣物</p><h2>回收站</h2><p>被移出的衣物仍保留在这里，可以随时恢复。</p></div><ArrowRightOutlined class="settings-link-arrow" /></RouterLink>
  </div>
</template>
