import { computed, onBeforeUnmount, ref } from 'vue'
import { codeButtonLabel, emailCodeFailure, type EmailCooldown } from '../domain/emailAccount'

/**
 * “获取验证码”按钮的状态：发送中、倒计时（按截止时间算，切到后台再回来也准）、失败提示。
 * send 负责拿安全校验和发请求；成功按 cooldownSeconds 倒计时，429 按 Retry-After 倒计时。
 */
export function useEmailCode(send: () => Promise<EmailCooldown>) {
  const sending = ref(false)
  const sent = ref(false)
  const waitSeconds = ref(0)
  const error = ref('')
  let deadline = 0
  let timer: ReturnType<typeof setInterval> | undefined

  function tick() {
    waitSeconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (!waitSeconds.value && timer) { clearInterval(timer); timer = undefined }
  }
  function countdown(seconds: number) {
    if (seconds <= 0) return
    deadline = Date.now() + seconds * 1000
    if (!timer) timer = setInterval(tick, 1000)
    tick()
  }
  /** 发出返回 true；正在发或还在倒计时时什么也不做。 */
  async function request(): Promise<boolean> {
    if (sending.value || waitSeconds.value > 0) return false
    sending.value = true; error.value = ''
    try {
      const result = await send()
      sent.value = true
      countdown(result.cooldownSeconds || 60)
      return true
    } catch (cause) {
      const failure = emailCodeFailure(cause)
      error.value = failure.message
      countdown(failure.waitSeconds)
      return false
    } finally { sending.value = false }
  }
  function reset() { sent.value = false; error.value = ''; waitSeconds.value = 0; deadline = 0; if (timer) { clearInterval(timer); timer = undefined } }
  onBeforeUnmount(() => { if (timer) clearInterval(timer) })
  const label = computed(() => codeButtonLabel({ sending: sending.value, waitSeconds: waitSeconds.value, sent: sent.value }))
  const disabled = computed(() => sending.value || waitSeconds.value > 0)
  return { sending, sent, waitSeconds, error, label, disabled, request, reset }
}
