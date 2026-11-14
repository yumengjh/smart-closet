<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App, Input } from 'ant-design-vue'
import { CheckOutlined, DownloadOutlined, PictureOutlined, PlusOutlined, ReloadOutlined, ShareAltOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../services/api'
import { platformRequest, PlatformRequestError, type Baseline, type PoseCatalog, type PoseChoice } from '../services/platform'
import { activeAccount, captureAccount, mayPoll } from '../domain/accountSession'
import { createUuid } from '../domain/id'
import { formatGarmentLabel, type Outfit } from '../domain/outfit'
import { artworkForGarment } from '../domain/outfit-images'
import { mediaUrl, thumbUrl } from '../services/urls'
import { creationApi } from '../creation/api'
import { creationCatalog, loadCreationCatalog } from '../creation/access'
import { creationInput, creationStatus, liveCreation, readPendingCreation } from '../creation/model'
import type { CreationJob, CreationPreparation, Light, PendingCreation } from '../creation/types'
import PageTitle from '../shell/PageTitle.vue'
import AiBadge from '../components/AiBadge.vue'

const route = useRoute(), router = useRouter(), { message, modal } = App.useApp()
const InputSearch = Input.Search
const storagePrefix = `yixu.creation:${activeAccount() || 'anonymous'}:`
function read(key: string) { try { return sessionStorage.getItem(storagePrefix + key) } catch { return null } }
function store(key: string, value: unknown) { try { if (value === null) sessionStorage.removeItem(storagePrefix + key); else sessionStorage.setItem(storagePrefix + key, JSON.stringify(value)) } catch { /* In-memory reconciliation still prevents a second submit. */ } }
const pending = ref<PendingCreation | null>(readPendingCreation(read('pending')))
const templateId = ref(''), selected = ref<Garment[]>([]), baselineId = ref(''), light = ref<Light>('DEFAULT'), note = ref('')
const pose = ref<PoseChoice>({ mode: 'AUTO' }), models = ref<Baseline[]>([]), poses = ref<PoseCatalog | null>(null)
const source = ref<Outfit | null>(null), parentJobId = ref<string | undefined>()
const loading = ref(true), busy = ref(false), error = ref(''), sourceError = ref(''), historyError = ref('')
const jobs = ref<CreationJob[]>([]), total = ref(0), page = ref(1), refreshing = ref(false)
const preparation = ref<CreationPreparation | null>(null), confirmOpen = ref(false)
const pickerOpen = ref(false), candidates = ref<Garment[]>([]), pickerPage = ref(1), pickerTotal = ref(0), search = ref(''), picking = ref(false)
const template = computed(() => creationCatalog.value?.templates.find(item => item.id === templateId.value))
const person = computed(() => models.value.find(item => item.id === baselineId.value))
const enabled = computed(() => Boolean(creationCatalog.value?.enabled)), locked = computed(() => busy.value || !!pending.value)
const maxGarments = computed(() => Math.min(12, template.value?.maxGarments || 12))
const pickedIds = computed(() => new Set(selected.value.map(item => item.id)))
const poseOptions = computed(() => [{ value: 'AUTO', label: '自动' }, ...(poses.value?.presets || []).map(p => ({ value: `PRESET:${p.id}`, label: p.name })), ...(poses.value?.mine || []).map(p => ({ value: `CUSTOM:${p.id}`, label: p.name }))])
const poseValue = computed({ get: () => pose.value.mode === 'AUTO' ? 'AUTO' : `${pose.value.mode}:${pose.value.id}`, set: (value: string) => { const [mode, ...id] = value.split(':'); pose.value = mode === 'AUTO' ? { mode } : { mode: mode as 'CUSTOM' | 'PRESET', id: id.join(':') } } })
const lightOptions = computed(() => (template.value?.options.light || ['DEFAULT']).map(value => ({ value, label: { DEFAULT: '自然', WARM: '暖光', COOL: '冷光' }[value] })))
const hint = computed(() => !enabled.value ? '穿搭创作暂未开放' : !template.value ? '先选一种效果' : !template.value.available ? template.value.unavailableReason || '这个效果暂不可用' : !selected.value.length ? '先选几件衣物' : selected.value.length > maxGarments.value ? `这个效果最多 ${maxGarments.value} 件衣物` : template.value.personRequired && !person.value ? '先选择已确认的形象' : '')
const eligible = (g: Garment) => g.status === 'ACTIVE' && Boolean(g.displayUrl || g.images.some(image => image.reviewStatus === 'APPROVED'))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'

watch([templateId, selected, baselineId, light, pose, note], () => {
  preparation.value = null; confirmOpen.value = false
  store('draft', { ids: selected.value.map(item => item.id), templateId: templateId.value, baselineId: baselineId.value, light: light.value, pose: pose.value, note: note.value, outfitId: source.value?.id })
}, { deep: true })
watch(templateId, () => { light.value = 'DEFAULT'; if (!template.value?.personRequired) { baselineId.value = ''; pose.value = { mode: 'AUTO' } } else if (!person.value) baselineId.value = models.value.find(item => item.currentDefault)?.id || models.value[0]?.id || '' })
watch(pending, value => store('pending', value), { deep: true })

async function refreshJobs() {
  if (refreshing.value || !mayPoll()) return
  refreshing.value = true
  try { const result = await creationApi.jobs(page.value); jobs.value = result.items; total.value = result.total; historyError.value = '' }
  catch (cause) { historyError.value = describe(cause) }
  finally { refreshing.value = false }
}
async function load() {
  loading.value = true; error.value = ''; sourceError.value = ''
  let draft: { ids?: string[]; templateId?: string; baselineId?: string; light?: Light; pose?: PoseChoice; note?: string; outfitId?: string } = {}
  try { draft = JSON.parse(read('draft') || '{}') || {} } catch { /* A damaged draft is ignored. */ }
  try {
    await loadCreationCatalog(true)
    templateId.value = creationCatalog.value?.templates.find(item => item.id === draft.templateId)?.id || creationCatalog.value?.templates.find(item => item.available)?.id || creationCatalog.value?.templates[0]?.id || ''
    if (enabled.value) {
      const results = await Promise.allSettled([platformRequest<Baseline[]>('/api/me/person-baselines'), platformRequest<PoseCatalog>('/api/ootd/poses')])
      if (results[0].status === 'fulfilled') models.value = results[0].value.filter(item => item.status === 'CONFIRMED')
      if (results[1].status === 'fulfilled') poses.value = results[1].value
      baselineId.value = models.value.find(item => item.id === draft.baselineId)?.id || models.value.find(item => item.currentDefault)?.id || models.value[0]?.id || ''
      if (['DEFAULT', 'WARM', 'COOL'].includes(draft.light || '')) light.value = draft.light!
      if (draft.pose && poseOptions.value.some(item => item.value === (draft.pose!.mode === 'AUTO' ? 'AUTO' : `${draft.pose!.mode}:${draft.pose!.id}`))) pose.value = draft.pose
      note.value = typeof draft.note === 'string' ? draft.note.slice(0, 200) : ''
      const outfitId = typeof route.query.outfit === 'string' ? route.query.outfit : draft.outfitId
      try {
        source.value = outfitId ? await closetApi.outfit(outfitId) : null
        const ids = source.value ? source.value.scene.elements.filter(item => item.kind !== 'PERSON_PART').map(item => item.garmentId) : Array.isArray(draft.ids) ? draft.ids.filter(id => typeof id === 'string') : []
        const garments = await Promise.allSettled([...new Set(ids)].slice(0, 12).map(id => closetApi.detail(id)))
        selected.value = garments.flatMap(item => item.status === 'fulfilled' && eligible(item.value) ? [item.value] : [])
        if (selected.value.length !== new Set(ids).size) { source.value = null; sourceError.value = '部分衣物已变化或无法用于创作，已移除，请重新核对。' }
      } catch (cause) { source.value = null; sourceError.value = describe(cause) }
    }
    await refreshJobs()
  } catch (cause) { error.value = describe(cause); await refreshJobs() }
  finally { loading.value = false }
}
async function loadCandidates() {
  picking.value = true
  try { const result = await closetApi.list({ status: 'ACTIVE', q: search.value, category: '', color: '', season: '', page: pickerPage.value, size: 24 }); candidates.value = result.items.filter(eligible); pickerTotal.value = result.total }
  catch (cause) { message.error(describe(cause)) } finally { picking.value = false }
}
function openPicker() { pickerOpen.value = true; void loadCandidates() }
function toggle(g: Garment) {
  if (locked.value) return
  if (pickedIds.value.has(g.id)) selected.value = selected.value.filter(item => item.id !== g.id)
  else if (selected.value.length >= maxGarments.value) { message.info(`最多选择 ${maxGarments.value} 件衣物。`); return }
  else selected.value = [...selected.value, g]
  source.value = null
}
async function prepare() {
  if (hint.value || locked.value || !template.value) return
  busy.value = true; error.value = ''
  try { preparation.value = await creationApi.prepare(creationInput(template.value, selected.value, person.value, light.value, pose.value, note.value, source.value || undefined, parentJobId.value)); confirmOpen.value = true }
  catch (cause) { error.value = describe(cause) }
  finally { busy.value = false }
}
async function submit() {
  if (busy.value) return
  if (!pending.value) {
    if (!preparation.value || preparation.value.expiresAt <= Date.now()) { confirmOpen.value = false; preparation.value = null; message.info('确认已过期，请重新核对。'); return }
    pending.value = { key: createUuid(), preparationId: preparation.value.preparationId }
  }
  busy.value = true; error.value = ''
  try {
    const job = await creationApi.submit(pending.value)
    pending.value = null; preparation.value = null; confirmOpen.value = false; page.value = 1
    jobs.value = [job, ...jobs.value.filter(item => item.id !== job.id)]; total.value = Math.max(total.value, jobs.value.length)
    message.success('已加入创作，离开页面后也会继续。'); void refreshJobs()
  } catch (cause) {
    if (cause instanceof PlatformRequestError && !cause.uncertain) { pending.value = null; preparation.value = null; confirmOpen.value = false }
    error.value = describe(cause)
  } finally { busy.value = false }
}
function cancel(job: CreationJob) { modal.confirm({ title: '取消这次创作？', content: '已发送给图片服务的尝试仍使用一次图片次数。', okText: '取消创作', cancelText: '继续等待', async onOk() { await creationApi.cancel(job.id); await refreshJobs() } }) }
function remove(job: CreationJob) { modal.confirm({ title: '删除这份作品记录？', content: '正在生成的作品会先取消。删除后将无法再查看或导出。', okText: '删除', okType: 'danger', cancelText: '保留', async onOk() { await creationApi.remove(job.id); await refreshJobs() } }) }
function recreate(job: CreationJob) { parentJobId.value = job.id; if (creationCatalog.value?.templates.some(item => item.id === job.templateId && item.available)) templateId.value = job.templateId; message.info('已选用当前衣物，请核对后生成新作品，将使用 1 次。'); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
const feedbackJob = ref<CreationJob | null>(null), feedbackReason = ref('BAD_GARMENT'), feedbackBusy = ref(false)
async function feedback() { if (!feedbackJob.value) return; feedbackBusy.value = true; try { await creationApi.feedback(feedbackJob.value.id, feedbackReason.value); feedbackJob.value = null; message.success('已记录，谢谢你的反馈。') } catch (cause) { message.error(describe(cause)) } finally { feedbackBusy.value = false } }

const exporting = ref<CreationJob | null>(null), exportTitle = ref(''), brand = ref(true), exportBusy = ref(false), exportError = ref(''), exportUrl = ref('')
let exportBlob: Blob | null = null, exportEpoch = 0
function clearExport() { exportEpoch++; if (exportUrl.value) URL.revokeObjectURL(exportUrl.value); exportUrl.value = ''; exportBlob = null; exportBusy.value = false }
watch([exportTitle, brand], clearExport)
function openExport(job: CreationJob) { clearExport(); exportTitle.value = ''; brand.value = true; exportError.value = ''; exporting.value = job }
async function previewExport() {
  if (!exporting.value) return
  clearExport(); const epoch = exportEpoch; exportBusy.value = true; exportError.value = ''
  try { const blob = await creationApi.export(exporting.value.id, exportTitle.value, brand.value); if (epoch !== exportEpoch) return; if (!blob.type.includes('image/png')) throw new Error('未收到 PNG 图片，请稍后重试。'); exportBlob = blob; exportUrl.value = URL.createObjectURL(blob) }
  catch (cause) { if (epoch === exportEpoch) exportError.value = describe(cause) }
  finally { if (epoch === exportEpoch) exportBusy.value = false }
}
function saveExport() { if (!exportBlob || !exportUrl.value) return; const anchor = document.createElement('a'); anchor.href = exportUrl.value; anchor.download = `yuda-${exporting.value?.id || 'creation'}.png`; anchor.click() }
async function shareExport() {
  if (!exportBlob) return
  const stillSameAccount = captureAccount(), file = new File([exportBlob], '鱼搭穿搭.png', { type: 'image/png' })
  if (!navigator.canShare?.({ files: [file] }) || !navigator.share) { saveExport(); message.info('图片已准备保存，可以在相册中分享。'); return }
  try { await navigator.share({ files: [file] }); stillSameAccount() } catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') return; message.info('暂时无法唤起分享，请使用保存图片。') }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void load(); timer = setInterval(() => { if (!document.hidden && mayPoll() && jobs.value.some(job => liveCreation(job) || job.status === 'UNKNOWN')) void refreshJobs() }, 5000) })
onUnmounted(() => { clearInterval(timer); clearExport() })
</script>

<template>
  <div class="creation-page">
    <PageTitle title="穿搭创作" />
    <a-skeleton v-if="loading" active :paragraph="{ rows: 5 }" />
    <template v-else>
      <a-alert v-if="error" type="error" :message="error" show-icon class="creation-alert"><template #action><a-button size="small" :loading="busy" @click="pending ? submit() : load()">{{ pending ? '核对提交结果' : '重试' }}</a-button></template></a-alert>
      <a-alert v-if="pending && !busy" type="warning" message="上次提交结果待确认" description="请先核对，避免重复创作。核对会沿用原来的提交记录。" show-icon class="creation-alert"><template #action><a-button :loading="busy" @click="submit">核对结果</a-button></template></a-alert>
      <div v-if="enabled" class="creation-layout">
        <main class="creation-work">
          <section class="creation-section">
            <header><h2>把衣柜，做成一张作品</h2><p>一套熟悉的衣服，换个方式记录。</p></header>
            <div class="creation-effects" role="group" aria-label="选择画面效果">
              <a-button v-for="item in creationCatalog?.templates" :key="item.id" type="text" class="creation-effect" :class="{ selected: templateId === item.id }" :disabled="locked" :aria-pressed="templateId === item.id" @click="templateId = item.id">
                <span class="creation-effect-art" :class="item.id"><img v-if="item.previewUrl" :src="mediaUrl(item.previewUrl)" alt="" /><span v-else class="creation-art-placeholder"><PictureOutlined /><small>效果示意</small></span><span v-if="templateId === item.id" class="creation-check"><CheckOutlined /></span></span>
                <strong>{{ item.name }}</strong><small>{{ item.available ? item.description : item.unavailableReason || '暂不可用' }}</small>
              </a-button>
            </div>
            <a-empty v-if="!creationCatalog?.templates.length" :image="null" description="效果正在准备，稍后再来看看" />
          </section>
          <section class="creation-section">
            <header class="creation-section-heading"><h2>用哪些衣物</h2><span>{{ selected.length }} / {{ maxGarments }} 件</span></header>
            <a-alert v-if="sourceError" type="warning" :message="sourceError" class="creation-alert" />
            <p v-if="source" class="creation-source">来自搭配「{{ source.name }}」</p>
            <div class="creation-selected">
              <a-button v-for="g in selected" :key="g.id" type="text" class="creation-garment" :disabled="locked" :aria-label="`移除${formatGarmentLabel(g)}`" @click="toggle(g)"><img :src="thumbUrl(artworkForGarment(g).url, 220)" :alt="formatGarmentLabel(g)" /><span>{{ formatGarmentLabel(g) }}</span><small>移除</small></a-button>
              <a-button class="creation-add" :disabled="locked" @click="openPicker"><PlusOutlined /><span>{{ selected.length ? '再选几件' : '从衣柜挑选' }}</span></a-button>
            </div>
          </section>
          <section v-if="template?.personRequired" class="creation-section">
            <header class="creation-section-heading"><h2>谁来穿</h2><a-button type="link" :disabled="locked" @click="router.push('/settings?section=personal')">管理形象</a-button></header>
            <div v-if="models.length" class="creation-models" role="group" aria-label="选择形象"><a-button v-for="model in models" :key="model.id" type="text" class="creation-model" :class="{ selected: model.id === baselineId }" :disabled="locked" :aria-pressed="model.id === baselineId" @click="baselineId = model.id"><img v-if="model.mediaUrl" :src="mediaUrl(model.mediaUrl)" alt="" /><span>{{ model.name || '我的形象' }}</span><CheckOutlined v-if="model.id === baselineId" /></a-button></div>
            <a-empty v-else description="先设置一个已确认的形象，也可以选择不需要人物的平铺效果"><a-button @click="router.push('/settings?section=personal')">设置形象</a-button></a-empty>
          </section>
          <section class="creation-section creation-options">
            <label v-if="lightOptions.length > 1"><span>画面光线</span><a-segmented v-model:value="light" :disabled="locked" :options="lightOptions" /></label>
            <a-collapse ghost><a-collapse-panel key="details" header="动作与补充"><a-form layout="vertical"><a-form-item v-if="template?.personRequired" label="动作"><a-select v-model:value="poseValue" :disabled="locked" :options="poseOptions" /></a-form-item><a-form-item label="补充说明"><a-textarea v-model:value="note" :disabled="locked" :maxlength="200" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：背景明亮一些，衣服颜色保持原样" /></a-form-item></a-form></a-collapse-panel></a-collapse>
          </section>
        </main>
        <aside class="creation-summary">
          <span class="creation-eyebrow">这一次的作品</span><h2>{{ template?.name || '选一种喜欢的效果' }}</h2><p>{{ selected.length }} 件衣物<span v-if="template?.personRequired && person"> · {{ person.name || '我的形象' }}</span></p><p class="creation-summary-note">3:4 图片 · 仅自己可见</p>
          <a-button type="primary" size="large" block :disabled="!!hint || !!pending" :loading="busy" @click="prepare">生成作品 · 1 次</a-button>
          <p v-if="hint" class="creation-hint" role="status">{{ hint }}</p>
          <p class="creation-cost creation-muted">与上身图共用图片次数。实际发送后，即使失败、取消或结果待确认也会使用 1 次。</p>
          <a-button type="link" @click="router.push('/help?article=08-creation')">了解创作与次数</a-button>
        </aside>
      </div>
      <a-empty v-else-if="!error" description="穿搭创作暂未开放，已有作品仍可查看和保存" />
      <section class="creation-history">
        <header class="creation-section-heading"><h2>我的作品</h2><a-button type="text" :loading="refreshing" @click="refreshJobs"><ReloadOutlined /> 刷新</a-button></header>
        <a-alert v-if="historyError" type="warning" :message="historyError" class="creation-alert" />
        <div v-if="jobs.length" class="creation-results"><article v-for="job in jobs" :key="job.id" class="creation-result"><div class="creation-result-art"><img v-if="job.status === 'SUCCEEDED' && job.mediaUrl" :src="mediaUrl(job.mediaUrl)" :alt="job.templateName" loading="lazy" /><div v-else class="creation-result-state"><a-spin v-if="liveCreation(job)" /><PictureOutlined v-else /><strong>{{ creationStatus(job) }}</strong><p>{{ job.errorMessage || (job.waitReason === 'FEATURE_DISABLED' ? '功能暂未开放，这次创作尚未发送，不会使用次数。' : job.status === 'UNKNOWN' ? '原调用可能已使用次数，确认前不会自动重做。' : liveCreation(job) ? '离开页面后也会继续' : '可以重新核对衣物后再创作') }}</p></div><AiBadge v-if="job.status === 'SUCCEEDED'" small /></div><div class="creation-result-copy"><strong>{{ job.templateName }}</strong><small>{{ new Date(job.createdAtMs).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</small><div class="creation-result-actions"><a-button v-if="job.canExport" size="small" @click="openExport(job)"><DownloadOutlined /> 保存 / 分享</a-button><a-button v-if="enabled && job.canRecreate" size="small" :disabled="locked" @click="recreate(job)">再做一张</a-button><a-button v-if="job.canCancel" size="small" @click="cancel(job)">取消</a-button><a-dropdown><a-button size="small" aria-label="更多作品操作">···</a-button><template #overlay><a-menu><a-menu-item v-if="job.status === 'SUCCEEDED'" @click="feedbackJob = job">效果有问题</a-menu-item><a-menu-item danger @click="remove(job)">删除记录</a-menu-item></a-menu></template></a-dropdown></div></div></article></div>
        <a-empty v-else-if="!historyError" description="第一张作品，从衣柜里的衣服开始" />
        <a-pagination v-if="total > 12" v-model:current="page" :total="total" :page-size="12" :show-size-changer="false" @change="refreshJobs" />
      </section>
    </template>
    <a-modal v-model:open="pickerOpen" title="从衣柜挑选" :footer="null" width="720px"><InputSearch v-model:value="search" placeholder="搜索已拥有的衣物" enter-button="搜索" @search="pickerPage = 1; loadCandidates()" /><a-spin :spinning="picking"><div class="creation-picker"><a-button v-for="g in candidates" :key="g.id" type="text" class="creation-garment" :class="{ selected: pickedIds.has(g.id) }" :aria-pressed="pickedIds.has(g.id)" :disabled="locked" @click="toggle(g)"><img :src="thumbUrl(artworkForGarment(g).url, 220)" alt="" loading="lazy" /><span>{{ formatGarmentLabel(g) }}</span><CheckOutlined v-if="pickedIds.has(g.id)" /></a-button></div><a-empty v-if="!candidates.length && !picking" description="暂时没有可以选择的衣物" /></a-spin><a-pagination v-if="pickerTotal > 24" v-model:current="pickerPage" :total="pickerTotal" :page-size="24" :show-size-changer="false" @change="loadCandidates" /><div class="creation-picker-footer"><span>已选 {{ selected.length }} 件</span><a-button type="primary" @click="pickerOpen = false">选好了</a-button></div></a-modal>
    <a-modal v-model:open="confirmOpen" title="确认这次创作" ok-text="确认生成 · 1 次" cancel-text="再看看" :confirm-loading="busy" :mask-closable="!busy" :closable="!busy" :cancel-button-props="{ disabled: busy || !!pending }" @ok="submit"><p>{{ template?.name }} · {{ selected.length }} 件衣物<span v-if="template?.personRequired"> · {{ person?.name || '我的形象' }}</span></p><p>会在实际发送时使用 1 次图片次数。发送后的失败、取消或结果待确认不自动返还。</p><p class="creation-muted">图片可能与实物有差异，完成后请核对衣物细节。</p></a-modal>
    <a-modal :open="!!exporting" title="保存与分享" :footer="null" width="520px" @cancel="exporting = null; clearExport()"><a-form layout="vertical"><a-form-item label="标题（可不填）"><a-input v-model:value="exportTitle" :maxlength="24" show-count placeholder="给这套搭配留句话" /></a-form-item><a-form-item><a-space><a-switch v-model:checked="brand" aria-label="显示鱼搭署名" /><span>显示鱼搭署名</span></a-space></a-form-item></a-form><a-alert v-if="exportError" type="error" :message="exportError" class="creation-alert" /><img v-if="exportUrl" :src="exportUrl" alt="最终导出效果，含标题与生成标识" class="creation-export-preview" /><a-button v-if="!exportUrl" block :loading="exportBusy" @click="previewExport">预览导出图片</a-button><a-space v-else class="creation-export-actions"><a-button type="primary" @click="saveExport"><DownloadOutlined /> 保存图片</a-button><a-button @click="shareExport"><ShareAltOutlined /> 分享</a-button></a-space><p class="creation-muted">保存和分享不使用图片次数。生成标识会保留。</p></a-modal>
    <a-modal :open="!!feedbackJob" title="哪里不合适？" ok-text="记录反馈" cancel-text="取消" :confirm-loading="feedbackBusy" @cancel="feedbackJob = null" @ok="feedback"><a-select v-model:value="feedbackReason" style="width: 100%" :options="[{ value: 'BAD_GARMENT', label: '衣物细节不对' }, { value: 'BAD_PERSON', label: '形象不一致' }, { value: 'BAD_LAYOUT', label: '构图不合适' }, { value: 'OTHER', label: '其他问题' }]" /></a-modal>
  </div>
</template>

<style scoped>
.creation-page { max-width: 1120px; margin: 0 auto; padding-bottom: 24px; }
.creation-alert { margin-bottom: 16px; }
.creation-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 28px; align-items: start; }
.creation-work { min-width: 0; }
.creation-section { margin-bottom: 24px; padding: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
.creation-section header h2 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -.4px; }
.creation-section header p { margin: 6px 0 20px; color: var(--muted); }
.creation-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.creation-section-heading h2 { margin: 0; font-size: 18px; }
.creation-section-heading > span, .creation-source { color: var(--muted); font-size: 12px; }
.creation-effects { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.creation-effect.ant-btn { height: auto; padding: 0; white-space: normal; text-align: left; color: var(--ink); }
.creation-effect-art { display: grid; place-items: center; position: relative; overflow: hidden; width: 100%; aspect-ratio: 3 / 4; border-radius: 12px; background: var(--surface-alt); border: 1px solid var(--line); }
.creation-effect-art img { width: 100%; height: 100%; object-fit: cover; }
.creation-effect.selected .creation-effect-art { outline: 2px solid var(--ink); outline-offset: 2px; }
.creation-effect strong { display: block; margin-top: 12px; font-size: 14px; }
.creation-effect small { display: block; color: var(--muted); line-height: 1.5; margin-top: 5px; font-size: 12px; }
.creation-art-placeholder { display: grid; justify-items: center; gap: 8px; color: var(--muted); font-size: 28px; }
.creation-check { position: absolute; right: 8px; top: 8px; width: 23px; height: 23px; display: grid; place-items: center; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; }
.creation-selected, .creation-models { display: flex; gap: 10px; overflow-x: auto; padding: 3px 3px 8px; }
.creation-garment.ant-btn { position: relative; display: flex; flex-direction: column; flex: 0 0 92px; gap: 5px; padding: 8px; height: auto; min-width: 0; white-space: normal; border: 1px solid var(--line); background: var(--surface-alt); color: var(--ink); border-radius: 12px; }
.creation-garment img { width: 100%; height: 100px; object-fit: contain; }
.creation-garment span { width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; }
.creation-garment small { color: var(--muted); font-size: 11px; }
.creation-garment.selected { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.creation-add.ant-btn { height: 142px; flex: 0 0 92px; display: flex; flex-direction: column; justify-content: center; gap: 12px; border-style: dashed; color: var(--muted); }
.creation-model.ant-btn { display: flex; align-items: center; gap: 8px; height: auto; padding: 8px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); }
.creation-model.selected { border-color: var(--ink); }
.creation-model img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; }
.creation-options > label { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.creation-options :deep(.ant-collapse-header) { padding-inline: 0 !important; }
.creation-options :deep(.ant-collapse-content-box) { padding-inline: 0 !important; }
.creation-summary { position: sticky; top: 24px; padding: 26px 0; }
.creation-eyebrow { font-size: 12px; color: var(--muted); }
.creation-summary h2 { margin: 8px 0; font-size: 24px; letter-spacing: -.5px; }
.creation-summary p { color: var(--muted); }
.creation-summary-note { margin-bottom: 24px; font-size: 12px; }
.creation-summary .ant-btn-lg { height: 48px; }
.creation-cost { margin-top: 16px; font-size: 12px; line-height: 1.7; }
.creation-hint { font-size: 12px; }
.creation-history { margin-top: 32px; }
.creation-results { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-bottom: 20px; }
.creation-result { min-width: 0; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: var(--surface); }
.creation-result-art { position: relative; aspect-ratio: 3 / 4; overflow: hidden; background: var(--surface-alt); }
.creation-result-art > img { width: 100%; height: 100%; object-fit: contain; }
.creation-result-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; gap: 12px; color: var(--muted); }
.creation-result-state p { margin: 0; font-size: 12px; line-height: 1.6; }
.creation-result-copy { padding: 14px; }
.creation-result-copy > strong, .creation-result-copy > small { display: block; }
.creation-result-copy > small { margin-top: 5px; color: var(--muted); font-size: 11px; }
.creation-result-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.creation-picker { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
.creation-picker-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
.creation-export-preview { display: block; width: 100%; max-height: 52vh; object-fit: contain; background: var(--surface-alt); border-radius: 10px; margin-bottom: 18px; }
.creation-export-actions { display: flex; justify-content: center; }
.creation-muted { font-size: 12px; color: var(--muted); line-height: 1.7; margin-top: 12px; }
@media (max-width: 767px) { .creation-layout { grid-template-columns: 1fr; gap: 0; }.creation-section { padding: 16px; margin-bottom: 14px; }.creation-effects { gap: 10px; }.creation-effect strong { font-size: 12px; }.creation-effect small { font-size: 11px; }.creation-summary { position: static; padding: 12px 4px 24px; }.creation-summary h2 { font-size: 20px; }.creation-summary-note { margin-bottom: 14px; }.creation-results { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.creation-result-copy { padding: 10px; }.creation-picker { grid-template-columns: repeat(3, minmax(0, 1fr)); }.creation-section header h2 { font-size: 18px; } }
</style>
