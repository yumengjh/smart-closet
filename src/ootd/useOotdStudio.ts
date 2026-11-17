// 上身图的选择与生成（原 OotdPage，server#271 拆出）：这套 + 谁来穿 + 姿势 + 穿法与更多，
// 准备（/api/ootd/preparations）→ 确认 → 提交（/api/ootd/jobs），过期形象提示与不确定提交的核对照旧。
// “做张图”页（TryMaker）与它共用 outfitId、baselineId、pose 三个值，记录与重试在 useOotdRecords。
import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { useBillingStore } from '../billing/store'
import { closetApi } from '../services/api'
import { platformRequest, PlatformRequestError, type Baseline, type Capability, type PoseCatalog, type PoseChoice, type RenderJob, type RenderSubmission, type Review } from '../services/platform'
import type { Outfit } from '../domain/outfit'
import { createUuid } from '../domain/id'
import { useProcessingStore } from '../stores/processing'
import { useSendOffStore } from '../stores/sendOff'

export type Preparation = { id: string; review: Review; expiresAt: number; quotaUnits: number; pose: { mode: string; name: string } | null }
// 穿法细节 (issue #48): per garment, only where it applies (上衣：塞法、挽袖；外套：扣/敞、挽袖) plus a short note.
// Defaults come from the recommendation's proportion rule (POST /api/wear-details/suggestions); '' means 由模型自然处理.
export const DETAIL_OPTIONS: Record<string, { key: string; label: string; options: { value: string; label: string }[] }[]> = {
  TOP: [{ key: 'tuck', label: '塞法', options: [{ value: '', label: '自动' }, { value: 'NONE', label: '不塞' }, { value: 'FULL', label: '全塞' }, { value: 'FRONT', label: '只塞前面' }] },
    { key: 'sleeves', label: '袖子', options: [{ value: '', label: '自然' }, { value: 'ROLLED', label: '挽起' }] }],
  OUTER: [{ key: 'closure', label: '门襟', options: [{ value: '', label: '自动' }, { value: 'CLOSED', label: '扣上' }, { value: 'OPEN', label: '敞开' }] },
    { key: 'sleeves', label: '袖子', options: [{ value: '', label: '自然' }, { value: 'ROLLED', label: '挽起' }] }],
}
export const ACCESSORY_OPTIONS = [{ value: 'ACCESSORY:EAR', label: '耳部' }, { value: 'ACCESSORY:NECK', label: '颈部' }, { value: 'ACCESSORY:WRIST', label: '手腕' }, { value: 'ACCESSORY:HAND_LEFT', label: '左手' }, { value: 'ACCESSORY:HAND_RIGHT', label: '右手' }, { value: 'ACCESSORY:TIE', label: '领带' }]

/** 次数用完时打开购买抽屉（收费关闭时不打开，按原报错显示）。 */
export async function offerImagePurchase(billing: ReturnType<typeof useBillingStore>, cause: unknown) {
  if (!(cause instanceof PlatformRequestError) || !['IMAGE_QUOTA_EXCEEDED', 'AI_DAILY_QUOTA_EXCEEDED'].includes(cause.code || '')) return false
  await billing.refresh()
  if (!billing.image?.enabled) return false
  billing.purchase = 'image'
  return true
}

export function useOotdStudio(shared: { outfitId: Ref<string>; baselineId: Ref<string>; pose: Ref<PoseChoice> }, hooks: { accepted?: (job: RenderJob) => void } = {}) {
  const billing = useBillingStore(), router = useRouter(), { modal } = App.useApp(), processing = useProcessingStore(), sendOff = useSendOffStore()
  const { outfitId, baselineId, pose } = shared
  const outfits = ref<Outfit[]>([]), baselines = ref<Baseline[]>([]), capabilities = ref<Capability[]>([]), poseCatalog = ref<PoseCatalog | null>(null)
  const model = ref(''), selected = ref<string[]>([]), multiLayer = ref(false), wearRoles = ref<Record<string, string>>({})
  const wearDetails = ref<Record<string, Record<string, string>>>({}), wearNote = ref(''), suggested = ref<Record<string, Record<string, string>>>({})
  const loading = ref(true), error = ref(''), busy = ref(false), review = ref<Review | null>(null)
  const preparation = ref<Preparation | null>(null), confirmOpen = ref(false), key = ref(createUuid())

  const current = computed(() => outfits.value.find(o => o.id === outfitId.value))
  const person = computed(() => baselines.value.find(b => b.id === baselineId.value))
  const available = computed(() => capabilities.value.filter(c => c.verified && c.purpose === 'OOTD'))
  const capability = computed(() => available.value.find(c => c.provider + ':' + c.model === model.value))
  const filledSlots = computed(() => review.value?.slots.filter(slot => slot.items.length || slot.state === 'CONFLICT' || slot.state === 'UNKNOWN') || [])
  const garments = computed(() => [...new Map((current.value?.scene.elements || []).filter(e => e.kind !== 'PERSON_PART').map(e => [e.garmentId, e])).values()])
  const hint = computed(() => !current.value ? '先选一套搭配' : !person.value ? '先设置谁来穿' : !capability.value ? '暂时没有可用的生成服务' : '')
  const poses = computed(() => [...(poseCatalog.value?.presets || []), ...(poseCatalog.value?.mine || [])])
  const poseName = computed(() => { const v = pose.value; if (v.mode === 'AUTO') return '自动'; return poses.value.find(p => p.id === v.id)?.name || '已选' })
  const detailGarments = computed(() => garments.value.filter(g => selected.value.includes(g.garmentId) && DETAIL_OPTIONS[g.role]))
  // One line for the confirmation: "白色 衬衫：全塞、袖子挽起；补充：领口解开一颗扣子".
  const wearSummary = computed(() => {
    const parts = detailGarments.value.flatMap(g => { const d = wearDetails.value[g.garmentId] || {}; const phrases = DETAIL_OPTIONS[g.role].filter(o => d[o.key]).map(o => `${o.key === 'tuck' ? '' : o.label}${o.options.find(x => x.value === d[o.key])?.label}`); return phrases.length ? [`${g.garmentLabel}：${phrases.join('、')}`] : [] })
    if (wearNote.value.trim()) parts.push(`补充：${wearNote.value.trim()}`)
    return parts.join('；')
  })
  function detail(id: string, name: string) { return wearDetails.value[id]?.[name] || '' }
  function setDetail(id: string, name: string, value: string) { const next = { ...(wearDetails.value[id] || {}) }; if (value) next[name] = value; else delete next[name]; wearDetails.value = { ...wearDetails.value, [id]: next } }
  function chosenDetails() { const out: Record<string, Record<string, string>> = {}; for (const id of selected.value) if (wearDetails.value[id] && Object.keys(wearDetails.value[id]).length) out[id] = wearDetails.value[id]; return out }
  async function suggestDetails() {
    const ids = garments.value.map(g => g.garmentId); if (!ids.length) return
    try { const r = await platformRequest<{ details: Record<string, Record<string, string>> }>('/api/wear-details/suggestions', 'POST', { garmentIds: ids }); suggested.value = r.details; wearDetails.value = JSON.parse(JSON.stringify(r.details)) } catch { /* defaults are optional */ }
  }

  async function load() {
    loading.value = true
    // 各取各的：创作效果也用这里的形象与姿势，一项失败不拖累其他项。
    const [o, b, c, p] = await Promise.allSettled([closetApi.outfits(), platformRequest<Baseline[]>('/api/me/person-baselines'), platformRequest<Capability[]>('/api/render-capabilities'), platformRequest<PoseCatalog>('/api/ootd/poses')])
    if (o.status === 'fulfilled') outfits.value = o.value
    if (b.status === 'fulfilled') baselines.value = b.value.filter(item => item.status === 'CONFIRMED')
    if (c.status === 'fulfilled') capabilities.value = c.value
    if (p.status === 'fulfilled') poseCatalog.value = p.value
    if (!available.value.some(item => item.provider + ':' + item.model === model.value)) model.value = available.value[0] ? available.value[0].provider + ':' + available.value[0].model : ''
    if (!baselines.value.some(m => m.id === baselineId.value)) baselineId.value = baselines.value.find(item => item.currentDefault)?.id || baselines.value[0]?.id || ''
    const failed = [o, b, c, p].find(item => item.status === 'rejected')
    error.value = failed ? failed.reason instanceof Error ? failed.reason.message : String(failed.reason) : ''
    loading.value = false
  }
  async function loadPoses() { try { poseCatalog.value = await platformRequest<PoseCatalog>('/api/ootd/poses') } catch { /* The picker keeps the last list. */ } }
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
  async function offerSubscription(cause: unknown) { const offered = await offerImagePurchase(billing, cause); if (offered) confirmOpen.value = false; return offered }
  async function prepare(useOlderBaseline = false) {
    if (!current.value || !person.value || !capability.value) return
    busy.value = true
    try {
      await billing.refresh()
      if (billing.image?.enabled && billing.image.freeRemainingToday <= 0) { billing.purchase = 'image'; return }
      await check(true)
      if (!review.value || review.value.blockers.length) return
      preparation.value = await platformRequest<Preparation>('/api/ootd/preparations', 'POST', body(useOlderBaseline)); key.value = createUuid(); confirmOpen.value = true
    } catch (e) {
      if (e instanceof PlatformRequestError && e.code === 'BASELINE_PROFILE_STALE') {
        modal.confirm({ title: '这位形象是按旧资料生成的', content: '个人资料改过之后，形象不会自动更新。仍用这位形象生成吗？', okText: '仍然使用', cancelText: '换一位', onOk: () => prepare(true) })
      } else if (!await offerSubscription(e)) error.value = e instanceof Error ? e.message : String(e)
    } finally { busy.value = false }
  }
  function chosenCards() { return garments.value.filter(g => selected.value.includes(g.garmentId)).map(g => ({ image: g.assetUrl, label: g.garmentLabel })) }
  function poseCard(fallback = false) { const id = pose.value.mode === 'AUTO' ? '' : pose.value.id; return poses.value.find(p => p.id === id) || (fallback ? poseCatalog.value?.presets[0] || null : null) }
  // Instead of a spinner on this page, the outfit is handed off with a short ritual and tracked in the processing centre.
  function handOff(job: RenderJob) {
    const cards = chosenCards()
    sendOff.launch({ title: [`${cards.length} 件衣物`, preparation.value?.pose?.name || '自动动作'].join(' · '), cards, person: person.value?.mediaUrl || undefined, pose: poseCard() })
    processing.trackRender(job, true)
  }
  // Plays the whole hand-off (cards, dressing, fly-in, finished notice) without calling any model.
  function rehearse() {
    const chosen = chosenCards(), card = poseCard(true)
    const cards = chosen.length ? chosen : ['上衣', '下装', '鞋子'].map(label => ({ label }))
    sendOff.launch({ title: `模拟演示 · ${cards.length} 件衣物 · ${card?.name || '自动动作'}`, cards, person: person.value?.mediaUrl || undefined, pose: card })
    processing.simulateRender(person.value?.mediaUrl || undefined)
  }
  async function accepted(job: RenderJob) { handOff(job); confirmOpen.value = false; preparation.value = null; error.value = ''; void billing.refresh(); hooks.accepted?.(job) }
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
        } catch { error.value = '连接仍未恢复，暂时无法确认是否已提交。请先到“我的图”看看生成记录，不要关闭这个窗口重新准备。' }
      } else if (!await offerSubscription(e)) error.value = e instanceof Error ? e.message : String(e)
    } finally { busy.value = false }
  }
  function moreAction(name: string) { if (name === 'check') void check(); else if (name === 'rehearse') rehearse(); else if (name === 'manage') void router.push('/settings?section=personal') }

  return reactive({
    outfits, baselines, capabilities, poseCatalog, model, selected, multiLayer, wearRoles, wearDetails, wearNote, suggested,
    loading, error, busy, review, preparation, confirmOpen,
    current, person, available, capability, filledSlots, garments, hint, poseName, detailGarments, wearSummary,
    detail, setDetail, load, loadPoses, check, prepare, generate, rehearse, moreAction,
  })
}
export type OotdStudio = ReturnType<typeof useOotdStudio>
