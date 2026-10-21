<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { CheckOutlined, LeftOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons-vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import type { OutfitScene } from '../domain/outfit'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import ExplainButton from './ExplainButton.vue'
import GarmentThumb from './GarmentThumb.vue'
import RecommendationExplain from './RecommendationExplain.vue'
import RecommendationFeedback from './RecommendationFeedback.vue'
import SwapPicker from './SwapPicker.vue'
import { recommendApi } from './api'
import { latestRequest } from './latest'
import { outfitScene } from './sceneCache'
import { openInWorkspace } from './workspace'
import { ROLE_LABELS, type RecommendedOutfit } from './types'

/** Large detail modal (design 8.3): browse the outfits left/right; swap a garment; open, wear or ask why. */
const props = defineProps<{ runId: string; outfits: RecommendedOutfit[]; intent?: string }>()
const open = defineModel<boolean>('open', { default: false })
const index = defineModel<number>('index', { default: 0 })
const emit = defineEmits<{ replace: [index: number, outfit: RecommendedOutfit] }>()
const { message } = App.useApp()
const router = useRouter(); const closet = useClosetStore()
const outfit = computed(() => props.outfits[Math.min(index.value, props.outfits.length - 1)])
const scene = ref<OutfitScene | null>(null); const sceneError = ref('')
const wearing = ref(false); const worn = ref<Set<string>>(new Set()); const opening = ref(false)
const viewed = new Set<string>()
const sceneLoads = latestRequest()
watch([open, outfit], async () => {
  if (!open.value || !outfit.value) return
  if (outfit.value.logId && !viewed.has(outfit.value.key)) { viewed.add(outfit.value.key); recommendApi.signal({ kind: 'VIEW_DETAIL', logId: outfit.value.logId }) }
  const ticket = sceneLoads.next()
  scene.value = null; sceneError.value = ''
  try { const next = await outfitScene(outfit.value); if (sceneLoads.isLatest(ticket)) scene.value = next }
  catch (e) { if (sceneLoads.isLatest(ticket)) sceneError.value = e instanceof Error ? e.message : '预览无法加载。' }
}, { immediate: true })
async function wear() {
  const { key, garments } = outfit.value
  wearing.value = true
  try { await recommendApi.wear({ garmentIds: garments.map(g => g.id) }); worn.value = new Set([...worn.value, key]); playSound('success'); message.success('已记下今天穿了这套，之后推荐会参考。') }
  catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没有记录成功。') }
  finally { wearing.value = false }
}
async function workspace() {
  opening.value = true
  try { await openInWorkspace(router, closet.user!.username, outfit.value, props.runId); open.value = false }
  catch (e) { message.error(e instanceof Error ? e.message : '没能打开到搭台。') }
  finally { opening.value = false }
}
function adopted(next: RecommendedOutfit) { emit('replace', index.value, next); message.success('已换好，整套重新打了分。') }
</script>
<template>
  <a-modal v-model:open="open" :title="intent ? `按“${intent}”推荐` : '推荐详情'" :width="1100" :footer="null" wrap-class-name="agent-preview-modal recommend-detail-modal">
    <div v-if="outfit" class="recommend-detail">
      <div class="recommend-detail-visual">
        <OutfitThumbnail v-if="scene" :scene="scene" :resolution="640" :title="outfit.name" /><a-alert v-else-if="sceneError" type="warning" show-icon :message="sceneError" /><a-skeleton-image v-else />
        <div v-if="outfits.length > 1" class="recommend-detail-pager">
          <a-button :disabled="index <= 0" aria-label="上一套" @click="index--"><LeftOutlined /></a-button><span>{{ index + 1 }} / {{ outfits.length }}</span><a-button :disabled="index >= outfits.length - 1" aria-label="下一套" @click="index++"><RightOutlined /></a-button>
        </div>
      </div>
      <div class="recommend-detail-info">
        <h3>{{ outfit.name }}<span class="recommend-score">{{ Math.round(outfit.score) }}<small>分</small></span><ExplainButton :key="outfit.key" :run-id="runId" :outfit-key="outfit.key" label="为什么排这里" /></h3>
        <div v-if="outfit.tags.length" class="recommend-tags"><a-tag v-for="tag in outfit.tags" :key="tag" :color="tag === '新尝试' ? 'blue' : tag.endsWith('没穿了') ? 'gold' : 'green'">{{ tag }}</a-tag></div>
        <ul class="recommend-highlights"><li v-for="h in outfit.highlights" :key="h">{{ h }}</li></ul>
        <ul v-if="outfit.warnings.length" class="recommend-warnings"><li v-for="w in outfit.warnings" :key="w"><WarningOutlined />{{ w }}</li></ul>
        <h4>单品</h4>
        <ul class="recommend-detail-garments">
          <li v-for="g in outfit.garments" :key="g.id">
            <GarmentThumb :garment-id="g.id" :display-url="g.displayUrl" :alt="g.name" />
            <div><strong>{{ g.name }}</strong><a-tag>{{ ROLE_LABELS[g.role] || g.role }}</a-tag><a-tag v-if="g.preset" title="预设衣物的示意图">预设</a-tag><small>{{ g.color }}</small><p v-if="g.reasons.length">{{ g.reasons.join(' · ') }}</p></div>
            <div class="recommend-detail-garment-actions"><SwapPicker :key="outfit.key + g.id" :run-id="runId" :outfit="outfit" :garment="g" @adopted="adopted" /><ExplainButton :key="'e' + outfit.key + g.id" :run-id="runId" :garment-id="g.id" /></div>
          </li>
        </ul>
        <a-collapse ghost class="recommend-collapse"><a-collapse-panel key="why" header="各项得分与依据"><RecommendationExplain :outfit="outfit" /></a-collapse-panel></a-collapse>
        <RecommendationFeedback :key="'f' + outfit.key" :log-id="outfit.logId" :garments="outfit.garments" />
        <div class="recommend-detail-actions">
          <a-button :loading="wearing" :disabled="worn.has(outfit.key)" @click="wear"><CheckOutlined />{{ worn.has(outfit.key) ? '已记录今天穿了' : '今天穿了这套' }}</a-button>
          <a-button type="primary" :loading="opening" @click="workspace">在搭台打开</a-button>
        </div>
      </div>
    </div>
  </a-modal>
</template>
