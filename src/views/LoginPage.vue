<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClosetStore } from '../stores/closet'
import AuthShell from '../components/AuthShell.vue'
import { closetApi, usingMocks } from '../services/api'

const router = useRouter()
const route = useRoute()
const closet = useClosetStore()
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const registrationOpen = ref(false)
onMounted(async () => {
  try { registrationOpen.value = (await closetApi.registration()).mode !== 'CLOSED' } catch { /* 登录仍可使用。 */ }
})
onMounted(() => {
  if (route.query.portableLink === 'invalid') error.value = '便携登录链接无效、已使用或已过期，请让分享者重新生成。'
  else if (route.query.portableLink === 'error') error.value = typeof route.query.portableError === 'string' ? route.query.portableError : '便携登录暂时无法完成，请稍后重试。'
})

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    closet.user = await closetApi.login(username.value, password.value)
    await router.replace(closet.user.mustChangePassword ? '/settings?firstLogin=1' : '/wardrobe')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '登录失败，请稍后重试。' }
  finally { busy.value = false }
}
</script>

<template>
  <AuthShell eyebrow="欢迎回来" title="登录你的衣柜" intro="查看你的衣物、搭配和处理进度。">
    <form class="auth-form" @submit.prevent="submit">
      <label for="username">用户名</label><a-input id="username" v-model:value="username" size="large" autocomplete="username" placeholder="请输入你的用户名" autofocus />
      <label for="password">密码</label><a-input-password id="password" v-model:value="password" size="large" autocomplete="current-password" placeholder="请输入密码" />
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-button type="primary" html-type="submit" size="large" :loading="busy" block class="auth-submit">进入我的衣橱</a-button>
      <a-button v-if="registrationOpen" size="large" block @click="router.push('/register')">还没有账号？注册</a-button>
      <p v-if="usingMocks" class="auth-hint">界面演示：示例内容并非 AI 结果，不能提交真实任务。</p>
    </form>
    <template v-if="!registrationOpen" #footer><span>账号由管理员创建，忘记密码请联系管理员。</span></template>
  </AuthShell>
</template>
