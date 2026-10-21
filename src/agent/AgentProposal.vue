<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { useRouter, useRoute } from 'vue-router'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { useClosetStore } from '../stores/closet'
import { agentRequest, type Proposal } from './api'
import { canvasBridge, candidateScene, editedScene, pageContext } from './bridge'
import { playSound } from '../services/sound'
import { ExpandOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons-vue'
import RecommendationExplain from '../recommend/RecommendationExplain.vue'
import RecommendationFeedback from '../recommend/RecommendationFeedback.vue'
import { recommendApi } from '../recommend/api'
import GarmentChoiceCard from '../recommend/GarmentChoiceCard.vue'
import GarmentListCard from '../recommend/GarmentListCard.vue'
import RecommendationDetailModal from '../recommend/RecommendationDetailModal.vue'
import RecommendationGroup from '../recommend/RecommendationGroup.vue'
import RecommendIntentBar from '../recommend/RecommendIntentBar.vue'
import RecommendNotices from '../recommend/RecommendNotices.vue'
import type { IntentInput, RecommendationView, RecommendedOutfit } from '../recommend/types'
import type { OutfitScene } from '../domain/outfit'
const props = defineProps<{ proposal: Proposal }>()
const emit = defineEmits<{ applied: [] }>()
const { modal, message } = App.useApp()
const router = useRouter(); const route = useRoute(); const closet = useClosetStore()
const expanded = ref(false)
function openPreview() { expanded.value = true; playSound('rise') }
const scenes = ref<OutfitScene[]>([]); const error = ref(''); const busy = ref(false); const used = ref(props.proposal.consumed)
const current = computed(() => Boolean(canvasBridge.value && route.path.startsWith('/outfits/')))
const isOutfits = computed(() => props.proposal.kind === 'OUTFITS' || props.proposal.kind === 'RECOMMENDATION')
const isRecommendation = computed(() => props.proposal.kind === 'RECOMMENDATION')
// Server-written limits (e.g. paused garments) and user-only notes; shown as-is, never rephrased here.
const notices = computed(() => isRecommendation.value ? [...(props.proposal.payload.limits ?? []), ...(props.proposal.payload.notes ?? [])] : [])
const count = computed(() => props.proposal.payload.candidates?.length || 0)
const cardTitle = computed(() => isRecommendation.value ? `为你推荐了 ${count.value} 套搭配` : isOutfits.value ? '为你挑了三套搭配' : '画布修改预览')
const explained = ref<string[]>([])
function viewDetail(keys: string[] | string) {
  const list = Array.isArray(keys) ? keys : [keys]
  for (const key of list) if (!explained.value.includes(key)) {
    const logId = props.proposal.payload.candidates?.find(c => c.recommendation?.key === key)?.recommendation?.logId
    if (logId) recommendApi.signal({ kind: 'VIEW_DETAIL', logId })
  }
  explained.value = list
}
async function preview() {
  error.value = ''
  try {
    scenes.value = isOutfits.value ? await Promise.all(props.proposal.payload.candidates!.map(c => candidateScene(c))) : props.proposal.kind === 'EDIT' ? [await editedScene(props.proposal)] : []
  } catch (e) { error.value = e instanceof Error ? e.message : '预览无法加载。' }
}
onMounted(preview)
// Swap / explain on chat cards reuse the page's detail modal; editing the echoed intent re-runs with no model call.
const detailOpen = ref(false); const detailIndex = ref(0)
const recommended = ref<RecommendedOutfit[]>((props.proposal.payload.candidates || []).flatMap(c => c.recommendation ? [c.recommendation] : []))
function openDetail(index: number) { detailIndex.value = index; detailOpen.value = true }
function replaceOutfit(index: number, outfit: RecommendedOutfit) { recommended.value.splice(index, 1, outfit) }
const editing = ref(false); const rerunning = ref(false); const rerun = ref<RecommendationView | null>(null)
const editIntent = ref<IntentInput>({ ...(props.proposal.payload.intentInput || {}) })
async function recompute() {
  rerunning.value = true
  try { rerun.value = await recommendApi.recommend({ ...editIntent.value, temperatureC: editIntent.value.temperatureC ?? undefined }) }
  catch (e) { message.error(e instanceof Error ? e.message : '重新计算失败。') }
  finally { rerunning.value = false }
}
function confirmApply(index: number, intoCurrent: boolean) {
  modal.confirm({ title: props.proposal.kind === 'SAVE' ? '确认保存当前搭配？' : intoCurrent ? '确认将预览应用到当前画布？' : '新建一份独立搭配草稿？',
    content: props.proposal.kind === 'SAVE' ? '保存到账号后可在其他设备继续编辑，版本冲突时不会覆盖。' : '应用后仍是未保存草稿；保存到账号需要你再次确认。',
    okText: props.proposal.kind === 'SAVE' ? '确认保存' : '确认应用', cancelText: '取消',
    async onOk() {
      busy.value = true
      try {
        const proposal = props.proposal
        if (proposal.kind === 'SAVE' && !canvasBridge.value) throw new Error('请先打开生成建议时的组合台。')
        let scene = scenes.value[index]
        if (isOutfits.value && intoCurrent) scene = await candidateScene(proposal.payload.candidates![index], proposal.context.scene?.elements.filter(e => e.kind === 'PERSON_PART') || [])
        // All preview work succeeds before the one-time confirmation token is consumed.
        await agentRequest(`/proposals/${proposal.id}/accept`, 'POST', { context: pageContext(route.path), current: intoCurrent })
        used.value = true
        if (proposal.kind === 'SAVE') await canvasBridge.value!.save()
        else if (intoCurrent) canvasBridge.value!.apply(scene, isOutfits.value ? proposal.payload.candidates![index].name : undefined)
        else {
          const name = proposal.payload.candidates![index].name
          const key = `yixu.outfit-draft.v1:${closet.user!.username}:new:${proposal.id}`
          localStorage.setItem(key, JSON.stringify({ name, revision: null, scene, savedAt: Date.now() }))
          await router.push({ path: '/outfits/new', query: { draft: proposal.id } })
        }
        const logId = proposal.payload.candidates?.[index]?.recommendation?.logId
        if (logId) recommendApi.signal({ kind: 'OPEN_WORKSPACE', logId })
        expanded.value = false; playSound('success'); message.success(proposal.kind === 'SAVE' ? '保存请求已完成。' : '已应用为草稿，请检查后再保存。'); emit('applied')
      } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '应用失败。'); throw e }
      finally { busy.value = false }
    },
  })
}
</script>
<template>
  <section class="agent-proposal" aria-label="待确认操作">
    <GarmentChoiceCard v-if="proposal.kind === 'GARMENT_CHOICE'" :payload="proposal.payload" />
    <GarmentListCard v-else-if="proposal.kind === 'GARMENT_LIST'" :payload="proposal.payload" />
    <template v-else-if="proposal.kind !== 'SAVE'">
      <a-button class="agent-proposal-card" block @click="openPreview" :aria-label="isOutfits ? `查看${count}套推荐搭配` : '查看画布修改预览'">
        <div class="agent-proposal-minis"><OutfitThumbnail v-for="(scene, index) in scenes" :key="index" :scene="scene" :title="isOutfits ? proposal.payload.candidates![index].name : '修改后画布'" /><ExpandOutlined v-if="!scenes.length" /></div>
        <div class="agent-proposal-copy"><strong>{{ cardTitle }}</strong><small v-if="isRecommendation && proposal.payload.intent">{{ proposal.payload.intent }}</small><small>{{ used ? '已处理 · 点击查看' : isRecommendation ? '点开查看搭配和打分依据' : '点开大图，再选择怎么应用' }}</small></div><RightOutlined />
      </a-button>
      <a-modal v-model:open="expanded" :title="isOutfits ? '从你的衣柜，为你组合' : '确认画布修改'" :width="1100" :footer="null" wrap-class-name="agent-preview-modal">
        <p v-if="isRecommendation && proposal.payload.intent" class="recommend-intent">按“{{ proposal.payload.intent }}”推荐 · 分数与理由由系统按规则计算，可展开查看<a-button v-if="proposal.payload.intentInput" type="link" size="small" @click="editing = !editing">{{ editing ? '收起' : '理解错了？修改条件' }}</a-button></p>
        <div v-if="isRecommendation && editing" class="recommend-rerun"><RecommendIntentBar v-model="editIntent" :loading="rerunning" submit-label="按新条件重算" @submit="recompute" /><small class="muted">直接重新计算，不调用大模型。</small><RecommendationGroup v-if="rerun" :key="rerun.runId" :view="rerun" /></div>
        <RecommendNotices :items="notices" />
        <p class="agent-preview-intro">{{ used ? '这份建议已经处理，仍可查看预览。' : '先看看整体效果。应用后仍是草稿，保存时会再次请你确认。' }}</p>
        <a-alert v-if="error" type="warning" :message="error" show-icon /><a-button v-if="error" @click="preview">重新加载预览</a-button>
        <p v-if="isOutfits" class="agent-preview-mobile-hint">左右滑动，查看{{ count }}套搭配</p>
        <div v-if="isOutfits" class="agent-candidates-grid">
          <article v-for="(candidate, index) in proposal.payload.candidates" :key="index" class="agent-candidate">
            <div class="agent-candidate-number">0{{ index + 1 }}</div><OutfitThumbnail v-if="scenes[index]" :resolution="640" :scene="scenes[index]" :title="candidate.name" /><a-skeleton v-else active />
            <h3>{{ candidate.name }}<span v-if="candidate.recommendation" class="recommend-score" :aria-label="`总分 ${candidate.recommendation.score}`">{{ Math.round(candidate.recommendation.score) }}<small>分</small></span></h3>
            <template v-if="candidate.recommendation">
              <div v-if="candidate.recommendation.tags.length" class="recommend-tags"><a-tag v-for="tag in candidate.recommendation.tags" :key="tag" :color="tag === '新尝试' ? 'blue' : 'green'">{{ tag }}</a-tag></div>
              <ul class="recommend-highlights"><li v-for="h in candidate.recommendation.highlights" :key="h">{{ h }}</li></ul>
              <p v-if="candidate.reason && !candidate.recommendation.highlights.some(h => candidate.reason.includes(h))" class="recommend-model-reason">{{ candidate.reason }}</p>
              <ul v-if="candidate.recommendation.warnings.length" class="recommend-warnings"><li v-for="w in candidate.recommendation.warnings" :key="w"><WarningOutlined />{{ w }}</li></ul>
              <a-collapse ghost class="recommend-collapse" :active-key="explained" @change="viewDetail"><a-collapse-panel :key="candidate.recommendation.key" header="为什么这样搭"><RecommendationExplain :outfit="candidate.recommendation" /></a-collapse-panel></a-collapse>
              <RecommendationFeedback :log-id="candidate.recommendation.logId" :garments="candidate.recommendation.garments" />
              <a-button v-if="proposal.payload.runId" size="small" type="link" @click="openDetail(index)">换一件 · 为什么这样排</a-button>
            </template>
            <p v-else>{{ candidate.reason }}</p><div class="agent-candidate-actions"><a-button :disabled="used || !scenes[index] || busy" @click="confirmApply(index, false)">新建草稿</a-button><a-button v-if="current" type="primary" :disabled="used || !scenes[index] || busy" @click="confirmApply(index, true)">应用当前</a-button></div>
          </article>
        </div>
        <div v-else class="agent-edit-preview"><OutfitThumbnail v-if="scenes[0]" :resolution="640" :scene="scenes[0]" title="修改后画布" /><div><h3>调整后的效果</h3><p>{{ proposal.payload.summary }}</p><a-button type="primary" :disabled="used || !current || !scenes[0] || busy" @click="confirmApply(0, true)">确认应用修改</a-button><p v-if="!current" class="assistant-dialog-note">请先回到生成建议时的组合台。</p></div></div>
      </a-modal>
      <RecommendationDetailModal v-if="isRecommendation && proposal.payload.runId" v-model:open="detailOpen" v-model:index="detailIndex" :run-id="proposal.payload.runId" :outfits="recommended" :intent="proposal.payload.intent" @replace="replaceOutfit" />
    </template>
    <div v-else class="agent-save-card"><div><strong>准备保存这份搭配？</strong><small>{{ used ? '已处理' : '确认后保存到你的账号' }}</small></div><a-button size="small" type="primary" :disabled="used || !current || busy" @click="confirmApply(0, true)">确认保存</a-button></div>
  </section>
</template>
