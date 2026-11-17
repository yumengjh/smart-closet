<script setup lang="ts">
import { onMounted } from 'vue'
import { Result } from 'ant-design-vue'
import PageTitle from '../shell/PageTitle.vue'
import BillingSummary from '../billing/BillingSummary.vue'
import WalletSection from '../billing/WalletSection.vue'
import { useBillingStore } from '../billing/store'
const billing = useBillingStore()
onMounted(() => { void billing.refresh() })
</script>

<template>
  <div class="vip-page">
    <PageTitle title="会员与点数" />
    <a-alert v-if="billing.error" :message="billing.error" type="warning" show-icon><template #action><a-button :loading="billing.loading" @click="billing.refresh">重试</a-button></template></a-alert>
    <a-skeleton v-if="billing.loading && !billing.image" active />
    <template v-else-if="billing.image?.enabled">
      <header class="vip-intro"><h2>会员与点数</h2><p>查看余额、选择套餐和管理权益</p></header>
      <BillingSummary details-only />
      <WalletSection compare @redeemed="billing.refresh" />
    </template>
    <Result v-else-if="!billing.error" title="会员与点数暂未开放"><template #extra><a-button href="/settings?section=quota">查看今日次数</a-button></template></Result>
  </div>
</template>

<style scoped>
.vip-page { max-width: 960px; margin: 0 auto; padding: 8px 0 32px; }
.vip-intro { margin: 4px 0 24px; }
.vip-intro h2 { margin: 0; color: var(--ink); font-size: 26px; font-weight: 650; letter-spacing: -.02em; }
.vip-intro p { margin: 5px 0 0; color: var(--muted-copy); font-size: 14px; }
@media (max-width: 767px) { .vip-intro { margin-bottom: 18px; } .vip-intro h2 { font-size: 22px; } }
.vip-page > .ant-alert { margin-bottom: 16px; }
</style>
