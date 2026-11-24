<script setup lang="ts">
// 6 位验证码输入框 + 右侧“获取验证码”按钮（注册、找回密码、绑定邮箱共用）。手机弹数字键盘，短信/邮件验证码可自动填入。
import { normalizeCode } from '../../domain/emailAccount'

defineProps<{ id: string; value: string; buttonLabel: string; sending: boolean; disabled: boolean; size?: 'large' | 'middle' }>()
const emit = defineEmits<{ 'update:value': [value: string]; send: [] }>()
</script>

<template>
  <div class="email-code-row">
    <a-input :id="id" :value="value" :size="size ?? 'large'" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码" @update:value="(v: string) => emit('update:value', normalizeCode(v ?? ''))" />
    <a-button :size="size ?? 'large'" :loading="sending" :disabled="disabled && !sending" class="email-code-send" @click="emit('send')">{{ buttonLabel }}</a-button>
  </div>
</template>

<style scoped>
.email-code-row { display: flex; gap: 8px; }
.email-code-row :deep(.ant-input) { flex: 1; min-width: 0; letter-spacing: .12em; }
.email-code-send { flex: none; min-width: 112px; }
</style>
