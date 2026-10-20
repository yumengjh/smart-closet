<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import ThemeToggle from '../components/ThemeToggle.vue'
import { closetApi, usingMocks, type RegistrationMode } from '../services/api'

const route = useRoute(); const router = useRouter(); const closet = useClosetStore(); const appearance = useThemeStore()
const illustration = computed(() => appearance.isDark ? '/illustrations/yuda-login-dark.svg' : '/illustrations/yuda-login-light.svg')
const mode = ref<RegistrationMode>(); const modeLoading = ref(false); const busy = ref(false); const error = ref('')
const username = ref(''); const displayName = ref(''); const password = ref(''); const repeat = ref('')
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '')
async function loadMode() {
  modeLoading.value = true; error.value = ''
  try { mode.value = (await closetApi.registration()).mode }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '注册信息暂时无法加载。' }
  finally { modeLoading.value = false }
}
onMounted(loadMode)
async function submit() {
  if (busy.value || !mode.value || mode.value === 'CLOSED') return
  error.value = ''
  if (!/^[A-Za-z0-9_.-]{2,80}$/.test(username.value)) { error.value = '用户名需为 2–80 个字符，只能包含字母、数字、下划线、点和短横线。'; return }
  if (displayName.value.trim().length > 40 || /[\x00-\x1f\x7f]/.test(displayName.value)) { error.value = '昵称不能超过 40 个字符，也不能包含控制字符。'; return }
  if (password.value.length < 12) { error.value = '密码至少需要 12 个字符。'; return }
  if (password.value !== repeat.value) { error.value = '两次输入的密码不一致。'; return }
  if (mode.value === 'INVITE' && !inviteCode.value.trim()) { error.value = '请输入邀请码。'; return }
  busy.value = true
  try {
    closet.user = await closetApi.register({ username: username.value, password: password.value, displayName: displayName.value.trim() || undefined, inviteCode: inviteCode.value.trim() || undefined })
    password.value = ''; repeat.value = ''
    await router.replace('/wardrobe')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '注册未能完成，请稍后重试。' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="login-page">
    <div class="login-art" aria-hidden="true"><img class="login-hero-illustration" :src="illustration" alt="" /><p class="art-caption">从照片，<br /><em>到你的数字衣柜。</em></p></div>
    <div class="login-side">
      <div class="login-brand-row"><RouterLink to="/login" class="brand-lockup login-brand"><img class="brand-logo" src="/yuda-logo.png" alt="" /><span><strong>鱼搭</strong><small>数字衣橱</small></span></RouterLink><ThemeToggle /></div>
      <div class="login-form-wrap">
        <p class="eyebrow">专属衣橱</p><h1>注册你的账号</h1><p class="login-intro">为你的衣物，留一个自己的位置。</p>
        <a-alert v-if="mode === 'CLOSED'" class="registration-note" type="info" message="当前暂未开放注册，请使用已有账号登录。" show-icon />
        <form v-else class="login-form" @submit.prevent="submit">
          <label for="register-username">用户名</label><a-input id="register-username" v-model:value="username" :maxlength="80" autocomplete="username" placeholder="2–80 位字母、数字或 _ . -" />
          <label for="register-name">昵称（可选）</label><a-input id="register-name" v-model:value="displayName" :maxlength="40" autocomplete="nickname" placeholder="希望我们如何称呼你" />
          <label for="register-password">密码</label><a-input-password id="register-password" v-model:value="password" autocomplete="new-password" placeholder="至少 12 个字符" />
          <label for="register-repeat">确认密码</label><a-input-password id="register-repeat" v-model:value="repeat" autocomplete="new-password" placeholder="再输一次密码" />
          <label for="register-invite">邀请码{{ mode === 'OPEN' ? '（可选）' : '' }}</label><a-input id="register-invite" v-model:value="inviteCode" autocomplete="off" placeholder="输入管理员提供的邀请码" />
          <a-button type="primary" html-type="submit" :disabled="!mode" :loading="busy || modeLoading" block class="login-submit">注册并进入衣柜</a-button>
          <p v-if="usingMocks" class="login-hint">界面演示：请使用演示管理员创建的邀请码，示例数据仅保存在当前浏览器。</p>
        </form>
        <a-alert v-if="error" class="registration-note" type="error" :message="error" show-icon />
        <a-button v-if="!mode && !modeLoading" type="link" @click="loadMode">重新加载注册信息</a-button>
        <a-button type="link" @click="router.push('/login')">已有账号？返回登录</a-button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.registration-note { margin-top: var(--space-4); }
</style>
