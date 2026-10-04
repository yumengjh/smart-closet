<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightOutlined, LockOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../../services/api'
import { useClosetStore } from '../../stores/closet'

const closet = useClosetStore()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

const firstLogin = computed(() => Boolean(closet.user?.mustChangePassword))

async function changePassword() {
  error.value = ''; success.value = ''
  if (newPassword.value.length < 12) { error.value = '新密码至少需要 12 个字符。'; return }
  if (newPassword.value !== repeatPassword.value) { error.value = '两次输入的新密码不一致。'; return }
  loading.value = true
  const wasFirstLogin = firstLogin.value
  try {
    await closetApi.changePassword(currentPassword.value, newPassword.value)
    closet.user!.mustChangePassword = false
    success.value = '密码已更新。'
    currentPassword.value = ''; newPassword.value = ''; repeatPassword.value = ''
    if (wasFirstLogin) await router.replace('/wardrobe')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '密码未能更新。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="settings-section-content">
    <div class="settings-section-icon"><LockOutlined /></div>
    <p class="eyebrow">账户安全</p>
    <h2>{{ firstLogin ? '设置新密码' : '修改密码' }}</h2>
    <p class="settings-hint">密码至少 12 个字符，修改后立即生效。</p>
    <form class="password-form" @submit.prevent="changePassword">
      <template v-if="!firstLogin">
        <label for="old-pass">当前密码</label>
        <a-input-password id="old-pass" v-model:value="currentPassword" autocomplete="current-password" placeholder="输入当前密码" />
      </template>
      <label for="new-pass">新密码</label>
      <a-input-password id="new-pass" v-model:value="newPassword" autocomplete="new-password" placeholder="至少 12 个字符" />
      <label for="repeat-pass">再输一次新密码</label>
      <a-input-password id="repeat-pass" v-model:value="repeatPassword" autocomplete="new-password" placeholder="确认新密码" />
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert v-if="success" type="success" :message="success" show-icon />
      <a-button type="primary" html-type="submit" :loading="loading">
        {{ firstLogin ? '设置密码并开始使用' : '保存密码' }} <ArrowRightOutlined />
      </a-button>
    </form>
  </div>
</template>
