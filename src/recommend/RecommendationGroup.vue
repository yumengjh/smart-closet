<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import RecommendationCard from './RecommendationCard.vue'
import RecommendationDetailModal from './RecommendationDetailModal.vue'
import RecommendNotices from './RecommendNotices.vue'
import { recommendApi } from './api'
import { openInWorkspace } from './workspace'
import type { RecommendationView } from './types'

/** Cards + detail modal + 换一批 for one recommendation run; the same block is used on the page and in the assistant. */
const props = withDefaults(defineProps<{ view: RecommendationView; dense?: boolean }>(), { dense: false })
const emit = defineEmits<{ expired: [] }>()
const { message } = App.useApp()
const router = useRouter(); const closet = useClosetStore()
const outfits = ref([...props.view.outfits]); const hasMore = ref(props.view.hasMore)
const detailOpen = ref(false); const detailIndex = ref(0); const loadingMore = ref(false)
function openDetail(i: number) { detailIndex.value = i; detailOpen.value = true; playSound('rise') }
async function more() {
  loadingMore.value = true
  try {
    const next = await recommendApi.more(props.view.runId, 3)
    if (!next.outfits.length) { hasMore.value = false; message.info('没有更多不同的搭配了。'); return }
    outfits.value = next.outfits; hasMore.value = next.hasMore; playSound('tap')
  } catch (e) {
    const text = e instanceof Error ? e.message : '换一批失败。'
    message.warning(text); if (/过期|更新/.test(text)) emit('expired')
  } finally { loadingMore.value = false }
}
async function workspace(i: number) {
  try { await openInWorkspace(router, closet.user!.username, outfits.value[i], props.view.runId) }
  catch (e) { message.error(e instanceof Error ? e.message : '没能打开到搭台。') }
}
function replace(i: number, outfit: typeof outfits.value[number]) { outfits.value.splice(i, 1, outfit) }
</script>
<template>
  <div class="recommend-group" :class="{ 'is-dense': dense }">
    <a-empty v-if="!outfits.length" :description="view.emptyReason || '当前条件下没有可靠组合。'"><a-button @click="router.push('/add')">去添加衣物</a-button></a-empty>
    <div v-else class="recommend-cards" role="list">
      <RecommendationCard v-for="(o, i) in outfits" :key="o.key" role="listitem" :outfit="o" @open="openDetail(i)" @workspace="workspace(i)" />
    </div>
    <div v-if="outfits.length" class="recommend-group-footer"><small class="muted">按“{{ view.intent.description }}”计算 · 规则打分，不调用大模型</small><a-button size="small" :loading="loadingMore" :disabled="!hasMore" @click="more"><ReloadOutlined />换一批</a-button></div>
    <RecommendNotices :items="[...view.limits, ...view.notes]" />
    <RecommendationDetailModal v-model:open="detailOpen" v-model:index="detailIndex" :run-id="view.runId" :outfits="outfits" :intent="view.intent.description" @replace="replace" />
  </div>
</template>
