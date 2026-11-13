<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useBillingStore } from './store'
import ShopSection from './ShopSection.vue'
import { refreshTryOnAccess } from '../tryon/access'

const billing = useBillingStore()
const query = window.matchMedia('(max-width: 767px)')
const narrow = ref(query.matches)
const changed = () => { narrow.value = query.matches }
const imageOnly = computed(() => billing.purchase === 'image')
onMounted(() => query.addEventListener('change', changed))
onUnmounted(() => query.removeEventListener('change', changed))
async function paid() {
  billing.purchase = ''
  await Promise.all([billing.refresh(), refreshTryOnAccess()])
}
</script>

<template>
  <a-drawer :open="!!billing.purchase" :title="imageOnly ? '今天的次数用完了' : '点数不够了'" :placement="narrow ? 'bottom' : 'right'" height="min(80dvh, 760px)" :width="480" :destroy-on-close="true" root-class-name="billing-purchase-drawer" @close="billing.purchase = ''">
    <p>{{ imageOnly ? '订阅可以提高每日图片次数，账号单独设置的上限优先。' : '可充值点数，或查看当前可用的订阅。' }}</p>
    <ShopSection :image-only="imageOnly" @paid="paid" />
    <p class="purchase-return">到账后返回原页面，再点一次开始。</p>
  </a-drawer>
</template>

<style scoped>
p { color: var(--muted-strong); }
.purchase-return { margin-top: 24px; font-size: 13px; }
</style>
