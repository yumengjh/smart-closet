<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import AuthShell from '../components/AuthShell.vue'
import { closetApi, usingMocks, type RegistrationMode } from '../services/api'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS, passwordBytes, passwordProblem, usernameProblem } from '../domain/account'

/**
 * 注册分三步 (issue #82)：账号 → 密码 → 称呼。每步只校验本步，最后一步才提交；服务端拒绝时跳回出错的那一步。
 * 规则与服务端一致（用户名 2–80 位、密码至少 12 位），注册成功后进入问询页 /welcome。
 */
const route = useRoute(); const router = useRouter(); const closet = useClosetStore()
const mode = ref<RegistrationMode>(); const modeLoading = ref(false); const busy = ref(false); const error = ref('')
const username = ref(''); const displayName = ref(''); const password = ref(''); const repeat = ref('')
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '')
const step = ref(0)
const STEPS = ['账号', '密码', '称呼']
async function loadMode() {
  modeLoading.value = true; error.value = ''
  try { mode.value = (await closetApi.registration()).mode }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '注册信息暂时无法加载。' }
  finally { modeLoading.value = false }
}
onMounted(loadMode)
const checks = computed(() => [
  { ok: [...password.value].length >= PASSWORD_MIN_CHARS, text: '至少 12 个字符' },
  { ok: passwordBytes(password.value) <= PASSWORD_MAX_BYTES, text: `不超过 72 字节（已用 ${passwordBytes(password.value)}，汉字约 3 字节）` },
  { ok: password.value.length > 0 && password.value === repeat.value, text: '两次输入一致' },
])
function validate(at: number) {
  if (at === 0) {
    const nameProblem = usernameProblem(username.value)
    if (nameProblem) return nameProblem
    if (mode.value === 'INVITE' && !inviteCode.value.trim()) return '请输入邀请码。'
  }
  if (at === 1) {
    const problem = passwordProblem(password.value)
    if (problem) return problem
    if (password.value !== repeat.value) return '两次输入的密码不一致。'
  }
  if (at === 2 && (displayName.value.trim().length > 40 || /[\x00-\x1f\x7f]/.test(displayName.value))) return '昵称不能超过 40 个字符，也不能包含控制字符。'
  return ''
}
function next() { error.value = validate(step.value); if (!error.value) step.value++ }
function back() { error.value = ''; step.value = Math.max(0, step.value - 1) }
async function submit() {
  if (busy.value || !mode.value || mode.value === 'CLOSED') return
  if (step.value < 2) { next(); return }
  for (const at of [0, 1, 2]) { const problem = validate(at); if (problem) { error.value = problem; step.value = at; return } }
  busy.value = true; error.value = ''
  try {
    closet.user = await closetApi.register({ username: username.value, password: password.value, displayName: displayName.value.trim() || undefined, inviteCode: inviteCode.value.trim() || undefined })
    password.value = ''; repeat.value = ''
    // The new-user tour waits for this account (issue #87); GuideTour marks it done when shown.
    try { localStorage.setItem(`yuda.guide.v1:${closet.user.username}`, 'pending') } catch { /* private mode: no tour */ }
    await router.replace('/welcome')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '注册未能完成，请稍后重试。'
    // Send the user back to the field the server objected to.
    if (/用户名|账号|邀请/.test(error.value)) step.value = 0
    else if (/密码/.test(error.value)) step.value = 1
  } finally { busy.value = false }
}
const titles = ['创建你的账号', '设置一个密码', '我们怎么称呼你？']
const intros = ['用户名用来登录，注册后不能修改。', '只有你自己知道，之后可以在“我的”里修改。', '昵称会显示在衣柜里，可以先不填。']
</script>

<template>
  <AuthShell compact-art :eyebrow="mode === 'CLOSED' ? '注册' : `第 ${step + 1} / 3 步 · ${STEPS[step]}`" :title="mode === 'CLOSED' ? '暂未开放注册' : titles[step]" :intro="mode === 'CLOSED' ? '请使用已有账号登录，或联系管理员。' : intros[step]">
    <template #top><div v-if="mode !== 'CLOSED'" class="register-progress" aria-hidden="true"><span v-for="(_, i) in STEPS" :key="i" :class="{ done: i < step, current: i === step }"></span></div></template>
    <form v-if="mode !== 'CLOSED'" class="auth-form" @submit.prevent="submit">
      <template v-if="step === 0">
        <label for="register-username">用户名</label><a-input id="register-username" v-model:value="username" size="large" :maxlength="80" autocomplete="username" placeholder="2–80 位字母、数字或 _ . -" autofocus />
        <template v-if="mode !== 'OPEN' || inviteCode">
          <label for="register-invite">邀请码{{ mode === 'OPEN' ? '（可选）' : '' }}</label><a-input id="register-invite" v-model:value="inviteCode" size="large" autocomplete="off" placeholder="输入管理员提供的邀请码" />
        </template>
      </template>
      <template v-else-if="step === 1">
        <label for="register-password">密码</label><a-input-password id="register-password" v-model:value="password" size="large" autocomplete="new-password" placeholder="至少 12 个字符" autofocus />
        <label for="register-repeat">确认密码</label><a-input-password id="register-repeat" v-model:value="repeat" size="large" autocomplete="new-password" placeholder="再输一次密码" />
        <ul class="register-checks"><li v-for="c in checks" :key="c.text" :class="{ ok: c.ok }"><CheckCircleFilled v-if="c.ok" /><MinusCircleOutlined v-else />{{ c.text }}</li></ul>
      </template>
      <template v-else>
        <label for="register-name">昵称（可选）</label><a-input id="register-name" v-model:value="displayName" size="large" :maxlength="40" autocomplete="nickname" placeholder="希望我们如何称呼你" autofocus />
      </template>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-button type="primary" html-type="submit" size="large" block class="auth-submit" :disabled="!mode" :loading="busy || modeLoading">{{ step < 2 ? '下一步' : '注册并开始' }}</a-button>
      <a-button v-if="step > 0" size="large" block :disabled="busy" @click="back">上一步</a-button>
      <p v-if="usingMocks" class="auth-hint">界面演示：请使用演示管理员创建的邀请码，示例数据仅保存在当前浏览器。</p>
    </form>
    <a-alert v-else-if="error" type="error" :message="error" show-icon />
    <template #footer>
      <a-button v-if="!mode && !modeLoading" type="link" @click="loadMode">重新加载注册信息</a-button>
      <span>已有账号？</span><RouterLink to="/login">返回登录</RouterLink>
    </template>
  </AuthShell>
</template>

<style scoped>
.register-progress { display: flex; gap: 6px; margin-bottom: 20px; }
.register-progress span { flex: 1; height: 4px; border-radius: 4px; background: var(--line); transition: background .3s; }
.register-progress span.done, .register-progress span.current { background: var(--accent); }
.register-checks { display: grid; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; color: var(--muted-subtle); font-size: 13px; }
.register-checks li { display: flex; align-items: center; gap: 6px; }
.register-checks li.ok { color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .register-progress span { transition: none; } }
</style>
