<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SkinOutlined } from '@ant-design/icons-vue'
import ExplainButton from './ExplainButton.vue'
import { lastRun, recommendApi } from './api'
import type { WearSummary } from './types'

/** Garment page: wear history, "用它搭一套" and "为什么没推荐它" (design 8.7, D33). All zero model calls. */
const props = defineProps<{ garmentId: string; hideAction?: boolean }>()
const router = useRouter()
const wear = ref<WearSummary | null>(null)
const runId = ref<string | null>(lastRun())
const preparing = ref(false)
onMounted(() => { recommendApi.wearSummary(props.garmentId).then(v => { wear.value = v }).catch(() => {}) })
/** Without an earlier run on this tab, compute today's default recommendation first so there is something to explain. */
async function prepare() {
  preparing.value = true
  try { runId.value = (await recommendApi.recommend({ occasion: 'DAILY', count: 3 })).runId } catch { runId.value = null }
  finally { preparing.value = false }
}
</script>
<template>
  <section class="garment-surface garment-recommend" aria-label="穿着记录与推荐">
    <div class="section-heading"><h2>穿着记录</h2><a-button v-if="!hideAction" type="primary" @click="router.push({ path: '/outfits', query: { with: garmentId } })"><SkinOutlined /> 用它搭一套</a-button></div>
    <p v-if="wear && wear.count" class="quiet-copy">上次穿着：{{ wear.lastWornOn }}（{{ wear.daysSince === 0 ? '今天' : `${wear.daysSince} 天前` }}）· 共穿过 {{ wear.count }} 次</p>
    <p v-else class="quiet-copy">还没有“今天穿了”的记录。在推荐详情或已保存搭配里点“今天穿了这套”即可记录。</p>
    <div class="garment-recommend-why">
      <ExplainButton v-if="runId" :key="runId" :run-id="runId" :garment-id="garmentId" label="为什么没推荐它" />
      <a-button v-else type="link" size="small" :loading="preparing" @click="prepare">为什么没推荐它（先按日常场景算一次）</a-button>
    </div>
  </section>
</template>
