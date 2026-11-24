<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClosetStore } from '../stores/closet'
import AuthShell from '../components/AuthShell.vue'
import { closetApi, usingMocks } from '../services/api'
import { takeSessionNotice } from '../domain/sessionNotice'
import { mailEnabled } from '../domain/emailAccount'

const router = useRouter()
const route = useRoute()
const closet = useClosetStore()
// 刚找回密码回来时带上填过的用户名或邮箱（放在 history.state，不进地址栏）。
const username = ref(typeof window !== 'undefined' && typeof window.history.state?.login === 'string' ? window.history.state.login as string : '')
const password = ref('')
const busy = ref(false)
const error = ref('')
// smart-closet-server#175: this device was signed out by a newer login on the same account.
const notice = ref(takeSessionNotice() ?? '')
const registrationOpen = ref(false)
// 邮件开启时（server#296）可以用绑定的邮箱登录，也能自己找回密码；关闭时页面与原来一致。
const mailOn = ref(false)
onMounted(async () => {
  try { const registration = await closetApi.registration(); registrationOpen.value = registration.mode !== 'CLOSED'; mailOn.value = mailEnabled(registration) } catch { /* 登录仍可使用。 */ }
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
    notice.value = ''
    await router.replace(closet.user.mustChangePassword ? '/settings?firstLogin=1' : '/today')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '登录失败，请稍后重试。' }
  finally { busy.value = false }
}
</script>

<template>
  <AuthShell showcase eyebrow="欢迎回来" title="登录你的衣柜" intro="查看你的衣物、搭配和处理进度。">
    <form class="auth-form" @submit.prevent="submit">
      <label for="username">{{ mailOn ? '账号' : '用户名' }}</label><a-input id="username" v-model:value="username" size="large" autocomplete="username" :placeholder="mailOn ? '用户名或邮箱' : '请输入你的用户名'" autofocus />
      <div v-if="mailOn" class="login-password-head"><label for="password">密码</label><RouterLink to="/forgot" class="login-forgot">忘记密码？</RouterLink></div>
      <label v-else for="password">密码</label>
      <a-input-password id="password" v-model:value="password" size="large" autocomplete="current-password" placeholder="请输入密码" />
      <a-alert v-if="notice && !error" type="warning" :message="notice" show-icon />
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-button type="primary" html-type="submit" size="large" :loading="busy" block class="auth-submit">进入我的衣橱</a-button>
      <a-button v-if="registrationOpen" size="large" block @click="router.push('/register')">还没有账号？注册</a-button>
      <p v-if="usingMocks" class="auth-hint">界面演示：示例内容并非 AI 结果，不能提交真实任务。</p>
    </form>
    <template #footer><span v-if="!registrationOpen">{{ mailOn ? '账号由管理员创建。' : '账号由管理员创建，忘记密码请联系管理员。' }}</span><RouterLink to="/feedback?from=/login">登录遇到问题？反馈给我们</RouterLink></template>
  </AuthShell>
</template>

<style scoped>
.login-password-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 6px; }
.login-password-head label { margin-top: 0; }
.login-forgot { padding: 4px 0; font-size: 13px; }
</style>
