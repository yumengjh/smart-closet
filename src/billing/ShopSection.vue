<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { billingApi } from './api'
import { billingHidden, formatMinor, orderError, orderStatusLabels, productSummary, type CreatedOrder, type OrderView, type Product } from './model'
import { createUuid } from '../domain/id'
import { accountTime } from '../domain/account'

const emit = defineEmits<{ paid: [] }>()
const products = ref<Product[]>([]); const orders = ref<OrderView[]>([])
const chosen = ref<Product>(); const created = ref<CreatedOrder>()
const busy = ref(false); const error = ref(''); const success = ref('')
// One key per product while the confirm dialog is open: retrying after a network failure cannot create a second order.
let attempt: { productId: string; key: string } | undefined
async function load() {
  try { products.value = await billingApi.products(); orders.value = products.value.length ? await billingApi.orders() : [] }
  catch (cause) { if (billingHidden(cause)) products.value = [] }
}
function choose(product: Product) { chosen.value = product; created.value = undefined; error.value = ''; success.value = '' }
function close() { chosen.value = undefined; created.value = undefined; error.value = ''; attempt = undefined }
async function place() {
  if (busy.value || !chosen.value) return
  busy.value = true; error.value = ''
  if (!attempt || attempt.productId !== chosen.value.id) attempt = { productId: chosen.value.id, key: createUuid() }
  try { created.value = await billingApi.order(chosen.value.id, attempt.key) }
  catch (cause) { error.value = orderError(cause) }
  finally { busy.value = false }
}
async function pay() {
  if (busy.value || !created.value) return
  busy.value = true; error.value = ''
  try {
    const order = await billingApi.sandboxPay(created.value.order.id)
    if (order.status === 'FULFILLED') { success.value = `已到账：${order.productName}。`; close(); emit('paid'); await load() }
    else error.value = `订单状态：${orderStatusLabels[order.status] || order.status}。`
  } catch (cause) { error.value = orderError(cause) } finally { busy.value = false }
}
onMounted(load)
defineExpose({ load })
</script>

<template>
  <section v-if="products.length" class="billing-shop">
    <h4>购买</h4>
    <a-alert v-if="success" :message="success" type="success" show-icon />
    <article v-for="product in products" :key="product.id" class="shop-row">
      <div class="shop-info"><strong>{{ product.name }}</strong><p>{{ productSummary(product) }}</p></div>
      <a-space><span class="shop-price">{{ formatMinor(product.priceMinor, product.currency) }}</span><a-button type="primary" @click="choose(product)">购买</a-button></a-space>
    </article>
    <template v-if="orders.length">
      <h4>我的订单</h4>
      <article v-for="order in orders.slice(0, 5)" :key="order.id" class="shop-row">
        <div class="shop-info"><strong>{{ order.productName }}</strong><p>{{ accountTime(order.createdAtMs) }}</p></div>
        <a-space><span>{{ formatMinor(order.amountMinor, order.currency) }}</span><a-tag :color="order.status === 'FULFILLED' ? 'green' : order.status === 'CREATED' ? 'blue' : 'default'">{{ orderStatusLabels[order.status] || order.status }}</a-tag></a-space>
      </article>
    </template>
    <a-modal wrap-class-name="billing-shop-modal" :open="!!chosen" :title="created ? '完成支付' : '确认订单'" :ok-text="created ? '沙箱支付' : '提交订单'" cancel-text="取消" :confirm-loading="busy" :ok-button-props="{ disabled: !!created && !created.sandbox }" :closable="!busy" :keyboard="!busy" :mask-closable="false" :cancel-button-props="{ disabled: busy }" @ok="created ? pay() : place()" @cancel="close">
      <template v-if="chosen">
        <p><strong>{{ chosen.name }}</strong></p>
        <p>{{ productSummary(chosen) }}</p>
        <p>应付 {{ formatMinor(chosen.priceMinor, chosen.currency) }}，价格以服务器记录为准；订单 30 分钟内未支付会自动关闭。</p>
        <a-alert v-if="created?.sandbox" type="info" show-icon message="这是演示用的沙箱支付，不会产生真实扣款。" />
        <a-alert v-else-if="created" type="info" show-icon message="请在支付渠道完成付款，到账后会自动发放。" />
        <a-alert v-if="error" type="error" :message="error" show-icon />
      </template>
    </a-modal>
  </section>
</template>
<style scoped>
h4 { margin: var(--space-5) 0 var(--space-3); }
.shop-row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-3) 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.shop-info p { margin: var(--space-2) 0 0; color: var(--muted-copy); }
.shop-price { font-weight: 600; }
.billing-shop :deep(.ant-btn) { min-height: 44px; }
:global(.billing-shop-modal .ant-btn) { min-height: 44px; }
</style>
