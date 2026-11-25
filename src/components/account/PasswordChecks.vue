<script setup lang="ts">
// 设新密码时的三条检查（注册与找回密码共用），规则与服务端一致：至少 12 个字符、不超过 72 字节、两次一致。
import { computed } from 'vue'
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons-vue'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS, passwordBytes } from '../../domain/account'

const props = defineProps<{ password: string; repeat: string }>()
const checks = computed(() => [
  { ok: [...props.password].length >= PASSWORD_MIN_CHARS, text: '至少 12 个字符' },
  { ok: passwordBytes(props.password) <= PASSWORD_MAX_BYTES, text: `不超过 72 字节（已用 ${passwordBytes(props.password)}，汉字约 3 字节）` },
  { ok: props.password.length > 0 && props.password === props.repeat, text: '两次输入一致' },
])
</script>

<template>
  <ul class="password-checks"><li v-for="c in checks" :key="c.text" :class="{ ok: c.ok }"><CheckCircleFilled v-if="c.ok" /><MinusCircleOutlined v-else />{{ c.text }}</li></ul>
</template>

<style scoped>
.password-checks { display: grid; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; color: var(--muted-subtle); font-size: 13px; }
.password-checks li { display: flex; align-items: center; gap: 6px; }
.password-checks li.ok { color: var(--accent); }
</style>
