<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App, Empty } from 'ant-design-vue'
import { ReloadOutlined, UserOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../services/api'
import { mediaUrl } from '../services/urls'
import { platformRequest, PlatformRequestError, type RenderSubmission, type Baseline, type Capability, type RenderJob, type Review, type PoseCatalog, type PoseChoice } from '../services/platform'
import type { Outfit } from '../domain/outfit'
import { createUuid } from '../domain/id'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import ModelPicker from '../ootd/ModelPicker.vue'
import PosePicker from '../ootd/PosePicker.vue'
import ResultViewer from '../ootd/ResultViewer.vue'
import { modelLabel } from '../ootd/labels'
import { describeAdjustments } from '../ootd/body-adjust'
import { adviceFor, routeTarget } from '../ootd/jobStatus'
import { usePreferencesStore } from '../stores/preferences'
import { useProcessingStore } from '../stores/processing'
import { useSendOffStore } from '../stores/sendOff'

const route = useRoute(), router = useRouter(); const { message, modal } = App.useApp(); const preferences = usePreferencesStore(), processing = useProcessingStore(), sendOff = useSendOffStore()
const outfits = ref<Outfit[]>([]); const baselines = ref<Baseline[]>([]); const capabilities = ref<Capability[]>([]); const jobs = ref<RenderJob[]>([]); const poseCatalog = ref<PoseCatalog | null>(null)
const outfitId = ref(String(route.query.outfit || '')); const baselineId = ref(''); const model = ref(''); const selected = ref<string[]>([]); const pose = ref<PoseChoice>({ mode: 'AUTO' })
const multiLayer = ref(false); const wearRoles = ref<Record<string, string>>({}); const showItems = ref(false)
// 穿法细节 (issue #48): per garment, only where it applies (上衣：塞法、挽袖；外套：扣/敞、挽袖) plus a short note.
// Defaults come from the recommendation's proportion rule (POST /api/wear-details/suggestions); '' means 由模型自然处理.
const wearDetails = ref<Record<string, Record<string, string>>>({}); const wearNote = ref(''); const suggested = ref<Record<string, Record<string, string>>>({})
const DETAIL_OPTIONS: Record<string, { key: string; label: string; options: { value: string; label: string }[] }[]> = {
  TOP: [{ key: 'tuck', label: '塞法', options: [{ value: '', label: '自动' }, { value: 'NONE', label: '不塞' }, { value: 'FULL', label: '全塞' }, { value: 'FRONT', label: '只塞前面' }] },
    { key: 'sleeves', label: '袖子', options: [{ value: '', label: '自然' }, { value: 'ROLLED', label: '挽起' }] }],
  OUTER: [{ key: 'closure', label: '门襟', options: [{ value: '', label: '自动' }, { value: 'CLOSED', label: '扣上' }, { value: 'OPEN', label: '敞开' }] },
    { key: 'sleeves', label: '袖子', options: [{ value: '', label: '自然' }, { value: 'ROLLED', label: '挽起' }] }],
}
const detailGarments = computed(() => garments.value.filter(g => selected.value.includes(g.garmentId) && DETAIL_OPTIONS[g.role]))
function detail(id: string, key: string) { return wearDetails.value[id]?.[key] || '' }
function setDetail(id: string, key: string, value: string) { const next = { ...(wearDetails.value[id] || {}) }; if (value) next[key] = value; else delete next[key]; wearDetails.value = { ...wearDetails.value, [id]: next } }
function chosenDetails() { const out: Record<string, Record<string, string>> = {}; for (const id of selected.value) if (wearDetails.value[id] && Object.keys(wearDetails.value[id]).length) out[id] = wearDetails.value[id]; return out }
async function suggestDetails() {
  const ids = garments.value.map(g => g.garmentId); if (!ids.length) return
  try { const r = await platformRequest<{ details: Record<string, Record<string, string>> }>('/api/wear-details/suggestions', 'POST', { garmentIds: ids }); suggested.value = r.details; wearDetails.value = JSON.parse(JSON.stringify(r.details)) } catch { /* defaults are optional */ }
}
const loading = ref(true); const error = ref(''); const busy = ref(false); const review = ref<Review | null>(null)
type Preparation = { id: string; review: Review; expiresAt: number; quotaUnits: number; pose: { mode: string; name: string } | null }
const preparation = ref<Preparation | null>(null); const confirmOpen = ref(false); const key = ref(createUuid())
const viewing = ref<RenderJob | null>(null); let timer: ReturnType<typeof setInterval> | undefined
const accessoryOptions = [{ value: 'ACCESSORY:EAR', label: '耳部' }, { value: 'ACCESSORY:NECK', label: '颈部' }, { value: 'ACCESSORY:WRIST', label: '手腕' }, { value: 'ACCESSORY:HAND_LEFT', label: '左手' }, { value: 'ACCESSORY:HAND_RIGHT', label: '右手' }, { value: 'ACCESSORY:TIE', label: '领带' }]
const current = computed(() => outfits.value.find(o => o.id === outfitId.value)); const person = computed(() => baselines.value.find(b => b.id === baselineId.value))
const available = computed(() => capabilities.value.filter(c => c.verified && c.purpose === 'OOTD'))
const capability = computed(() => available.value.find(c => c.provider + ':' + c.model === model.value))
const filledSlots = computed(() => review.value?.slots.filter(slot => slot.items.length || slot.state === 'CONFLICT' || slot.state === 'UNKNOWN') || [])
const garments = computed(() => [...new Map((current.value?.scene.elements || []).filter(e => e.kind !== 'PERSON_PART').map(e => [e.garmentId, e])).values()])
const hint = computed(() => !current.value ? '先选一套已保存的搭配' : !person.value ? '先选一位模特' : !capability.value ? '暂无可用的生成模型' : '')
const viewingJob = computed(() => viewing.value && (jobs.value.find(j => j.id === viewing.value!.id) || viewing.value))

async function load() {
  try {
    const [o, b, c, j, p] = await Promise.all([closetApi.outfits(), platformRequest<Baseline[]>('/api/me/person-baselines'), platformRequest<Capability[]>('/api/render-capabilities'), platformRequest<RenderJob[]>('/api/ootd/jobs'), platformRequest<PoseCatalog>('/api/ootd/poses')])
    outfits.value = o; baselines.value = b.filter(p => p.status === 'CONFIRMED'); capabilities.value = c; jobs.value = j; poseCatalog.value = p
    if (!available.value.some(c => c.provider + ':' + c.model === model.value)) model.value = available.value[0] ? available.value[0].provider + ':' + available.value[0].model : ''
    if (!baselines.value.some(m => m.id === baselineId.value)) baselineId.value = baselines.value.find(p => p.currentDefault)?.id || baselines.value[0]?.id || ''
    error.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { loading.value = false }
}
async function loadPoses() { try { poseCatalog.value = await platformRequest<PoseCatalog>('/api/ootd/poses') } catch { /* The picker keeps the last list. */ } }
async function refresh() { if (document.hidden) return; try { jobs.value = await platformRequest('/api/ootd/jobs') } catch { /* Next poll retries. */ } }
watch(current, () => { selected.value = garments.value.map(g => g.garmentId); review.value = null; wearRoles.value = {}; wearDetails.value = {}; suggested.value = {}; wearNote.value = ''; void suggestDetails() })
watch([selected, multiLayer, wearRoles, wearDetails, wearNote, model, baselineId, pose], () => { preparation.value = null; confirmOpen.value = false }, { deep: true })

function body(useOlderBaseline: boolean) {
  return { outfitId: current.value!.id, revision: current.value!.revision, baselineId: person.value!.id, baselineRevision: person.value!.revision, selectedGarmentIds: selected.value, multiLayer: multiLayer.value, wearRoles: wearRoles.value, provider: capability.value!.provider, model: capability.value!.model, useOlderBaseline, pose: pose.value, wearDetails: chosenDetails(), note: wearNote.value.trim() || undefined }
}
async function check(nested = false) {
  if (!current.value) return
  busy.value = true; review.value = null
  try { review.value = await platformRequest<Review>('/api/outfit-reviews', 'POST', { outfitId: current.value.id, revision: current.value.revision, selectedGarmentIds: selected.value, multiLayer: multiLayer.value, wearRoles: wearRoles.value }); error.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { if (!nested) busy.value = false }
}
async function prepare(useOlderBaseline = false) {
  if (!current.value || !person.value || !capability.value) return
  busy.value = true
  try {
    await check(true)
    if (!review.value || review.value.blockers.length) return
    preparation.value = await platformRequest<Preparation>('/api/ootd/preparations', 'POST', body(useOlderBaseline)); key.value = createUuid(); confirmOpen.value = true
  } catch (e) {
    if (e instanceof PlatformRequestError && e.code === 'BASELINE_PROFILE_STALE') {
      modal.confirm({ title: '这位模特是按旧资料生成的', content: '个人资料改过之后，模特不会自动更新。仍用这位模特生成吗？', okText: '仍然使用', cancelText: '换一位', onOk: () => prepare(true) })
    } else error.value = e instanceof Error ? e.message : String(e)
  } finally { busy.value = false }
}
// Instead of a spinner on this page, the outfit is handed off with a short ritual and tracked in the processing centre.
function handOff(job: RenderJob) {
  const prepared = preparation.value, chosen = garments.value.filter(g => selected.value.includes(g.garmentId))
  const poseId = pose.value.mode === 'AUTO' ? '' : pose.value.id
  const poseCard = [...(poseCatalog.value?.presets || []), ...(poseCatalog.value?.mine || [])].find(p => p.id === poseId) || null
  sendOff.launch({ title: [`${chosen.length} 件衣物`, prepared?.pose?.name || '自动动作'].join(' · '), cards: chosen.map(g => ({ image: g.assetUrl, label: g.garmentLabel })), person: person.value?.mediaUrl || undefined, pose: poseCard })
  processing.trackRender(job, true)
}
// Plays the whole hand-off (cards, dressing, fly-in, finished notice) without calling any model.
function rehearse() {
  const chosen = garments.value.filter(g => selected.value.includes(g.garmentId))
  const poseId = pose.value.mode === 'AUTO' ? '' : pose.value.id
  const poseCard = [...(poseCatalog.value?.presets || []), ...(poseCatalog.value?.mine || [])].find(p => p.id === poseId) || poseCatalog.value?.presets[0] || null
  const cards = chosen.length ? chosen.map(g => ({ image: g.assetUrl, label: g.garmentLabel })) : ['上衣', '下装', '鞋子'].map(label => ({ label }))
  sendOff.launch({ title: `模拟演示 · ${cards.length} 件衣物 · ${poseCard?.name || '自动动作'}`, cards, person: person.value?.mediaUrl || undefined, pose: poseCard })
  processing.simulateRender(jobs.value.find(j => j.mediaUrl)?.mediaUrl || person.value?.mediaUrl || undefined)
}
async function accepted(job: RenderJob) { handOff(job); confirmOpen.value = false; preparation.value = null; error.value = ''; await refresh() }
async function generate() {
  if (!preparation.value || busy.value) return
  busy.value = true; error.value = ''
  try { await accepted(await platformRequest<RenderJob>('/api/ootd/jobs', 'POST', { preparationId: preparation.value.id }, key.value)) }
  catch (e) {
    if (e instanceof PlatformRequestError && e.uncertain) {
      try {
        const original = await platformRequest<RenderSubmission>(`/api/me/image-render-submissions/${encodeURIComponent(key.value)}`, 'GET', undefined, undefined, { timeoutMs: 10000 })
        if (original.found && original.job) { await accepted(original.job); return }
        error.value = '暂未查到这次任务。再点一次会复用原提交编号，不会重复生成。'
      } catch { error.value = '连接仍未恢复，暂时无法确认是否已提交。请先看看下方生成记录，不要关闭这个窗口重新准备。' }
    } else error.value = e instanceof Error ? e.message : String(e)
  } finally { busy.value = false }
}
async function cancel(job: RenderJob) { try { await platformRequest(`/api/ootd/jobs/${job.id}/cancel`, 'POST', {}); await refresh(); message.info('已请求停止；无法保证上游停止或退还额度。') } catch (e) { message.error(String(e)) } }
function remove(job: RenderJob) {
  modal.confirm({ title: '永久删除这张图？', content: '删除后无法恢复；搭配、模特和其他图片不受影响。', okText: '删除', okType: 'danger', cancelText: '取消', async onOk() { await platformRequest(`/api/ootd/jobs/${job.id}`, 'DELETE'); viewing.value = null; await refresh() } })
}
async function adjusted(job: RenderJob) {
  const source = viewingJob.value
  sendOff.launch({ title: `身材调整 · ${describeAdjustments(job.summary?.adjustments)}（原图保留）`, cards: source?.mediaUrl ? [{ image: source.mediaUrl, label: '原图' }] : [] })
  processing.trackRender(job, true); viewing.value = null; jobs.value = [job, ...jobs.value.filter(j => j.id !== job.id)]; await refresh() }
// Arriving from the processing centre opens that picture directly.
// Opened once, then the query is dropped so the 5-second list refresh never reopens a closed viewer.
// A job without a picture (interrupted, failed, still running) opens its status instead of doing nothing.
function openFromRoute() {
  const target = routeTarget(String(route.query.job || ''), jobs.value, !loading.value)
  if (target.action === 'wait') return
  if (target.action === 'view') viewing.value = target.job!
  else if (target.action === 'status') statusId.value = target.job!.id
  else message.info('这条生成记录已经不存在，可能已被删除。')
  const { job: _job, ...query } = route.query
  void router.replace({ query })
}
watch([() => route.query.job, jobs, loading], openFromRoute)
const statusId = ref('')
const statusJob = computed(() => jobs.value.find(j => j.id === statusId.value) || null)
const advice = computed(() => statusJob.value ? adviceFor(statusJob.value) : null)
const retryKeys = new Map<string, string>(); const retrying = ref('')
function openJob(job: RenderJob) { if (job.mediaUrl) viewing.value = job; else statusId.value = job.id }
function retry(job: RenderJob) {
  modal.confirm({
    title: '重新生成这张图？', okText: '重新生成（1 个额度）', cancelText: '先不了',
    content: job.status === 'UNKNOWN' ? '上一次请求可能已经在服务商那边出图并扣了额度，重新生成会再用 1 个图像额度。' : '会按原来的搭配、模特和动作再生成一张，再用 1 个图像额度。',
    async onOk() {
      // One key per job until it is accepted, so a double click or a retried request never submits twice.
      const retryKey = retryKeys.get(job.id) || createUuid(); retryKeys.set(job.id, retryKey); retrying.value = job.id
      try { const created = await platformRequest<RenderJob>(`/api/ootd/jobs/${job.id}/retry`, 'POST', {}, retryKey); retryKeys.delete(job.id); statusId.value = ''; await accepted(created) }
      catch (e) { message.error(e instanceof Error ? e.message : String(e)); throw e }
      finally { retrying.value = '' }
    },
  })
}
onMounted(() => { void load(); timer = setInterval(refresh, 5000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="page-heading simple-heading ootd-heading">
    <div><h1>OOTD 试穿</h1><p class="page-subtitle">选搭配、模特和动作，生成一张上身效果图。</p></div>
    <RouterLink v-slot="{ href, navigate }" to="/settings?section=personal" custom><a-button class="ootd-manage" :href="href" @click="navigate"><UserOutlined /> 管理模特</a-button></RouterLink>
  </div>
  <a-alert v-if="error && !confirmOpen" type="error" :message="error" show-icon closable style="margin-bottom:16px" @close="error=''" />
  <div v-if="loading" class="ootd-card"><a-skeleton active /></div>
  <div v-else class="ootd-workspace">
    <div class="ootd-steps">
      <section class="ootd-card">
        <header class="ootd-card-head"><span class="ootd-step">1</span><h2>搭配</h2></header>
        <a-select :value="outfitId || undefined" class="ootd-full" aria-label="已保存搭配" :options="outfits.map(o => ({ value: o.id, label: o.name }))" placeholder="选择组合台里保存的搭配" @update:value="outfitId = $event" />
        <template v-if="current">
          <a-button type="link" class="ootd-items-toggle" @click="showItems = !showItems">{{ showItems ? '收起' : '调整本次穿哪些' }}（{{ selected.length }}/{{ garments.length }} 件）</a-button>
          <div v-if="showItems" class="ootd-items">
            <a-checkbox-group v-model:value="selected" class="ootd-selections"><a-checkbox v-for="g in garments" :key="g.garmentId" :value="g.garmentId">{{ g.garmentLabel }}</a-checkbox></a-checkbox-group>
            <a-checkbox v-model:checked="multiLayer">多层穿法（打底 + 主体 + 外搭）</a-checkbox>
            <div v-if="multiLayer" class="ootd-wear-roles"><div v-for="g in garments.filter(g => selected.includes(g.garmentId))" :key="g.garmentId"><span>{{ g.garmentLabel }}</span><a-select v-model:value="wearRoles[g.garmentId]" allow-clear :options="[{ value: 'INNER', label: '打底内层' }]" placeholder="按品类判断" /></div></div>
            <div class="ootd-wear-details">
              <p class="ootd-note">穿法细节（可选）：只影响生成，不改搭配和推荐。</p>
              <div v-for="g in detailGarments" :key="g.garmentId" class="ootd-detail-row">
                <span>{{ g.garmentLabel }}<a-tag v-if="suggested[g.garmentId]" color="green">按搭配规则建议</a-tag></span>
                <a-select v-for="d in DETAIL_OPTIONS[g.role]" :key="d.key" size="small" class="ootd-detail-select" :aria-label="`${g.garmentLabel}${d.label}`" :value="detail(g.garmentId, d.key)" :options="d.options.map(o => ({ value: o.value, label: `${d.label}：${o.label}` }))" @update:value="(v: string) => setDetail(g.garmentId, d.key, v)" />
              </div>
              <a-textarea v-model:value="wearNote" :maxlength="200" show-count :auto-size="{ minRows: 1, maxRows: 3 }" placeholder="补充说明，例如：衬衫领口解开一颗扣子" aria-label="穿法补充说明" />
            </div>
          </div>
        </template>
      </section>

      <section class="ootd-card">
        <header class="ootd-card-head"><span class="ootd-step">2</span><h2>模特</h2></header>
        <ModelPicker v-if="baselines.length" v-model="baselineId" :models="baselines" />
        <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="还没有模特"><RouterLink to="/settings?section=personal"><a-button type="primary">去生成模特</a-button></RouterLink></a-empty>
      </section>

      <section class="ootd-card">
        <header class="ootd-card-head"><span class="ootd-step">3</span><h2>动作</h2></header>
        <PosePicker v-model="pose" :catalog="poseCatalog" :compact="preferences.minimal" @changed="loadPoses" />
      </section>

      <div class="ootd-actions">
        <a-select v-if="available.length > 1" v-model:value="model" class="ootd-model" aria-label="生成模型" :options="available.map(c => ({ value: c.provider + ':' + c.model, label: c.model }))" />
        <p v-else class="ootd-note">{{ hint || (capability ? '每张用 1 个图像额度' : '') }}</p>
        <a-space wrap>
          <a-button v-if="!preferences.minimal" :loading="busy" :disabled="!current" @click="check()">只检查搭配</a-button>
          <a-tooltip title="只播放生成过程的动画和完成提醒，不调用模型、不消耗额度"><a-button @click="rehearse()">模拟生成</a-button></a-tooltip>
          <a-button type="primary" :loading="busy" :disabled="!current || !person || !capability" @click="prepare()">生成 OOTD</a-button>
        </a-space>
      </div>
    </div>

    <aside class="ootd-card ootd-preview" :class="{ empty: !current }">
      <header class="ootd-card-head"><h2>{{ current ? current.name : '预览' }}</h2></header>
      <OutfitThumbnail v-if="current" :scene="current.scene" :title="current.name" :resolution="720" />
      <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="选择搭配后在这里预览" />
      <template v-if="review">
        <a-alert v-for="issue in review.blockers" :key="issue.message" type="error" :message="issue.message" :description="issue.action" show-icon style="margin-top:12px" />
        <a-alert v-for="issue in review.warnings" :key="issue.code" type="warning" :message="issue.message" show-icon style="margin-top:8px" />
        <a-descriptions v-if="!preferences.minimal || review.blockers.length" :column="1" size="small" bordered style="margin-top:12px"><a-descriptions-item v-for="slot in filledSlots" :key="slot.role" :label="slot.label">{{ slot.items.map(i => i.label).join('、') || '未选择' }} <div v-for="i in slot.items.filter(i => i.role === 'ACCESSORY')" :key="i.garmentId" class="ootd-accessory"><span>{{ i.label }}</span> <a-select v-model:value="wearRoles[i.garmentId]" :options="accessoryOptions" placeholder="选择佩戴位置" /></div> <a-tag v-if="slot.state === 'CONFLICT' || slot.state === 'UNKNOWN'" color="error">{{ slot.state === 'UNKNOWN' ? '资料未确认' : '冲突' }}</a-tag></a-descriptions-item></a-descriptions>
      </template>
    </aside>
  </div>

  <section class="ootd-records">
    <header class="ootd-records-head"><h2>我的 OOTD <small v-if="jobs.length">{{ jobs.length }}</small></h2><a-button type="text" aria-label="刷新" @click="refresh"><ReloadOutlined /></a-button></header>
    <div v-if="!jobs.length" class="ootd-card"><a-empty description="生成的图片会保存在这里" /></div>
    <div v-else class="ootd-results">
      <article v-for="job in jobs" :key="job.id" class="ootd-result">
        <button type="button" class="ootd-result-media" :class="{ pending: !job.mediaUrl }" :aria-label="job.mediaUrl ? '查看大图' : `${adviceFor(job).label}，查看详情`" @click="openJob(job)">
          <img v-if="job.mediaUrl" :src="mediaUrl(job.mediaUrl)" alt="OOTD 生成结果" loading="lazy" />
          <span v-else class="ootd-result-state" :class="[adviceFor(job).tone, { busy: adviceFor(job).tone === 'running' }]">{{ adviceFor(job).label }}<small v-if="adviceFor(job).canRetry">点开查看</small></span>
          <span v-if="job.summary?.kind === 'ADJUST'" class="ootd-result-flag">身材调整</span>
        </button>
        <div class="ootd-result-body">
          <p class="ootd-result-title">{{ job.summary?.kind === 'ADJUST' ? describeAdjustments(job.summary.adjustments) : [job.summary?.model, job.summary?.pose].filter(Boolean).join(' · ') || new Date(job.createdAt).toLocaleDateString() }}</p>
          <p v-if="job.error" class="ootd-result-error">{{ job.error }}</p>
          <div v-if="!job.mediaUrl" class="ootd-result-actions">
            <a-button v-if="adviceFor(job).canCancel" size="small" @click="cancel(job)">取消</a-button>
            <a-button v-if="adviceFor(job).canRetry" size="small" type="primary" :loading="retrying === job.id" @click="retry(job)">重新生成</a-button>
            <a-button v-if="adviceFor(job).canDelete" size="small" danger @click="remove(job)">删除</a-button>
          </div>
        </div>
      </article>
    </div>
  </section>

  <a-modal :open="!!statusJob" :title="advice?.title" :footer="null" width="420px" @cancel="statusId = ''">
    <template v-if="statusJob && advice">
      <a-alert :type="advice.tone === 'failed' ? 'error' : advice.tone === 'warning' ? 'warning' : 'info'" show-icon :message="advice.label" :description="advice.body || undefined" class="status-alert" />
      <dl class="status-facts">
        <dt>开始于</dt><dd>{{ new Date(statusJob.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</dd>
        <template v-if="statusJob.summary?.model"><dt>模特</dt><dd>{{ statusJob.summary.model }}</dd></template>
        <template v-if="statusJob.summary?.pose"><dt>动作</dt><dd>{{ statusJob.summary.pose }}</dd></template>
      </dl>
      <a-space wrap class="status-actions">
        <a-button v-if="advice.canRetry" type="primary" :loading="retrying === statusJob.id" @click="retry(statusJob)">重新生成</a-button>
        <a-button v-if="advice.canCancel" @click="cancel(statusJob)">取消生成</a-button>
        <a-button v-if="advice.canDelete" danger @click="statusId = ''; remove(statusJob)">删除这条记录</a-button>
        <a-button @click="statusId = ''">关闭</a-button>
      </a-space>
    </template>
  </a-modal>
  <a-modal v-model:open="confirmOpen" title="确认生成" ok-text="生成" cancel-text="取消" :confirm-loading="busy" width="440px" @ok="generate">
    <template v-if="preparation">
      <a-alert v-if="error" type="error" :message="error" show-icon role="status" aria-live="polite" style="margin-bottom:12px" />
      <div class="confirm-summary">
        <img v-if="person?.mediaUrl" :src="mediaUrl(person.mediaUrl)" :alt="person ? modelLabel(person) : '模特'" />
        <dl>
          <dt>模特</dt><dd>{{ person ? modelLabel(person) : '' }}</dd>
          <dt>动作</dt><dd>{{ preparation.pose?.name || '自动' }}</dd>
          <dt>衣物</dt><dd>{{ preparation.review.items.map(i => i.label).join('、') }}</dd>
          <dt>额度</dt><dd>{{ preparation.quotaUnits }} 个图像额度</dd>
        </dl>
      </div>
      <a-alert v-for="issue in preparation.review.warnings" :key="issue.code" type="warning" :message="issue.message" style="margin-top:8px" />
      <p class="ootd-note">生成图是视觉预览，不代表真实尺码是否合身。</p>
    </template>
  </a-modal>
  <ResultViewer :job="viewingJob" :can-adjust="!!available.length" @close="viewing = null" @changed="refresh" @submitted="adjusted" @remove="remove" />
</template>

<style scoped>
.ootd-manage { flex-shrink: 0; }
.ootd-workspace { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: var(--space-6); align-items: start; }
.ootd-steps { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.ootd-card { min-width: 0; padding: var(--space-5) var(--space-6); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-card-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.ootd-card-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; }
.ootd-step { display: grid; flex-shrink: 0; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; font-weight: 600; }
.ootd-full { width: 100%; }
.ootd-items-toggle { padding: 0; margin-top: var(--space-2); }
.ootd-items { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); }
.ootd-note { margin: 0; font-size: 13px; line-height: 1.7; color: var(--muted-copy); }
.ootd-selections { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-2); width: 100%; }
.ootd-selections :deep(.ant-checkbox-wrapper) { margin: 0; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-alt); }
.ootd-wear-roles > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 8px 0; border-bottom: 1px solid var(--line); }
.ootd-wear-roles :deep(.ant-select) { min-width: 180px; }
.ootd-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-model { min-width: 200px; }
.ootd-actions > .ant-space { margin-left: auto; }
.ootd-preview { position: sticky; top: 20px; }
.ootd-preview :deep(.outfit-thumbnail) { max-width: 340px; margin: 0 auto; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); }
.ootd-preview :deep(.ant-empty) { margin: var(--space-8) 0; }
.ootd-accessory { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: 6px; }
.ootd-accessory :deep(.ant-select) { min-width: 160px; }
.ootd-records { margin-top: var(--space-8); }
.ootd-records-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
.ootd-records-head h2 { margin: 0; font-size: 20px; font-weight: 600; }
.ootd-records-head small { margin-left: 6px; color: var(--muted-subtle); font-size: 14px; font-weight: 400; }
.ootd-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-4); }
.ootd-result { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-result-media { position: relative; display: grid; place-items: center; aspect-ratio: 2 / 3; padding: 0; overflow: hidden; border: 0; background: var(--surface-alt); cursor: zoom-in; }
.ootd-result-media.pending { cursor: pointer; }
.ootd-result-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .25s ease; }
.ootd-result-media:hover img { transform: scale(1.02); }
.ootd-result-state { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--muted-copy); font-size: 13px; }
.ootd-result-state small { font-size: 12px; color: var(--muted-subtle); }
.ootd-result-state.warning { color: var(--warning, #b7791f); font-weight: 600 }
.ootd-result-state.failed { color: var(--danger, #c0392b) }
.status-alert { margin-bottom: 14px; white-space: pre-line }
.status-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; font-size: 13px }
.status-facts dt { color: var(--muted-copy) }
.status-facts dd { margin: 0 }
.status-actions { margin-top: 4px }
.ootd-result-state.busy::after { content: ''; display: block; width: 36px; height: 3px; margin: 10px auto 0; border-radius: 2px; background: var(--accent); animation: ootd-pulse 1.2s ease-in-out infinite alternate; }
@keyframes ootd-pulse { from { opacity: .25; transform: scaleX(.4); } to { opacity: 1; transform: scaleX(1); } }
.ootd-result-flag { position: absolute; top: 8px; left: 8px; padding: 0 8px; border-radius: 999px; background: #6b4fbbe6; color: #fff; font-size: 11px; line-height: 20px; }
.ootd-result-body { display: flex; flex: 1; flex-direction: column; gap: var(--space-2); padding: 10px 12px; }
.ootd-result-title { margin: 0; overflow: hidden; font-size: 12px; color: var(--muted-strong); text-overflow: ellipsis; white-space: nowrap; }
.ootd-result-error { margin: 0; font-size: 12px; color: var(--danger); overflow-wrap: anywhere; }
.ootd-result-actions { display: flex; gap: var(--space-2); }
.confirm-summary { display: flex; gap: var(--space-4); align-items: flex-start; }
.confirm-summary img { flex-shrink: 0; width: 84px; height: 126px; border-radius: var(--radius-md); object-fit: cover; object-position: top; background: var(--surface-alt); }
.confirm-summary dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.confirm-summary dt { color: var(--muted-copy); }
.confirm-summary dd { margin: 0; overflow-wrap: anywhere; }
.confirm-summary + * { margin-top: 12px; }
@media (prefers-reduced-motion: reduce) { .ootd-result-state.busy::after { animation: none; } .ootd-result-media img { transition: none; } }
@media (max-width: 1023px) {
  .ootd-workspace { grid-template-columns: 1fr; gap: var(--space-4); }
  .ootd-preview { position: static; order: -1; }
  .ootd-actions { position: sticky; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 4; box-shadow: 0 6px 24px rgb(0 0 0 / 8%); }
}
@media (max-width: 767px) {
  .ootd-heading { flex-wrap: wrap; }
  .ootd-card { padding: 16px; }
  .ootd-selections { grid-template-columns: 1fr; }
  .ootd-actions { padding: 10px 12px; }
  .ootd-actions .ootd-note { display: none; }
  .ootd-actions > .ant-space { width: 100%; }
  .ootd-actions > .ant-space { gap: 8px !important; flex-wrap: nowrap !important; }
  .ootd-actions > .ant-space :deep(.ant-space-item) { flex: 1; min-width: 0; }
  .ootd-actions > .ant-space :deep(.ant-space-item:last-child) { flex: 1.5; }
  .ootd-actions .ant-btn { width: 100%; padding-inline: 8px; font-size: 13px; }
  /* Nothing to preview yet: keep the steps first instead of an empty box. */
  .ootd-preview.empty { display: none; }
  .ootd-preview :deep(.outfit-thumbnail) { max-width: 220px; }
  .ootd-results { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .ootd-wear-roles :deep(.ant-select), .ootd-accessory :deep(.ant-select) { width: 100%; min-width: 0; }
}
.ootd-wear-details { display: grid; gap: 8px; margin-top: 12px; }
.ootd-detail-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ootd-detail-row > span { flex: 1 1 100%; font-size: 13px; }
.ootd-detail-select { min-width: 132px; }
</style>
