<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { billingApi } from './api'
import { billingHidden, entitlementState, formatPoints, ledgerLabels, normalizeCode, redeemError, retryDeadline, secondsRemaining, sourceLabels, type Wallet } from './model'
import { createUuid } from '../domain/id'
import { accountTime } from '../domain/account'
import { ApiError } from '../domain/apiError'

const emit = defineEmits<{ redeemed: [] }>()
const wallet = ref<Wallet>(); const open = ref(false); const code = ref(''); const busy = ref(false)
const error = ref(''); const loadError = ref(''); const success = ref(''); const now = ref(Date.now()); const blockedUntil = ref(0)
const remaining = computed(() => secondsRemaining(blockedUntil.value, now.value))
const active = computed(() => wallet.value?.entitlements.filter(ent => entitlementState(ent, now.value) !== 'inactive') || [])
let timer: ReturnType<typeof setInterval> | undefined
let attempt: { code: string; key: string } | undefined
async function load() {
  loadError.value = ''
  try { wallet.value = await billingApi.wallet(); if (!wallet.value.enabled) close() }
  catch (cause) {
    if (billingHidden(cause)) { wallet.value = undefined; close() }
    else if (wallet.value?.enabled) loadError.value = '余额暂时无法刷新，请稍后重试。'
  }
}
function close() { open.value = false; code.value = ''; error.value = ''; attempt = undefined }
async function redeem() {
  if (busy.value || remaining.value || !wallet.value?.enabled) return
  const normalized = normalizeCode(code.value)
  if (!normalized) { error.value = '请输入兑换码。'; return }
  busy.value = true; error.value = ''; success.value = ''
  // A network failure has an unknown outcome. The next explicit retry of the same code reuses its key.
  if (!attempt || attempt.code !== normalized) attempt = { code: normalized, key: createUuid() }
  try {
    const result = await billingApi.redeem(normalized, attempt.key)
    success.value = `兑换成功，获得 ${formatPoints(result.points)}${result.entitlementEndsAtMs ? `，权益有效至 ${accountTime(result.entitlementEndsAtMs)}` : ''}。`
    wallet.value.balance = result.balance
    close(); emit('redeemed'); await load()
  } catch (cause) {
    error.value = redeemError(cause)
    if (cause instanceof ApiError) {
      attempt = undefined
      if (cause.status === 429) { now.value = Date.now(); blockedUntil.value = retryDeadline(cause.retryAfter, now.value) }
      if (billingHidden(cause)) { wallet.value = undefined; close() }
    }
  } finally { busy.value = false }
}
onMounted(() => { void load(); timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { clearInterval(timer); close() })
</script>

<template>
  <section v-if="wallet?.enabled" class="settings-group billing-wallet">
    <header class="settings-group-head settings-group-head-row">
      <div><h3>点数与权益</h3><p>余额 {{ formatPoints(wallet.balance) }}<template v-if="wallet.reserved > 0"> · {{ formatPoints(wallet.reserved) }}正在使用中</template></p></div>
      <a-space wrap><a-button :disabled="busy" @click="load">刷新余额</a-button><a-button type="primary" @click="open = true; error = ''">兑换码</a-button></a-space>
    </header>
    <a-alert v-if="success" :message="success" type="success" show-icon />
    <a-alert v-if="loadError" :message="loadError" type="warning" show-icon />
    <h4>有效权益</h4>
    <p v-if="!active.length" class="settings-hint">暂无有效权益，每日额度按当前账号设置执行。</p>
    <article v-for="ent in active" :key="ent.id" class="billing-row">
      <strong>{{ sourceLabels[ent.source] || '限时权益' }}</strong>
      <p><template v-if="ent.imageDailyLimit !== null">生图每日 {{ ent.imageDailyLimit }} 次 </template><template v-if="ent.agentDailyLimit !== null">助手每日 {{ ent.agentDailyLimit }} 次</template></p>
      <p>{{ accountTime(ent.endsAtMs) }} 到期 <a-tag v-if="entitlementState(ent, now) === 'expiring'" color="orange">将在 3 天内到期</a-tag></p>
    </article>
    <h4>最近流水</h4>
    <a-empty v-if="!wallet.recent.length" description="暂无点数流水" />
    <article v-for="entry in wallet.recent" :key="entry.id" class="billing-row">
      <div class="billing-entry"><strong>{{ ledgerLabels[entry.kind] || '点数变动' }}</strong><span>{{ formatPoints(entry.points, true) }}</span></div>
      <p>{{ accountTime(entry.createdAtMs) }}<template v-if="entry.note"> · {{ entry.note }}</template></p>
    </article>
    <a-modal wrap-class-name="billing-wallet-modal" v-model:open="open" title="兑换码" :ok-text="remaining ? `${remaining} 秒后重试` : '确认兑换'" cancel-text="取消" :confirm-loading="busy" :ok-button-props="{ disabled: !!remaining || !normalizeCode(code) }" :closable="!busy" :keyboard="!busy" :mask-closable="false" :cancel-button-props="{ disabled: busy }" @ok="redeem" @cancel="close" @after-close="code = ''">
      <a-form layout="vertical" @finish="redeem"><a-form-item label="兑换码" html-for="billing-code"><a-input id="billing-code" v-model:value="code" autocomplete="off" :maxlength="200" placeholder="YD1-…" :disabled="busy" @press-enter="redeem" @blur="code = normalizeCode(code)" /></a-form-item></a-form>
      <p class="settings-hint">可直接粘贴，空格、大小写和连字符不影响兑换。</p>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <p v-if="remaining" role="status">请稍后再试，{{ remaining }} 秒后可重新提交。</p>
    </a-modal>
  </section>
</template>
<style scoped>
h4 { margin: var(--space-5) 0 var(--space-3); }
.billing-row { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.billing-row p { margin: var(--space-2) 0 0; color: var(--muted-copy); }
.billing-entry { display: flex; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.billing-wallet :deep(.ant-btn) { min-height: 44px; }
:global(.billing-wallet-modal .ant-btn), :global(.billing-wallet-modal .ant-input) { min-height: 44px; }
</style>
