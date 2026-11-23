<script setup lang="ts">
// 意见反馈表单（server 设计 2026-11-23-用户反馈 9.1 节）：一屏写完。已登录默认附带账号；没登录或不附账号时可留联系方式。
// 没登录时一打开就在后台做安全校验（工作量证明），写完点发送时通常已经做完。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CheckCircleFilled } from '@ant-design/icons-vue'
import { ApiError } from '../domain/apiError'
import { track } from '../services/analytics'
import { countLinks, createProofOfWork, FEEDBACK_CATEGORIES, FEEDBACK_MIN, feedbackApi, feedbackError, feedbackLength, type FeedbackCategory, type FeedbackReceipt } from '../services/feedback'

const props = defineProps<{ signedIn: boolean; page?: string; maxLength: number }>()
const emit = defineEmits<{ sent: [receipt: FeedbackReceipt] }>()

const category = ref<FeedbackCategory>('PROBLEM')
const content = ref('')
const contact = ref('')
const attachAccount = ref(true)
const busy = ref(false)
const error = ref('')
const sent = ref<FeedbackReceipt | null>(null)

const withAccount = computed(() => props.signedIn && attachAccount.value)
const placeholder = computed(() => ({
  PROBLEM: '在哪个页面、点了什么、看到了什么提示？',
  IDEA: '想要什么功能？它能帮你做什么？',
  OTHER: '想对鱼搭说点什么？',
}[category.value]))
const length = computed(() => feedbackLength(content.value))
const tooShort = computed(() => length.value < FEEDBACK_MIN)
const tooManyLinks = computed(() => !withAccount.value && countLinks(content.value) > 1)

const proof = props.signedIn ? null : createProofOfWork()
onMounted(() => { if (proof) void proof.prepare().catch(() => { /* 点发送时再试一次 */ }) })
onBeforeUnmount(() => proof?.cancel())
watch(() => props.signedIn, signedIn => { if (!signedIn) attachAccount.value = false })

async function submit() {
  if (busy.value) return
  error.value = ''
  if (tooShort.value) { error.value = `多写几个字吧，至少 ${FEEDBACK_MIN} 个字。`; return }
  if (tooManyLinks.value) { error.value = '最多放一个链接。'; return }
  busy.value = true
  const draft = { category: category.value, content: content.value, contact: withAccount.value ? undefined : contact.value, page: props.page, attachAccount: withAccount.value }
  try {
    let receipt: FeedbackReceipt
    if (!proof) receipt = await feedbackApi.submit(draft)
    else {
      try { receipt = await feedbackApi.submit(draft, await proof.ready()) }
      catch (cause) {
        // 题目过期或已用过：换一道新题，自动再发一次。
        if (!(cause instanceof ApiError) || cause.code !== 'FEEDBACK_CHALLENGE_INVALID') throw cause
        receipt = await feedbackApi.submit(draft, await proof.prepare())
      }
    }
    sent.value = receipt
    if (props.signedIn) track('feedback_submit', { category: category.value.toLowerCase() as 'problem' | 'idea' | 'other', withAccount: withAccount.value })
    emit('sent', receipt)
  } catch (cause) {
    // 页面以为已登录、会话其实过期了：服务端会当成没登录、要求安全校验。
    error.value = !proof && cause instanceof ApiError && cause.code === 'FEEDBACK_CHALLENGE_INVALID' ? '登录已失效，刷新页面后再发送。' : feedbackError(cause)
    if (proof) void proof.prepare().catch(() => { /* 下次发送时再试 */ })
  } finally { busy.value = false }
}

function again() {
  sent.value = null; content.value = ''; contact.value = ''; error.value = ''
  if (proof) void proof.prepare().catch(() => { /* 点发送时再试一次 */ })
}
defineExpose({ again })
</script>

<template>
  <div v-if="sent" class="fb-done" role="status">
    <CheckCircleFilled class="fb-done-icon" />
    <strong>收到了，谢谢你</strong>
    <p v-if="sent.submitter === 'ACCOUNT'">处理后会在下面“我的反馈”里回复你，右上角的消息也会提醒。</p>
    <p v-else>这条没有附带账号，我们没法直接回复你。</p>
    <slot name="done" :again="again"><a-button @click="again">再写一条</a-button></slot>
  </div>
  <form v-else class="fb-form" @submit.prevent="submit">
    <a-segmented v-model:value="category" block :options="FEEDBACK_CATEGORIES" class="fb-kind" aria-label="反馈类型" />
    <a-textarea v-model:value="content" :placeholder="placeholder" :maxlength="maxLength" show-count :auto-size="{ minRows: 5, maxRows: 12 }" aria-label="反馈内容" />
    <div v-if="signedIn" class="fb-switch">
      <span><strong>附带我的账号</strong><small>{{ attachAccount ? '方便回复你' : '不会知道是谁，也没法回复你' }}</small></span>
      <a-switch v-model:checked="attachAccount" aria-label="附带我的账号" />
    </div>
    <a-input v-if="!withAccount" v-model:value="contact" :maxlength="100" placeholder="联系方式（选填），想要回音时留下" aria-label="联系方式" />
    <p class="fb-note">会一起发送所在页面、版本和设备类型，不含截图。</p>
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-button type="primary" html-type="submit" size="large" block :loading="busy" :disabled="!content.trim()">发送</a-button>
  </form>
</template>

<style scoped>
.fb-form { display: grid; gap: 12px; }
.fb-kind { padding: 3px; }
.fb-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 12px; background: var(--surface-alt); }
.fb-switch span { display: flex; flex-direction: column; min-width: 0; }
.fb-switch strong { font-size: 14px; font-weight: 550; }
.fb-switch small { color: var(--muted); font-size: 12px; }
.fb-note { margin: 0; color: var(--muted); font-size: 12px; }
.fb-done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 12px; text-align: center; }
.fb-done-icon { font-size: 40px; color: var(--success, #2f9e44); }
.fb-done strong { font-size: 17px; font-weight: 650; }
.fb-done p { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
</style>
