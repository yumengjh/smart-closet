<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import AuthShell from '../components/AuthShell.vue'
import PasswordChecks from '../components/account/PasswordChecks.vue'
import EmailCodeInput from '../components/account/EmailCodeInput.vue'
import { closetApi } from '../services/api'
import { passwordProblem } from '../domain/account'
import { codeProblem, createEmailProofOfWork, emailApi, mailEnabled, sendWithProof, type PowProof } from '../services/emailAccount'
import { useEmailCode } from '../composables/useEmailCode'

/**
 * 找回密码（/forgot，server#296 设计 4.6 节）：两步。先填用户名或邮箱获取验证码，再填验证码和新密码。
 * 不论账号是否存在、是否绑定邮箱，取码的反馈都一样；改好后全部设备退出，回到登录页用新密码登录。
 * 邮件关闭时只提示联系管理员。
 */
const router = useRouter(); const { message } = App.useApp()
const available = ref<boolean>(); const loadError = ref('')
const step = ref(0); const login = ref(''); const code = ref(''); const password = ref(''); const repeat = ref('')
const busy = ref(false); const error = ref('')
const sentLogin = ref('')
const proof = createEmailProofOfWork()
const codeSender = useEmailCode(() => sendWithProof((p: PowProof) => emailApi.requestCode('RESET', login.value, p), proof))
onBeforeUnmount(() => proof.cancel())
// 这个账号刚取过码：第一步的按钮直接进下一步。
const alreadySent = computed(() => codeSender.sent.value && login.value.trim() === sentLogin.value)

async function load() {
  loadError.value = ''
  try {
    available.value = mailEnabled(await closetApi.registration())
    if (available.value) void proof.prepare().catch(() => { /* 点发送时再算 */ })
  } catch (cause) { loadError.value = cause instanceof Error ? cause.message : '暂时无法加载，请稍后重试。' }
}
onMounted(load)
// 换了账号就是另一份验证码，不用等上一个的倒计时（服务端仍按自己的限额来）。
watch(login, value => { if (codeSender.sent.value && value.trim() !== sentLogin.value) codeSender.reset() })

async function sendCode() {
  error.value = ''
  if (!login.value.trim()) { error.value = '请填写用户名或邮箱。'; return }
  if (alreadySent.value && step.value === 0) { step.value = 1; return }
  if (await codeSender.request()) { sentLogin.value = login.value.trim(); step.value = 1 }
}
async function submit() {
  if (busy.value) return
  if (step.value === 0) { await sendCode(); return }
  error.value = codeProblem(code.value) || passwordProblem(password.value) || (password.value !== repeat.value ? '两次输入的密码不一致。' : '')
  if (error.value) return
  busy.value = true
  try {
    await emailApi.resetPassword(login.value, code.value, password.value)
    password.value = ''; repeat.value = ''
    message.success('密码改好了，用新密码登录吧。')
    await router.replace({ path: '/login', state: { login: login.value.trim() } })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '没改成，请稍后再试。' }
  finally { busy.value = false }
}
function back() { error.value = ''; step.value = 0 }
</script>

<template>
  <AuthShell compact-art :eyebrow="available ? `第 ${step + 1} / 2 步` : '找回密码'" :title="available === false ? '暂时不能自己找回' : step === 0 ? '找回密码' : '设置新密码'"
    :intro="available === false ? '请联系管理员帮你重置密码。' : step === 0 ? '填用户名或绑定的邮箱，验证码会发到邮箱。' : '如果这个账号绑定了邮箱，验证码已发出，10 分钟内有效。'">
    <form v-if="available" class="auth-form" @submit.prevent="submit">
      <template v-if="step === 0">
        <label for="forgot-login">用户名或邮箱</label>
        <a-input id="forgot-login" v-model:value="login" size="large" :maxlength="254" autocomplete="username" placeholder="用户名或邮箱" autofocus />
        <a-alert v-if="codeSender.error.value" type="error" :message="codeSender.error.value" show-icon />
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <a-button type="primary" html-type="submit" size="large" block class="auth-submit" :loading="codeSender.sending.value" :disabled="codeSender.disabled.value && !codeSender.sending.value && !alreadySent">
          {{ alreadySent ? '下一步' : codeSender.label.value }}
        </a-button>
      </template>
      <template v-else>
        <label for="forgot-code">验证码</label>
        <EmailCodeInput id="forgot-code" v-model:value="code" :button-label="codeSender.label.value" :sending="codeSender.sending.value" :disabled="codeSender.disabled.value" @send="sendCode" />
        <a-alert v-if="codeSender.error.value" type="error" :message="codeSender.error.value" show-icon />
        <label for="forgot-password">新密码</label><a-input-password id="forgot-password" v-model:value="password" size="large" autocomplete="new-password" placeholder="至少 12 个字符" />
        <label for="forgot-repeat">确认新密码</label><a-input-password id="forgot-repeat" v-model:value="repeat" size="large" autocomplete="new-password" placeholder="再输一次新密码" />
        <PasswordChecks :password="password" :repeat="repeat" />
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <a-button type="primary" html-type="submit" size="large" block class="auth-submit" :loading="busy">确认修改</a-button>
        <a-button size="large" block :disabled="busy" @click="back">上一步</a-button>
      </template>
    </form>
    <template v-else>
      <a-alert v-if="loadError" type="error" :message="loadError" show-icon />
      <a-button v-if="loadError" block size="large" @click="load">重新加载</a-button>
      <a-skeleton v-else-if="available === undefined" active :paragraph="{ rows: 2 }" />
    </template>
    <template #footer>
      <span v-if="available">没绑定邮箱？请联系管理员。</span>
      <RouterLink to="/login">返回登录</RouterLink>
    </template>
  </AuthShell>
</template>
