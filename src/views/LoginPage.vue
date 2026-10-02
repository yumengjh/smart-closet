<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import ThemeToggle from '../components/ThemeToggle.vue'
import { closetApi, usingMocks } from '../services/api'

const router = useRouter()
const route = useRoute()
const closet = useClosetStore()
const appearance = useThemeStore()
const loginIllustration = computed(() => appearance.isDark ? '/illustrations/yuda-login-dark.svg' : '/illustrations/yuda-login-light.svg')
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
onMounted(() => { if (route.query.portableLink === 'invalid') error.value = '便携登录链接无效、已使用或已过期，请让分享者重新生成。' })

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
  <div class="login-page">
    <div class="login-art" aria-hidden="true">
      <img class="login-hero-illustration" :src="loginIllustration" alt="" /><p class="art-caption">从照片，<br /><em>到你的数字衣柜。</em></p>
    </div>
    <div class="login-side">
      <div class="login-brand-row"><RouterLink to="/login" class="brand-lockup login-brand"><img class="brand-logo" src="/yuda-logo.png" alt="" /><span><strong>鱼搭</strong><small>数字衣橱</small></span></RouterLink><ThemeToggle /></div>
      <div class="login-form-wrap">
        <p class="eyebrow">专属衣橱</p><h1>登录你的衣柜</h1><p class="login-intro">使用受邀账号登录，查看你的照片、任务和衣物。</p>
        <form class="login-form" @submit.prevent="submit">
          <label for="username">用户名</label><a-input id="username" v-model:value="username" autocomplete="username" placeholder="请输入你的用户名" autofocus />
          <label for="password">密码</label><a-input-password id="password" v-model:value="password" autocomplete="current-password" placeholder="请输入密码" />
          <a-alert v-if="error" type="error" :message="error" show-icon />
          <a-button type="primary" html-type="submit" :loading="busy" block class="login-submit">进入我的衣橱 <span aria-hidden="true">↗</span></a-button>
          <p v-if="usingMocks" class="login-hint">界面演示：示例内容并非 AI 结果，不能提交真实任务。</p>
        </form>
      </div>
      <small class="login-footer">照片与 AI 任务按账号独立保存。</small>
    </div>
  </div>
</template>
