<script setup lang="ts">
import { onMounted } from 'vue'
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
      <BillingSummary details-only />
      <WalletSection compare @redeemed="billing.refresh" />
    </template>
    <a-result v-else-if="!billing.error" title="会员与点数暂未开放"><template #extra><a-button href="/settings?section=quota">查看今日次数</a-button></template></a-result>
  </div>
</template>

<style scoped>
.vip-page { max-width: 920px; margin: 0 auto; }
.vip-page > .ant-alert { margin-bottom: 16px; }
</style>
