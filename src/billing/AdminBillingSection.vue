<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { App, DatePicker as ADatePicker } from 'ant-design-vue'
import dateLocale from 'ant-design-vue/es/date-picker/locale/zh_CN'
import { billingApi } from './api'
import { billingHidden, formatPoints, formatPrice, priceToMicro, type Batch, type CodeView, type NewBatch } from './model'
import { accountTime, usernameProblem } from '../domain/account'
import { createUuid } from '../domain/id'
import { ApiError } from '../domain/apiError'

const emit = defineEmits<{ disabled: [] }>()
const { message, modal } = App.useApp()
const batches = ref<Batch[]>([]); const loading = ref(false); const error = ref('')
const createOpen = ref(false); const creating = ref(false); const createError = ref('')
const form = reactive({ name: '', points: 0, price: '0', currency: 'CNY', imageDailyLimit: null as number | null, agentDailyLimit: null as number | null, entitlementDays: null as number | null, quantity: 1, validFrom: '', validUntil: '' })
const clearCodes = ref<string[]>([]); const clearOpen = ref(false)
const codes = ref<CodeView[]>([]); const codesOpen = ref(false); const codesLoading = ref(false); const codesError = ref('')
const grantOpen = ref(false); const granting = ref(false); const grantError = ref(''); const grant = reactive({ username: '', points: 1, note: '' })
let grantAttempt: { payload: string; key: string } | undefined
let alive = true
const columns = [{ title: '批次', key: 'name', width: 170 }, { title: '内容', key: 'content', width: 210 }, { title: '可用 / 已兑', key: 'counts', width: 110 }, { title: '有效期', key: 'validity', width: 210 }, { title: '状态与操作', key: 'actions', width: 210 }]
const codeColumns = [{ title: '遮罩码', dataIndex: 'mask', width: 180 }, { title: '状态', key: 'status', width: 100 }, { title: '兑换用户', dataIndex: 'redeemedBy', width: 120 }, { title: '兑换时间', key: 'time', width: 180 }]
const codeLabels: Record<string, string> = { AVAILABLE: '可用', REDEEMED: '已兑换', DISABLED: '已停用' }
function failure(cause: unknown) { return cause instanceof Error ? cause.message : '操作未能完成，请稍后重试。' }
function checkHidden(cause: unknown) { if (billingHidden(cause)) { emit('disabled'); return true }; return false }
async function load() {
  loading.value = true; error.value = ''
  try {
    const state = await billingApi.state()
    if (!state.enabled) { emit('disabled'); return }
    batches.value = await billingApi.batches()
  } catch (cause) { if (!checkHidden(cause)) error.value = failure(cause) }
  finally { loading.value = false }
}
function openCreate() {
  Object.assign(form, { name: '', points: 0, price: '0', currency: 'CNY', imageDailyLimit: null, agentDailyLimit: null, entitlementDays: null, quantity: 1, validFrom: '', validUntil: '' })
  createError.value = ''; createOpen.value = true
}
async function create() {
  if (creating.value) return
  createError.value = ''
  let body: NewBatch
  try {
    const unitPriceMicro = priceToMicro(form.price)
    if (!form.name.trim()) throw new Error('请输入批次名称。')
    if (!Number.isInteger(form.points) || form.points < 0 || form.points > 10_000_000) throw new Error('点数需为 0 到 1000 万之间的整数。')
    if (!Number.isInteger(form.quantity) || form.quantity < 1 || form.quantity > 500) throw new Error('每批数量需在 1 到 500 之间。')
    const hasLimits = form.imageDailyLimit !== null || form.agentDailyLimit !== null
    if (hasLimits !== (form.entitlementDays !== null)) throw new Error('权益额度和天数需一起填写。')
    if (!form.points && !hasLimits) throw new Error('批次至少要包含点数或权益。')
    if (form.entitlementDays !== null && (!Number.isInteger(form.entitlementDays) || form.entitlementDays < 1 || form.entitlementDays > 3650)) throw new Error('权益天数需在 1 到 3650 之间。')
    for (const limit of [form.imageDailyLimit, form.agentDailyLimit]) if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new Error('每日额度需为非负整数。')
    const parseTime = (value: string) => { if (!value) return null; const ms = Date.parse(value); if (!Number.isFinite(ms)) throw new Error('请填写完整的有效期日期。'); return ms }
    body = { name: form.name.trim(), points: form.points, quantity: form.quantity, unitPriceMicro, currency: unitPriceMicro ? form.currency : null, imageDailyLimit: form.imageDailyLimit, agentDailyLimit: form.agentDailyLimit, entitlementDays: form.entitlementDays, validFromMs: parseTime(form.validFrom), validUntilMs: parseTime(form.validUntil) }
    if (body.validFromMs !== null && body.validUntilMs !== null && body.validUntilMs <= body.validFromMs) throw new Error('有效期结束必须晚于开始。')
  } catch (cause) { createError.value = failure(cause); return }
  creating.value = true
  try {
    const result = await billingApi.create(body)
    if (!alive) return
    clearCodes.value = result.codes; clearOpen.value = true; createOpen.value = false
    await load()
  } catch (cause) { if (!checkHidden(cause)) createError.value = failure(cause) }
  finally { creating.value = false }
}
function clearSecrets() { clearOpen.value = false; clearCodes.value = [] }
async function copyAll() {
  try { await navigator.clipboard.writeText(clearCodes.value.join('\n')); message.success('全部兑换码已复制。') }
  catch { message.error('复制失败，请选择兑换码手动复制或下载。') }
}
function download() {
  const url = URL.createObjectURL(new Blob([clearCodes.value.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = '鱼搭兑换码.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function showCodes(batch: Batch) {
  codes.value = []; codesError.value = ''; codesOpen.value = true; codesLoading.value = true
  try { codes.value = await billingApi.codes(batch.id) } catch (cause) { if (!checkHidden(cause)) codesError.value = failure(cause) }
  finally { codesLoading.value = false }
}
function disable(batch: Batch) {
  modal.confirm({ title: `停用批次“${batch.name}”？`, content: '未兑换的码将无法使用，已兑换的点数与权益不受影响。', okText: '停用批次', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
    try { await billingApi.disable(batch.id); message.success('批次已停用。'); await load() }
    catch (cause) { if (!checkHidden(cause)) message.error(failure(cause)); throw cause }
  } })
}
async function givePoints() {
  if (granting.value) return
  grantError.value = ''
  const problem = usernameProblem(grant.username.trim())
  if (problem) { grantError.value = problem; return }
  if (!Number.isSafeInteger(grant.points) || grant.points <= 0) { grantError.value = '赠送点数需为正整数。'; return }
  const payload = JSON.stringify({ ...grant, username: grant.username.trim() })
  if (!grantAttempt || grantAttempt.payload !== payload) grantAttempt = { payload, key: createUuid() }
  granting.value = true
  try { await billingApi.grant(grant.username.trim(), grant.points, grant.note, grantAttempt.key); grantAttempt = undefined; grantOpen.value = false; message.success('点数已赠送。') }
  catch (cause) { if (cause instanceof ApiError) grantAttempt = undefined; if (!checkHidden(cause)) grantError.value = failure(cause) }
  finally { granting.value = false }
}
onMounted(load)
onUnmounted(() => { alive = false; clearSecrets(); grantAttempt = undefined })
</script>

<template>
  <section class="settings-group admin-billing">
    <header class="settings-group-head settings-group-head-row"><div><h3>兑换码</h3><p>临时管理入口，收费开关请在后台管理平台调整。</p></div><a-space wrap><a-button :loading="loading" @click="load">刷新批次</a-button><a-button @click="grantOpen = true; grantError = ''">赠送点数</a-button><a-button type="primary" @click="openCreate">创建批次</a-button></a-space></header>
    <a-alert v-if="error" :message="error" type="error" show-icon />
    <a-table :columns="columns" :data-source="batches" row-key="id" :loading="loading" :scroll="{ x: 910 }" :pagination="{ pageSize: 10, showSizeChanger: false }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'"><strong>{{ record.name }}</strong><p>{{ record.batchNo }}</p></template>
        <template v-else-if="column.key === 'content'">{{ formatPoints(record.points) }} · {{ formatPrice(record.unitPriceMicro, record.currency) }}<p v-if="record.entitlementDays">权益 {{ record.entitlementDays }} 天 · 生图 {{ record.imageDailyLimit ?? '不调整' }} / 助手 {{ record.agentDailyLimit ?? '不调整' }}</p></template>
        <template v-else-if="column.key === 'counts'">{{ record.available }} / {{ record.redeemed }}</template>
        <template v-else-if="column.key === 'validity'">{{ record.validFromMs ? accountTime(record.validFromMs) : '即刻可用' }}<br />至 {{ record.validUntilMs ? accountTime(record.validUntilMs) : '长期有效' }}</template>
        <template v-else-if="column.key === 'actions'"><a-tag>{{ record.status === 'ACTIVE' ? '启用' : '已停用' }}</a-tag><a-space wrap><a-button @click="showCodes(record)">查看码状态</a-button><a-button danger :disabled="record.status !== 'ACTIVE'" @click="disable(record)">停用</a-button></a-space></template>
      </template>
    </a-table>
    <a-modal wrap-class-name="billing-modal" v-model:open="createOpen" title="创建兑换码批次" ok-text="创建批次" cancel-text="取消" :confirm-loading="creating" :mask-closable="false" :keyboard="!creating" :closable="!creating" :cancel-button-props="{ disabled: creating }" @ok="create">
      <a-form layout="vertical" :model="form" class="billing-form" @finish="create">
        <a-form-item label="批次名称" html-for="billing-name" required><a-input id="billing-name" v-model:value="form.name" :maxlength="120" /></a-form-item>
        <div class="billing-form-grid"><a-form-item label="每码点数（0 表示仅权益）" html-for="billing-points" required><a-input-number id="billing-points" v-model:value="form.points" :min="0" :max="10000000" :precision="0" /></a-form-item><a-form-item label="数量" html-for="billing-quantity" required><a-input-number id="billing-quantity" v-model:value="form.quantity" :min="1" :max="500" :precision="0" /></a-form-item></div>
        <div class="billing-form-grid"><a-form-item html-for="billing-price" :label="form.currency === 'CNY' ? '单价（元/点，0 表示赠送）' : '单价（所选币种/点）'"><a-input-number id="billing-price" v-model:value="form.price" string-mode :min="0" :precision="6" /></a-form-item><a-form-item label="币种" html-for="billing-currency"><a-select id="billing-currency" v-model:value="form.currency" :options="[{ value: 'CNY', label: '人民币 CNY' }, { value: 'USD', label: '美元 USD' }, { value: 'MYR', label: '马来西亚林吉特 MYR' }]" /></a-form-item></div>
        <a-divider>限时权益（可选，留空不调整）</a-divider>
        <div class="billing-form-grid"><a-form-item label="生图每日额度" html-for="billing-imageDailyLimit"><a-input-number id="billing-imageDailyLimit" v-model:value="form.imageDailyLimit" :min="0" :precision="0" /></a-form-item><a-form-item label="助手每日额度" html-for="billing-agentDailyLimit"><a-input-number id="billing-agentDailyLimit" v-model:value="form.agentDailyLimit" :min="0" :precision="0" /></a-form-item></div>
        <a-form-item label="权益天数" html-for="billing-entitlementDays"><a-input-number id="billing-entitlementDays" v-model:value="form.entitlementDays" :min="1" :max="3650" :precision="0" /></a-form-item>
        <a-form-item label="可兑换开始时间（本地时间，可选）" html-for="billing-validFrom"><a-date-picker id="billing-validFrom" v-model:value="form.validFrom" :locale="dateLocale" placeholder="选择日期与时间" show-time value-format="YYYY-MM-DDTHH:mm:ss" /></a-form-item>
        <a-form-item label="可兑换结束时间（本地时间，可选）" html-for="billing-validUntil"><a-date-picker id="billing-validUntil" v-model:value="form.validUntil" :locale="dateLocale" placeholder="选择日期与时间" show-time value-format="YYYY-MM-DDTHH:mm:ss" /></a-form-item>
      </a-form><a-alert v-if="createError" :message="createError" type="error" show-icon />
    </a-modal>
    <a-modal wrap-class-name="billing-modal" v-model:open="clearOpen" title="请立即保存全部兑换码" :mask-closable="false" :keyboard="false" :closable="false" @cancel="clearSecrets">
      <a-alert type="warning" message="明文兑换码仅展示这一次，关闭后无法再查看。请先复制或下载，并妥善保管。" show-icon />
      <a-textarea :value="clearCodes.join('\n')" readonly :rows="10" aria-label="全部明文兑换码" class="clear-codes" />
      <template #footer><a-space wrap><a-button @click="copyAll">复制全部</a-button><a-button @click="download">下载为 txt</a-button><a-button type="primary" @click="clearSecrets">已保存，关闭</a-button></a-space></template>
    </a-modal>
    <a-modal wrap-class-name="billing-modal" v-model:open="codesOpen" title="兑换码状态（仅遮罩）" :footer="null" width="min(720px, calc(100vw - 32px))">
      <a-alert v-if="codesError" :message="codesError" type="error" show-icon />
      <a-table :columns="codeColumns" :data-source="codes" :loading="codesLoading" row-key="id" :scroll="{ x: 580 }" :pagination="{ pageSize: 10, showSizeChanger: false }" size="small"><template #bodyCell="{ column, record }"><template v-if="column.key === 'status'">{{ codeLabels[record.status] || record.status }}</template><template v-else-if="column.key === 'time'">{{ accountTime(record.redeemedAtMs) }}</template></template></a-table>
    </a-modal>
    <a-modal wrap-class-name="billing-modal" v-model:open="grantOpen" title="赠送点数" ok-text="赠送点数" cancel-text="取消" :confirm-loading="granting" :mask-closable="false" :keyboard="!granting" :closable="!granting" :cancel-button-props="{ disabled: granting }" @ok="givePoints">
      <a-form layout="vertical" :model="grant" @finish="givePoints"><a-form-item label="用户名" html-for="billing-grant-username" required><a-input id="billing-grant-username" v-model:value="grant.username" :maxlength="80" /></a-form-item><a-form-item label="赠送点数" html-for="billing-grant-points" required><a-input-number id="billing-grant-points" v-model:value="grant.points" :min="1" :precision="0" /></a-form-item><a-form-item label="备注" html-for="billing-grant-note"><a-textarea id="billing-grant-note" v-model:value="grant.note" :maxlength="500" /></a-form-item></a-form><a-alert v-if="grantError" :message="grantError" type="error" show-icon />
    </a-modal>
  </section>
</template>
<style scoped>
.admin-billing { min-width: 0; }
.admin-billing :deep(.ant-btn) { min-height: 44px; }
.admin-billing :deep(td) { overflow-wrap: anywhere; }
.billing-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.billing-form :deep(.ant-input-number), .billing-form :deep(.ant-picker) { width: 100%; }
.clear-codes { margin-top: var(--space-4); font-family: monospace; }
@media (max-width: 480px) { .billing-form-grid { grid-template-columns: 1fr; gap: 0; } }
:global(.billing-modal .ant-btn), :global(.billing-modal .ant-input), :global(.billing-modal .ant-input-number-input), :global(.billing-modal .ant-select-selector), :global(.billing-modal .ant-picker) { min-height: 44px; }
</style>
