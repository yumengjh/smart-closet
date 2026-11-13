<script setup lang="ts">
import PageTitle from '../shell/PageTitle.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App, Empty } from 'ant-design-vue'
import { DownOutlined, EllipsisOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SkinOutlined, UserOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../services/api'
import { mediaUrl } from '../services/urls'
import AiBadge from '../components/AiBadge.vue'
import { platformRequest, PlatformRequestError, type RenderSubmission, type Baseline, type Capability, type RenderJob, type Review, type PoseCatalog, type PoseChoice } from '../services/platform'
import type { Outfit } from '../domain/outfit'
import { createUuid } from '../domain/id'
import OutfitCollage from '../today/OutfitCollage.vue'
import { scenePieces } from '../today/deck'
import ModelPicker from '../ootd/ModelPicker.vue'
import PosePicker from '../ootd/PosePicker.vue'
import ResultViewer from '../ootd/ResultViewer.vue'
import RenderSource from '../ootd/RenderSource.vue'
import { modelLabel } from '../ootd/labels'
import { describeAdjustments } from '../ootd/body-adjust'
import { adviceFor, failureReason, groupRecords, routeTarget } from '../ootd/jobStatus'
import { useProcessingStore } from '../stores/processing'
import { useSendOffStore } from '../stores/sendOff'

const route = useRoute(), router = useRouter(); const { message, modal } = App.useApp(); const processing = useProcessingStore(), sendOff = useSendOffStore()
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
// One line for the confirmation: "白色 衬衫：全塞、袖子挽起；补充：领口解开一颗扣子".
const wearSummary = computed(() => {
  const parts = detailGarments.value.flatMap(g => { const d = wearDetails.value[g.garmentId] || {}; const phrases = DETAIL_OPTIONS[g.role].filter(o => d[o.key]).map(o => `${o.key === 'tuck' ? '' : o.label}${o.options.find(x => x.value === d[o.key])?.label}`); return phrases.length ? [`${g.garmentLabel}：${phrases.join('、')}`] : [] })
  if (wearNote.value.trim()) parts.push(`补充：${wearNote.value.trim()}`)
  return parts.join('；')
})
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
const hint = computed(() => !current.value ? '先选一套搭配' : !person.value ? '先设置谁来穿' : !capability.value ? '暂时没有可用的生成服务' : '')
// Issue #106: pictures, running jobs and failures are shown apart; a failure replaced by a successful retry folds away.
const groups = computed(() => groupRecords(jobs.value)); const showReplaced = ref<string[]>([])
const thumbs = computed(() => { const out = new Map<string, string>(); for (const o of outfits.value) for (const e of o.scene.elements) if (e.garmentId && e.assetUrl && !out.has(e.garmentId)) out.set(e.garmentId, e.assetUrl); return out })
function recordTitle(job: RenderJob) { return job.summary?.kind === 'ADJUST' ? `身材调整 · ${describeAdjustments(job.summary.adjustments)}` : job.summary?.outfit || [job.summary?.model, job.summary?.pose].filter(Boolean).join(' · ') || '未记录来源' }
function recordLine(job: RenderJob) { return [job.summary?.kind !== 'ADJUST' && job.summary?.outfit ? [job.summary?.model, job.summary?.pose].filter(Boolean).join(' · ') : '', new Date(job.createdAt).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ') }
function viewReplacement(job: RenderJob) { const next = jobs.value.find(j => j.id === groups.value.replacedBy.get(job.id)); statusId.value = ''; if (next) viewing.value = next }
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
  if (groups.value.retryState.get(job.id) !== 'open') { message.info(groups.value.retryState.get(job.id) === 'retrying' ? '这条已经在重新生成，请稍等。' : '这条已经重新生成成功了。'); return }
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
// ToC 改版 P2（试穿页重新设计）：“这套 + 谁来穿”两张大卡片，点开底部（桌面右侧）面板挑选；姿势和穿法收进可展开的行。
const sheet = ref<'' | 'outfit' | 'person' | 'pose'>(''); const moreOpen = ref(false)
const wideQuery = window.matchMedia('(min-width: 1024px)'); const wide = ref(wideQuery.matches)
const onWide = () => { wide.value = wideQuery.matches }
const poseName = computed(() => { const v = pose.value; if (v.mode === 'AUTO') return '自动'; return [...(poseCatalog.value?.presets || []), ...(poseCatalog.value?.mine || [])].find(p => p.id === v.id)?.name || '已选' })
function chooseOutfit(id: string) { outfitId.value = id; sheet.value = '' }
watch(baselineId, (_v, old) => { if (old && sheet.value === 'person') sheet.value = '' })
function moreAction({ key }: { key: string | number }) { if (key === 'check') void check(); else if (key === 'rehearse') rehearse(); else if (key === 'manage') void router.push('/settings?section=personal') }
const failedOpen = ref<string[]>([])
onMounted(() => { void load(); timer = setInterval(refresh, 5000); wideQuery.addEventListener('change', onWide) })
onUnmounted(() => { clearInterval(timer); wideQuery.removeEventListener('change', onWide) })
</script>

<template>
  <PageTitle title="试穿" :count="groups.done.length || null" unit="张" />
  <a-alert v-if="error && !confirmOpen" type="error" :message="error" show-icon closable class="studio-alert" @close="error=''" />
  <div v-if="loading" class="studio-card"><a-skeleton active /></div>
  <div v-else class="studio">
    <section class="studio-card studio-main">
      <div class="studio-pair">
        <button type="button" class="studio-tile" :class="{ empty: !current }" @click="sheet = 'outfit'">
          <span class="studio-tile-media"><OutfitCollage v-if="current" :pieces="scenePieces(current.scene)" :title="current.name" /><span v-else class="studio-tile-empty"><SkinOutlined /><b>选一套搭配</b></span></span>
          <span class="studio-tile-label"><small>这套</small><b>{{ current ? current.name : '还没选' }}</b><em>换</em></span>
        </button>
        <span class="studio-plus" aria-hidden="true"><PlusOutlined /></span>
        <button type="button" class="studio-tile" :class="{ empty: !person }" @click="sheet = 'person'">
          <span class="studio-tile-media"><template v-if="person?.mediaUrl"><img :src="mediaUrl(person.mediaUrl)" :alt="modelLabel(person)" /><AiBadge small /></template><span v-else class="studio-tile-empty"><UserOutlined /><b>{{ baselines.length ? '选一个形象' : '设置我的形象' }}</b></span></span>
          <span class="studio-tile-label"><small>谁来穿</small><b>{{ person ? modelLabel(person) : '还没设置' }}</b><em>换</em></span>
        </button>
      </div>
      <div class="studio-rows">
        <button type="button" class="studio-row" @click="sheet = 'pose'"><span>姿势</span><b>{{ poseName }}</b><RightOutlined /></button>
        <button v-if="current" type="button" class="studio-row" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><span>穿法与更多</span><b>{{ selected.length }}/{{ garments.length }} 件<template v-if="wearSummary"> · 已调整</template></b><DownOutlined :class="{ flipped: moreOpen }" /></button>
        <div v-if="current && moreOpen" class="studio-more">
          <p class="studio-label">这次穿哪些</p>
          <a-checkbox-group v-model:value="selected" class="ootd-selections"><a-checkbox v-for="g in garments" :key="g.garmentId" :value="g.garmentId">{{ g.garmentLabel }}</a-checkbox></a-checkbox-group>
          <a-checkbox v-model:checked="multiLayer">多层穿法（打底 + 主体 + 外搭）</a-checkbox>
          <div v-if="multiLayer" class="ootd-wear-roles"><div v-for="g in garments.filter(g => selected.includes(g.garmentId))" :key="g.garmentId"><span>{{ g.garmentLabel }}</span><a-select v-model:value="wearRoles[g.garmentId]" allow-clear :options="[{ value: 'INNER', label: '打底内层' }]" placeholder="按品类判断" /></div></div>
          <template v-if="detailGarments.length">
            <p class="studio-label">穿法细节 <small>只影响这张图，不改搭配</small></p>
            <div v-for="g in detailGarments" :key="g.garmentId" class="ootd-detail-row">
              <span>{{ g.garmentLabel }}<a-tag v-if="suggested[g.garmentId]" :bordered="false">建议</a-tag></span>
              <a-select v-for="d in DETAIL_OPTIONS[g.role]" :key="d.key" size="small" class="ootd-detail-select" :aria-label="`${g.garmentLabel}${d.label}`" :value="detail(g.garmentId, d.key)" :options="d.options.map(o => ({ value: o.value, label: `${d.label}：${o.label}` }))" @update:value="(v: string) => setDetail(g.garmentId, d.key, v)" />
            </div>
          </template>
          <a-textarea v-model:value="wearNote" :maxlength="200" show-count :auto-size="{ minRows: 1, maxRows: 3 }" placeholder="补充说明，例如：衬衫领口解开一颗扣子" aria-label="穿法补充说明" />
          <template v-if="available.length > 1"><p class="studio-label">生成模型</p><a-select v-model:value="model" class="ootd-full" aria-label="生成模型" :options="available.map(c => ({ value: c.provider + ':' + c.model, label: c.model }))" /></template>
        </div>
      </div>
      <template v-if="review">
        <a-alert v-for="issue in review.blockers" :key="issue.message" type="error" :message="issue.message" :description="issue.action" show-icon class="studio-review" />
        <a-alert v-for="issue in review.warnings" :key="issue.code" type="warning" :message="issue.message" show-icon class="studio-review" />
        <a-alert v-if="!review.blockers.length && !review.warnings.length" type="success" message="这套可以直接生成" show-icon class="studio-review" />
        <div v-for="slot in filledSlots.filter(s => s.items.some(i => i.role === 'ACCESSORY'))" :key="slot.role" class="studio-accessories">
          <div v-for="i in slot.items.filter(i => i.role === 'ACCESSORY')" :key="i.garmentId" class="ootd-accessory"><span>{{ i.label }}</span> <a-select v-model:value="wearRoles[i.garmentId]" :options="accessoryOptions" placeholder="戴在哪里" /></div>
        </div>
      </template>
    </section>

    <aside class="studio-cta">
      <a-button type="primary" size="large" block :loading="busy" :disabled="!current || !person || !capability" @click="prepare()">生成上身图</a-button>
      <div class="studio-cta-foot">
        <span>{{ hint || '每张用 1 次图像额度 · 约 30 秒，可以先离开' }}</span>
        <a-dropdown :trigger="['click']" placement="topRight">
          <a-button type="text" size="small" aria-label="更多操作"><EllipsisOutlined /></a-button>
          <template #overlay><a-menu @click="moreAction"><a-menu-item key="check" :disabled="!current">只检查这套能不能生成</a-menu-item><a-menu-item key="rehearse">模拟一次（不花额度）</a-menu-item><a-menu-item key="manage">管理我的形象</a-menu-item></a-menu></template>
        </a-dropdown>
      </div>
    </aside>
  </div>

  <section class="ootd-records">
    <header class="ootd-records-head"><h2>我的上身图</h2><a-button type="text" aria-label="刷新" @click="refresh"><ReloadOutlined /></a-button></header>
    <a-collapse v-if="groups.failed.length || groups.replaced.length" v-model:active-key="failedOpen" ghost class="studio-failed">
      <a-collapse-panel key="failed" :header="groups.failed.length ? `${groups.failed.length} 张没有生成成功` : `已重新生成成功的失败记录 ${groups.replaced.length} 条`">
        <article v-for="job in groups.failed" :key="job.id" class="ootd-row">
          <a-tag class="ootd-row-tag" :bordered="false" :color="adviceFor(job).tone === 'warning' ? 'warning' : adviceFor(job).tone === 'failed' ? 'error' : 'default'">{{ adviceFor(job).label }}</a-tag>
          <div class="ootd-row-body"><p class="ootd-result-title">{{ recordTitle(job) }}</p><p class="ootd-row-reason">{{ failureReason(job) }}</p><RenderSource :job="job" :thumbs="thumbs" compact /></div>
          <div class="ootd-row-actions">
            <a-tag v-if="groups.retryState.get(job.id) === 'retrying'" :bordered="false" color="processing">正在重新生成</a-tag>
            <a-button v-else-if="adviceFor(job).canRetry" size="small" type="primary" :loading="retrying === job.id" @click="retry(job)">重新生成</a-button>
            <a-button size="small" @click="openJob(job)">详情</a-button>
            <a-button v-if="adviceFor(job).canDelete" size="small" danger @click="remove(job)">删除</a-button>
          </div>
        </article>
        <article v-for="job in groups.replaced" :key="job.id" class="ootd-row">
          <a-tag class="ootd-row-tag" :bordered="false" color="success">已重试成功</a-tag>
          <div class="ootd-row-body"><p class="ootd-result-title">{{ recordTitle(job) }}</p><p class="ootd-row-reason muted">{{ failureReason(job) }} · {{ recordLine(job) }}</p></div>
          <div class="ootd-row-actions"><a-button size="small" @click="viewReplacement(job)">查看新图</a-button><a-button v-if="adviceFor(job).canDelete" size="small" danger @click="remove(job)">删除</a-button></div>
        </article>
      </a-collapse-panel>
    </a-collapse>
    <div v-if="groups.running.length || groups.done.length" class="ootd-results" role="status" aria-live="polite">
      <article v-for="job in groups.running" :key="job.id" class="ootd-result running">
        <div class="ootd-result-media"><span class="studio-running"><b>{{ adviceFor(job).label }}</b><small>做好会提醒你</small></span></div>
        <div class="ootd-result-body"><p class="ootd-result-title">{{ recordTitle(job) }}</p><a-button v-if="adviceFor(job).canCancel" type="link" size="small" class="ootd-source-link" @click="cancel(job)">取消</a-button></div>
      </article>
      <article v-for="job in groups.done" :key="job.id" class="ootd-result">
        <button type="button" class="ootd-result-media" aria-label="查看大图" @click="openJob(job)">
          <img :src="mediaUrl(job.mediaUrl!)" alt="上身效果图（AI 生成）" loading="lazy" />
          <AiBadge />
          <span v-if="job.summary?.kind === 'ADJUST'" class="ootd-result-flag">身材调整</span>
        </button>
        <div class="ootd-result-body">
          <p class="ootd-result-title" :title="recordTitle(job)">{{ recordTitle(job) }}</p>
          <p class="ootd-result-line">{{ recordLine(job) }}</p>
          <a-popover trigger="click" placement="top" title="生成时用的资料" :overlay-style="{ maxWidth: '320px' }">
            <template #content><RenderSource :job="job" :thumbs="thumbs" /></template>
            <a-button type="link" size="small" class="ootd-source-link">用了什么</a-button>
          </a-popover>
        </div>
      </article>
    </div>
    <div v-else class="studio-gallery-empty"><p>生成的上身图会放在这里。</p></div>
  </section>

  <a-drawer :open="sheet === 'outfit'" :placement="wide ? 'right' : 'bottom'" :width="440" height="min(78dvh, 680px)" title="选一套搭配" root-class-name="studio-sheet" @close="sheet = ''">
    <div v-if="outfits.length" class="studio-outfits">
      <button v-for="o in outfits" :key="o.id" type="button" class="studio-outfit" :class="{ on: o.id === outfitId }" :aria-pressed="o.id === outfitId" @click="chooseOutfit(o.id)"><span class="studio-outfit-media"><OutfitCollage :pieces="scenePieces(o.scene)" :title="o.name" :size="320" /></span><b>{{ o.name }}</b></button>
    </div>
    <div v-else class="studio-sheet-empty"><p>还没有保存的搭配。去“今天”挑一套，点 ☆ 收进来。</p><a-button type="primary" @click="router.push('/today')">去今天看看</a-button></div>
  </a-drawer>
  <a-drawer :open="sheet === 'person'" :placement="wide ? 'right' : 'bottom'" :width="440" height="auto" title="谁来穿" root-class-name="studio-sheet" @close="sheet = ''">
    <ModelPicker v-if="baselines.length" v-model="baselineId" :models="baselines" />
    <div v-else class="studio-sheet-empty"><p>先上传一张全身照，生成你的形象，之后每次试穿都用它。</p><a-button type="primary" @click="router.push('/settings?section=personal')">设置我的形象</a-button></div>
  </a-drawer>
  <a-drawer :open="sheet === 'pose'" :placement="wide ? 'right' : 'bottom'" :width="480" height="min(82dvh, 760px)" title="姿势" root-class-name="studio-sheet" @close="sheet = ''">
    <PosePicker v-model="pose" :catalog="poseCatalog" @changed="loadPoses" />
    <template #footer><a-button type="primary" block @click="sheet = ''">好了 · {{ poseName }}</a-button></template>
  </a-drawer>
  <a-modal :open="!!statusJob" :title="advice?.title" :footer="null" width="420px" @cancel="statusId = ''">
    <template v-if="statusJob && advice">
      <a-alert :type="advice.tone === 'failed' ? 'error' : advice.tone === 'warning' ? 'warning' : 'info'" show-icon :message="advice.label" :description="advice.body || undefined" class="status-alert" />
      <a-alert v-if="groups.retryState.get(statusJob.id) === 'replaced'" type="success" show-icon message="已经重新生成成功，新图在图片列表里。" class="status-alert" />
      <a-alert v-else-if="groups.retryState.get(statusJob.id) === 'retrying'" type="info" show-icon message="已经在重新生成，做好后这条会自动收起。" class="status-alert" />
      <RenderSource :job="statusJob" :thumbs="thumbs" class="status-facts" />
      <a-space wrap class="status-actions">
        <a-button v-if="groups.retryState.get(statusJob.id) === 'replaced'" type="primary" @click="viewReplacement(statusJob)">查看新图</a-button>
        <a-button v-else-if="advice.canRetry && groups.retryState.get(statusJob.id) !== 'retrying'" type="primary" :loading="retrying === statusJob.id" @click="retry(statusJob)">重新生成</a-button>
        <a-button v-if="advice.canCancel" @click="cancel(statusJob)">取消生成</a-button>
        <a-button v-if="advice.canDelete" danger @click="statusId = ''; remove(statusJob)">删除这条记录</a-button>
        <a-button @click="statusId = ''">关闭</a-button>
      </a-space>
    </template>
  </a-modal>
  <a-modal v-model:open="confirmOpen" title="生成这张上身图？" ok-text="生成" cancel-text="再想想" :confirm-loading="busy" width="440px" @ok="generate">
    <template v-if="preparation">
      <a-alert v-if="error" type="error" :message="error" show-icon role="status" aria-live="polite" style="margin-bottom:12px" />
      <div class="confirm-summary">
        <span v-if="person?.mediaUrl" class="confirm-photo"><img :src="mediaUrl(person.mediaUrl)" :alt="person ? modelLabel(person) : '模特'" /><AiBadge small /></span>
        <dl>
          <dt>谁来穿</dt><dd>{{ person ? modelLabel(person) : '' }}</dd>
          <dt>姿势</dt><dd>{{ preparation.pose?.name || '自动' }}</dd>
          <dt>衣物</dt><dd>{{ preparation.review.items.map(i => i.label).join('、') }}</dd>
          <template v-if="wearSummary"><dt>穿法</dt><dd>{{ wearSummary }}</dd></template>
          <dt>消耗</dt><dd>{{ preparation.quotaUnits }} 次图像额度</dd>
        </dl>
      </div>
      <a-alert v-for="issue in preparation.review.warnings" :key="issue.code" type="warning" :message="issue.message" style="margin-top:8px" />
      <p class="ootd-note">这是 AI 生成的效果预览，不代表真实尺码是否合身。</p>
    </template>
  </a-modal>
  <ResultViewer :job="viewingJob" :thumbs="thumbs" :can-adjust="!!available.length" @close="viewing = null" @changed="refresh" @submitted="adjusted" @remove="remove" />
</template>

<style scoped>
.studio-alert { margin-bottom: 14px; }
.studio { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.studio-card { min-width: 0; padding: 14px; border-radius: 20px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.studio-pair { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
.studio-tile { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.studio-tile-media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 14px; background: var(--surface-alt); transition: box-shadow .2s ease; }
.studio-tile:hover .studio-tile-media, .studio-tile:focus-visible .studio-tile-media { box-shadow: 0 0 0 2px var(--ink); }
.studio-tile:focus-visible { outline: none; }
.studio-tile-media > img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.studio-tile.empty .studio-tile-media { box-shadow: inset 0 0 0 1.5px var(--line); background: transparent; }
.studio-tile-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; color: var(--muted); text-align: center; font-size: 26px; }
.studio-tile-empty b { font-size: 13px; font-weight: 500; }
.studio-tile-label { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 0 6px; padding: 0 2px; }
.studio-tile-label small { grid-column: 1 / -1; font-size: 12px; color: var(--muted); }
.studio-tile-label b { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.studio-tile-label em { font-style: normal; font-size: 13px; color: var(--accent-strong); }
.studio-plus { display: grid; place-items: center; width: 28px; height: 28px; margin-bottom: 44px; border-radius: 50%; color: var(--muted); background: var(--surface-alt); font-size: 12px; }
.studio-rows { margin-top: 14px; border-top: 1px solid var(--line); }
.studio-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 0 2px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); cursor: pointer; font: inherit; text-align: left; }
.studio-row > span { flex: none; font-size: 15px; }
.studio-row > b { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 400; color: var(--muted); text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.studio-row > .anticon { flex: none; font-size: 12px; color: var(--muted-subtle); transition: transform .2s ease; }
.studio-row > .anticon.flipped { transform: rotate(180deg); }
.studio-more { display: grid; gap: 10px; padding: 14px 2px 16px; border-bottom: 1px solid var(--line); }
.studio-label { margin: 6px 0 0; font-size: 13px; font-weight: 600; }
.studio-label small { margin-left: 6px; font-weight: 400; color: var(--muted); }
.studio-review { margin-top: 12px; }
.studio-accessories { display: grid; gap: 8px; margin-top: 10px; }
.studio-cta { position: sticky; bottom: calc(var(--dock-space) + 4px); z-index: 5; display: grid; gap: 8px; padding: 12px; border-radius: 18px; background: var(--glass); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); box-shadow: 0 0 0 1px var(--line), 0 10px 30px -16px #00000040; }
.studio-cta .ant-btn-lg { height: 50px; font-size: 16px; }
.studio-cta-foot { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.studio-cta-foot > span { flex: 1; min-width: 0; }
.ootd-full { width: 100%; }
.ootd-note { margin: 0; font-size: 13px; line-height: 1.7; color: var(--muted-copy); }
.ootd-selections { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; width: 100%; }
.ootd-selections :deep(.ant-checkbox-wrapper) { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--surface-alt); }
.ootd-wear-roles > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.ootd-wear-roles :deep(.ant-select) { min-width: 180px; }
.ootd-detail-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ootd-detail-row > span { flex: 1 1 100%; font-size: 13px; }
.ootd-detail-select { min-width: 132px; }
.ootd-accessory { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.ootd-accessory :deep(.ant-select) { min-width: 160px; }
.ootd-records { margin-top: 28px; }
.ootd-records-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.ootd-records-head h2 { margin: 0; font-size: 17px; font-weight: 650; }
.studio-failed { margin-bottom: 12px; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.studio-failed :deep(.ant-collapse-header) { color: var(--muted-strong); font-size: 14px; }
.studio-gallery-empty { display: grid; place-items: center; min-height: 140px; border-radius: 16px; background: var(--surface-alt); color: var(--muted); font-size: 14px; }
.studio-gallery-empty p { margin: 0; }
.ootd-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ootd-result { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.ootd-result-media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; padding: 0; overflow: hidden; border: 0; background: var(--surface-alt); cursor: zoom-in; }
.ootd-result.running .ootd-result-media { cursor: default; }
.ootd-result-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .25s ease; }
.ootd-result-media:hover img { transform: scale(1.02); }
.studio-running { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--muted-strong); background: linear-gradient(110deg, var(--surface-alt) 30%, var(--surface) 50%, var(--surface-alt) 70%); background-size: 220% 100%; animation: studio-shine 1.6s linear infinite; }
.studio-running b { font-size: 13px; font-weight: 600; }
.studio-running small { font-size: 12px; color: var(--muted); }
@keyframes studio-shine { to { background-position: -220% 0; } }
.ootd-result-flag { position: absolute; top: 8px; left: 8px; padding: 0 8px; border-radius: 6px; background: #111111cc; color: #fff; font-size: 11px; line-height: 20px; }
.ootd-result-body { display: flex; flex: 1; flex-direction: column; gap: 2px; padding: 8px 10px 10px; }
.ootd-result-title { margin: 0; overflow: hidden; font-size: 13px; font-weight: 500; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
.ootd-result-line { margin: 0; overflow: hidden; font-size: 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.ootd-source-link { align-self: flex-start; height: auto; padding: 0; font-size: 12px; }
.ootd-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.ootd-row:first-of-type { border-top: 0; }
.ootd-row-tag { flex-shrink: 0; margin: 2px 0 0; }
.ootd-row-body { display: flex; flex: 1 1 240px; flex-direction: column; gap: 4px; min-width: 0; }
.ootd-row-body .ootd-result-title { white-space: normal; font-weight: 600; }
.ootd-row-reason { margin: 0; color: var(--danger); font-size: 12px; }
.ootd-row-reason.muted { color: var(--muted-subtle); }
.ootd-row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.status-alert { margin-bottom: 14px; white-space: pre-line }
.status-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; font-size: 13px }
.status-facts dt { color: var(--muted-copy) }
.status-facts dd { margin: 0 }
.status-actions { margin-top: 4px }
.confirm-summary { display: flex; gap: 16px; align-items: flex-start; }
.confirm-photo { position: relative; flex-shrink: 0; display: block; width: 84px; height: 126px; }
.confirm-summary img { flex-shrink: 0; width: 84px; height: 126px; border-radius: 10px; object-fit: cover; object-position: top; background: var(--surface-alt); }
.confirm-summary dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.confirm-summary dt { color: var(--muted-copy); }
.confirm-summary dd { margin: 0; overflow-wrap: anywhere; }
.confirm-summary + * { margin-top: 12px; }
@media (min-width: 768px) { .ootd-results { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; } .studio-card { padding: 20px; } .studio-pair { gap: 16px; } }
@media (min-width: 1024px) {
  .studio { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; gap: 24px; }
  .studio-pair { max-width: 480px; margin: 0 auto; }
  .studio-cta { position: sticky; top: 24px; bottom: auto; padding: 18px; background: var(--surface); backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: 0 0 0 1px var(--line); }
}
@media (prefers-reduced-motion: reduce) { .studio-running { animation: none; } .ootd-result-media img, .studio-row > .anticon { transition: none; } }
</style>
<style>
/* 底部（桌面右侧）选择面板：圆角顶边，内容区留白。 */
.studio-sheet .ant-drawer-content { border-radius: 20px 20px 0 0; }
.studio-sheet .ant-drawer-right .ant-drawer-content, .studio-sheet.ant-drawer-right .ant-drawer-content { border-radius: 0; }
.studio-sheet .ant-drawer-header { border-bottom: 0; padding-bottom: 4px; }
.studio-outfits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.studio-outfit { display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.studio-outfit-media { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--surface-alt); }
.studio-outfit.on .studio-outfit-media { box-shadow: 0 0 0 2px var(--ink); }
.studio-outfit b { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.studio-sheet-empty { display: grid; justify-items: center; gap: 12px; padding: 24px 8px; text-align: center; color: var(--muted); }
.studio-sheet-empty p { margin: 0; }
</style>
