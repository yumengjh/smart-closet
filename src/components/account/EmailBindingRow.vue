<script setup lang="ts">
// “我的 → 账号与安全”里的邮箱一行（server#296 设计 4.6 节）：显示打码邮箱或“未绑定”，点开弹窗绑定、更换或解绑。
// 邮件关闭（/api/auth/me 没有 emailBound）或便携登录时整行不显示。邮箱与验证码不进埋点。
import { computed, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import EmailCodeInput from './EmailCodeInput.vue'
import { closetApi } from '../../services/api'
import { codeProblem, emailApi, emailProblem, emailStatus, type EmailStatus, type EmailView } from '../../services/emailAccount'
import { useEmailCode } from '../../composables/useEmailCode'
import { useClosetStore } from '../../stores/closet'

const closet = useClosetStore(); const { message } = App.useApp()
const status = ref<EmailStatus | null>(null)
const open = ref(false); const mode = ref<'bind' | 'unbind'>('bind')
const email = ref(''); const currentPassword = ref(''); const code = ref('')
const busy = ref(false); const error = ref('')
let sentEmail = ''
const codeSender = useEmailCode(() => emailApi.requestBindCode(email.value, currentPassword.value))

onMounted(async () => {
  if (closet.user?.portableLogin) return
  // 登录接口不带邮箱状态，这里单独读一次 /me。
  try { status.value = emailStatus(await closetApi.currentUser()) } catch { /* 读不到就不显示这一行 */ }
})
watch(email, value => { if (codeSender.sent.value && value.trim().toLowerCase() !== sentEmail) codeSender.reset() })

const title = computed(() => mode.value === 'unbind' ? '解绑邮箱' : status.value?.bound ? '更换邮箱' : '绑定邮箱')
function show(next: 'bind' | 'unbind' = 'bind') { mode.value = next; error.value = ''; open.value = true }
function clear() { email.value = ''; currentPassword.value = ''; code.value = ''; error.value = ''; mode.value = 'bind' }
function apply(view: EmailView) {
  status.value = emailStatus(view)
  if (closet.user) { closet.user.emailBound = view.emailBound; closet.user.emailMasked = view.emailMasked }
}

async function sendCode() {
  error.value = emailProblem(email.value) || (currentPassword.value ? '' : '请输入当前密码。')
  if (error.value) return
  if (await codeSender.request()) sentEmail = email.value.trim().toLowerCase()
}
async function confirm() {
  if (busy.value) return
  if (mode.value === 'unbind') { await unbind(); return }
  error.value = emailProblem(email.value) || codeProblem(code.value)
  if (error.value) return
  busy.value = true
  const wasBound = status.value?.bound
  try {
    apply(await emailApi.bind(email.value, code.value))
    message.success(wasBound ? '邮箱已更换。' : '邮箱已绑定。')
    open.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '没绑上，请稍后再试。' }
  finally { busy.value = false }
}
async function unbind() {
  error.value = currentPassword.value ? '' : '请输入当前密码。'
  if (error.value) return
  busy.value = true
  try {
    apply(await emailApi.unbind(currentPassword.value))
    message.success('邮箱已解绑。')
    open.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '没解绑成功，请稍后再试。' }
  finally { busy.value = false }
}
</script>

<template>
  <section v-if="status" class="settings-group">
    <div class="email-row">
      <span class="email-copy"><span class="email-label">邮箱</span><span class="email-value" :class="{ unbound: !status.bound }">{{ status.bound ? status.masked : '未绑定' }}</span></span>
      <a-button @click="show()">{{ status.bound ? '更换' : '绑定' }}</a-button>
    </div>
    <p v-if="!status.bound" class="email-hint">绑定后可以自己找回密码</p>
    <a-modal v-model:open="open" :title="title" :closable="!busy" :mask-closable="false" destroy-on-close @after-close="clear">
      <form v-if="mode === 'bind'" class="password-form" @submit.prevent="confirm">
        <label for="bind-email">{{ status.bound ? '新邮箱' : '邮箱' }}</label>
        <a-input id="bind-email" v-model:value="email" type="email" inputmode="email" :maxlength="254" autocomplete="email" placeholder="你常用的邮箱" />
        <label for="bind-password">当前密码</label>
        <a-input-password id="bind-password" v-model:value="currentPassword" autocomplete="current-password" placeholder="确认是你本人" />
        <label for="bind-code">验证码</label>
        <EmailCodeInput id="bind-code" v-model:value="code" size="middle" :button-label="codeSender.label.value" :sending="codeSender.sending.value" :disabled="codeSender.disabled.value" @send="sendCode" />
        <p v-if="codeSender.sent.value && !codeSender.error.value" class="email-hint">已发送，去邮箱看看，10 分钟内有效。</p>
        <a-alert v-if="codeSender.error.value" type="error" :message="codeSender.error.value" show-icon />
      </form>
      <form v-else class="password-form" @submit.prevent="confirm">
        <a-alert type="warning" message="解绑后不能再用邮箱找回密码，忘了密码只能找管理员。" show-icon />
        <label for="unbind-password">当前密码</label>
        <a-input-password id="unbind-password" v-model:value="currentPassword" autocomplete="current-password" placeholder="输入密码确认解绑" />
      </form>
      <a-alert v-if="error" type="error" :message="error" show-icon class="email-error" />
      <template #footer>
        <div class="email-footer">
          <a-button v-if="mode === 'bind' && status.bound" type="link" danger :disabled="busy" class="email-unbind" @click="mode = 'unbind'; error = ''">解绑邮箱</a-button>
          <a-button v-else-if="mode === 'unbind'" :disabled="busy" @click="mode = 'bind'; error = ''">返回</a-button>
          <span class="email-footer-main">
            <a-button :disabled="busy" @click="open = false">取消</a-button>
            <a-button type="primary" :danger="mode === 'unbind'" :loading="busy" @click="confirm">{{ mode === 'unbind' ? '解绑' : status.bound ? '更换' : '绑定' }}</a-button>
          </span>
        </div>
      </template>
    </a-modal>
  </section>
</template>

<style scoped>
.email-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.email-copy { display: flex; align-items: baseline; gap: var(--space-3); min-width: 0; }
.email-label { color: var(--ink); flex: none; }
.email-value { color: var(--muted-copy); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-value.unbound { color: var(--muted-subtle); }
.email-hint { margin: var(--space-2) 0 0; color: var(--muted-subtle); font-size: 13px; }
.email-error { margin-top: var(--space-3); }
.email-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.email-footer-main { display: inline-flex; gap: 8px; margin-left: auto; }
.email-unbind { padding-left: 0; }
</style>
